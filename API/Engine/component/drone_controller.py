import time
from pymavlink import mavutil
from logger import logger

class DroneController:
    def __init__(self, app_state):
        self.app_state = app_state

    @property
    def master(self):
        return self.app_state.mavlink

    def is_connected(self):
        return self.master is not None

    # --- 基本操作系 ---

    def set_mode(self, mode_name):
        """フライトモードを変更し、変更が適用されるまで待機します"""
        if not self.is_connected():
            logger.warning(f"Failed to set mode '{mode_name}': Drone not connected")
            return False

        mode_id = self.master.mode_mapping().get(mode_name)
        if mode_id is None:
            logger.warning(f"Unknown mode: {mode_name}")
            return False

        logger.info(f"Setting mode to: {mode_name} (ID: {mode_id})")
        self.master.set_mode(mode_id)

        # モードが実際に切り替わったか確認（タイムアウト3秒）
        start_time = time.time()
        while time.time() - start_time < 3.0:
            # 内部の heartbeat メッセージから最新のモードを確認
            if self.master.flightmode == mode_name:
                logger.info(f"Mode changed to {mode_name} successfully")
                return True
            time.sleep(0.2)
        
        logger.warning(f"Mode change to {mode_name} timed out")
        return False

    def arm_and_wait(self, timeout=10):
        """モーターを有効化（ARM）し、完了するまで待機します"""
        if not self.is_connected():
            return False

        logger.info("Sending ARM command...")
        self.master.arducopter_arm()
        
        # モーターがARM状態になるまで待機
        res = self.master.motors_armed_wait(timeout=timeout)
        if res:
            logger.info("Motors ARMED")
            return True
        else:
            logger.error("Arming failed or timed out")
            return False

    def takeoff(self, altitude):
        """
        指定した高度(m)へ離陸します。
        GUIDEDモードかつARM状態である必要があります。
        """
        if not self.is_connected():
            return False

        # 離陸コマンドの送信 (MAV_CMD_NAV_TAKEOFF = 22)
        # Param 7 が目標高度です
        logger.info(f"Taking off to {altitude}m...")
        self.execute_command(
            mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
            p7=altitude
        )
        
        # コマンドが受理されたかACK（承認）を確認（オプション）
        # ここでは簡易的にログ出力のみ行います
        return True

    # --- コマンド・制御系 ---

    def execute_command(self, command_id, p1=0, p2=0, p3=0, p4=0, p5=0, p6=0, p7=0):
        """COMMAND_LONG を送信します"""
        if not self.is_connected():
            logger.warning(f"Failed to execute command {command_id}: Drone not connected")
            return

        logger.info(f"Sending Command Long: ID={command_id}, Params=({p1}, {p2}, {p3}, {p4}, {p5}, {p6}, {p7})")
        
        self.master.mav.command_long_send(
            self.master.target_system,
            self.master.target_component,
            command_id,
            0,  # confirmation
            p1, p2, p3, p4, p5, p6, p7
        )

    def update_setpoint(self, x=None, y=None, z=None, vx=None, vy=None, vz=None, 
                        yaw=None, yaw_rate=None, 
                        coordinate_frame=mavutil.mavlink.MAV_FRAME_LOCAL_NED):
        """位置・速度・機首方位の目標値を更新します"""
        if not self.is_connected():
            logger.warning("Failed to update setpoint: Drone not connected")
            return

        # マスク生成 (1=無視、0=有効)
        mask = 0b000000000000
        
        # 加速度(6-8)とForce(9)は常に無視
        mask |= (1<<6) | (1<<7) | (1<<8) | (1<<9)

        # 引数がNoneの項目をマスク（無視設定にする）
        if x is None: mask |= (1<<0)
        if y is None: mask |= (1<<1)
        if z is None: mask |= (1<<2)
        if vx is None: mask |= (1<<3)
        if vy is None: mask |= (1<<4)
        if vz is None: mask |= (1<<5)
        if yaw is None: mask |= (1<<10)
        if yaw_rate is None: mask |= (1<<11)

        # Noneを0に変換 (送信データ用)
        vals = [x, y, z, vx, vy, vz, 0, 0, 0, 0, yaw, yaw_rate]
        c = [v if v is not None else 0 for v in vals]

        logger.debug(f"Setpoint update: Frame={coordinate_frame}, Pos=({c[0]},{c[1]},{c[2]}), Vel=({c[3]},{c[4]},{c[5]}), Yaw={c[10]}")

        self.master.mav.set_position_target_local_ned_send(
            0, # time_boot_ms
            self.master.target_system,
            self.master.target_component,
            coordinate_frame,
            mask,
            c[0], c[1], c[2], # Pos
            c[3], c[4], c[5], # Vel
            0, 0, 0,          # Accel
            c[10], c[11]      # Yaw, Rate
        )