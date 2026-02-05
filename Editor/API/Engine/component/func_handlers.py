import math
import statistics
import time
from logger import logger
from .exporter import write_csv_log, send_graph_data
from pymavlink import mavutil

# ==========================================
# 共通インターフェース: 
# def handler(evaluator, name, args, node, now):
# ==========================================

class CalcHandlers:
    """数値計算・論理計算系（引数は事前に評価済み）"""
    @staticmethod
    def execute(evaluator, name, args, node, now):
        try:
            if name == "abs":      return abs(args[0])
            if name == "round":    return round(args[0], int(args[1]) if len(args) > 1 else 0)
            if name == "ceil":     return math.ceil(args[0])
            if name == "floor":    return math.floor(args[0])
            if name == "sqrt":     return math.sqrt(args[0]) if args[0] >= 0 else None
            if name == "is_nan":   return math.isnan(args[0])
            if name == "clamp":    return max(args[1], min(args[0], args[2]))
            if name == "within":   return abs(args[0] - args[1]) <= args[2]
            if name == "sin":      return math.sin(args[0])
            if name == "cos":      return math.cos(args[0])
            if name == "tan":      return math.tan(args[0])
            if name == "radians":  return math.radians(args[0])
            if name == "degrees":  return math.degrees(args[0])
            
            if name == "log":
                x, base = args[0], (args[1] if len(args) > 1 else math.e)
                return math.log(x, base) if x > 0 and base > 0 and base != 1 else None
            
            if name == "hysteresis":
                val, on_thresh, off_thresh = args[0], args[1], args[2]
                fid = f"hyst_{id(node)}"
                is_active = evaluator.states.get(fid, False)
                if is_active:
                    if val < off_thresh: is_active = False
                else:
                    if val > on_thresh: is_active = True
                evaluator.states[fid] = is_active
                return is_active

        except Exception as e:
            logger.error(f"Calc Error [{name}]: {e}")
            return None

class TimeHandlers:
    """時間・履歴統計系（引数は生のNode）"""
    @staticmethod
    def execute(evaluator, name, raw_args, node, now):
        target_node = raw_args[0]
        window = node.get("window", 1.0)

        history = evaluator._get_window_history(target_node, now, window)
        if not history: return None
        
        values = [h[1] for h in history]
        times = [h[0] for h in history]

        if name == "average": return statistics.mean(values)
        if name == "sum":     return sum(values)
        if name == "min":     return min(values)
        if name == "max":     return max(values)
        if name == "hold":    return all(values)
        
        if name == "duration":
            last_false = next((t for t, v in reversed(history) if not v), None)
            return now - last_false if last_false is not None else now - times[0]

        if name == "prev":
            full_hist = evaluator._get_window_history(target_node, now, None)
            past_data = [v for t, v in full_hist if (now - t) >= window]
            return past_data[-1] if past_data else None

        if name == "delta":
            full_hist = evaluator._get_window_history(target_node, now, None)
            past_data = [v for t, v in full_hist if (now - t) >= window]
            prev_val = past_data[-1] if past_data else None
            return values[-1] - prev_val if prev_val is not None else 0

        if name == "rate":
            if len(values) < 2: return 0
            dt = times[-1] - times[0]
            return (values[-1] - values[0]) / dt if dt > 0 else 0

        if name == "trend":
            if len(values) < 2: return 0
            n = len(values)
            sum_x, sum_y = sum(times), sum(values)
            sum_xy = sum(t * v for t, v in zip(times, values))
            sum_xx = sum(t * t for t in times)
            denom = (n * sum_xx - sum_x**2)
            return (n * sum_xy - sum_x * sum_y) / denom if denom != 0 else 0

        return None

class DroneHandlers:
    """ドローン制御系（引数は評価済み）"""
    @staticmethod
    def execute(evaluator, name, args, node, now):
        if not evaluator.drone: return False
        
        # --- クールダウン管理 ---
        is_oneshot = name in ["takeoff", "land", "arm", "disarm", "set_mode", "command","set_velocity","goto"]
        
        if is_oneshot:
            func_id = f"ctrl_{id(node)}"
            cooldowns = evaluator.states.get("_cooldowns", {})
            last_exec = cooldowns.get(func_id, 0)
            if (now - last_exec) <= 3.0: 
                return False

        # --- コマンド実行（DroneControllerの改善メソッドを呼び出し） ---
        success = False
        try:
            if name == "takeoff":
                success = evaluator.drone.takeoff(altitude=args[0])
            
            elif name == "land":
                evaluator.drone.execute_command(mavutil.mavlink.MAV_CMD_NAV_LAND)
                success = True
            
            elif name == "arm":
                # 改良した待機付き ARM メソッドを使用
                success = evaluator.drone.arm_and_wait()
            
            elif name == "disarm":
                # MAV_CMD_COMPONENT_ARM_DISARM = 400, p1=0 は Disarm
                evaluator.drone.execute_command(mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, p1=0)
                success = True
            
            elif name == "set_mode":
                # 改良した待機付き set_mode メソッドを使用
                success = evaluator.drone.set_mode(str(args[0]))
            
            elif name == "set_velocity":
                vx = args[0] if len(args) > 0 else 0
                vy = args[1] if len(args) > 1 else 0
                vz = args[2] if len(args) > 2 else 0
                yr = args[3] if len(args) > 3 else 0
                evaluator.drone.update_setpoint(vx=vx, vy=vy, vz=vz, yaw_rate=yr)
                success = True 
            
            elif name == "goto":
                x = args[0] if len(args) > 0 else 0
                y = args[1] if len(args) > 1 else 0
                z = args[2] if len(args) > 2 else 0
                yaw = args[3] if len(args) > 3 else 0
                evaluator.drone.update_setpoint(x=x, y=y, z=z, yaw=yaw)
                success = True
            
            elif name == "command":
                cmd_id = int(args[0])
                params = args[1:] + [0] * (7 - len(args[1:]))
                evaluator.drone.execute_command(cmd_id, *params)
                success = True

            # 実行成功時のクールダウン更新
            if success and is_oneshot:
                logger.info(f"Drone Action Success: {name} {args}")
                cooldowns[func_id] = now
                evaluator.states["_cooldowns"] = cooldowns
                return True
            elif is_oneshot:
                logger.warning(f"Drone Action Failed or Rejected: {name}")
                
        except Exception as e:
            logger.error(f"Drone Command Error: {e}")
            return False

        return success

class ExportHandlers:
    """外部出力系"""
    @staticmethod
    def execute(evaluator, name, args, node, now):
        if name == "export_txt":
            return write_csv_log(args[0], args[1], args[2])
        if name == "export_graph":
            return send_graph_data(args[0], args[1], args[2], args[3])
        return False