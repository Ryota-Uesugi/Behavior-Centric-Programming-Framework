import asyncio
import json
import time
from logger import logger
from config import BROADCAST_INTERVAL, CURRENT_RUN_MODE, RunMode

# ==========================================
# 設定: 速度上限と計算バジェット
# ==========================================
TARGET_HZ = 10
MIN_LOOP_PERIOD = 1.0 / TARGET_HZ
OS_COMPUTE_BUDGET_SEC = 0.01

async def _send_to_all(websockets, msg_str):
    if not websockets:
        return
    await asyncio.gather(
        *[ws.send_str(msg_str) for ws in list(websockets)],
        return_exceptions=True,
    )

# 【修正1】 引数に node_id を追加
async def notify_condition_result(app_state, msg_type, name, value, setting, node_id=None):
    """
    評価結果を通知する
    """
    try:
        msg = json.dumps({
            "type": msg_type,
            "value": value,
            "name": setting.get("name"),
            "id": name,
            "node_id": node_id  # JSONに含める
        }, ensure_ascii=False)
        await _send_to_all(app_state.websockets, msg)
    except Exception:
        logger.exception("Failed to notify condition result")

async def run_control_loop(app_state, engine):
    logger.info(f"制御・配信ループを開始します。モード: {CURRENT_RUN_MODE.name}")
    logger.info(f"設定: 上限{TARGET_HZ}Hz / 計算バジェット{OS_COMPUTE_BUDGET_SEC*1000:.1f}ms")

    prev_serialized = ""
    last_broadcast_time = 0.0

    while app_state.should_run:
        loop_start_perf = time.perf_counter()
        
        # ---------------------------------------------------------
        # 1. OSカーネル実行 (Kernel Tick)
        # ---------------------------------------------------------
        try:
            events = engine.evaluate(loop_start_perf, budget=OS_COMPUTE_BUDGET_SEC)

            if events:
                # 【修正2】 5つの変数で受け取るように変更 (node_idを追加)
                for msg_type, name, value, setting, node_id in events:
                    asyncio.create_task(
                        notify_condition_result(app_state, msg_type, name, value, setting, node_id)
                    )
        except TypeError:
            try:
                events = engine.evaluate(loop_start_perf)
            except Exception:
                logger.exception("Kernel evaluation Error")
        except ValueError:
            # アンパックエラー時の詳細ログ
            logger.exception("Unpack Error: Engine returned unexpected number of values.")
        except Exception:
            logger.exception("Kernel evaluation Error")

        # ---------------------------------------------------------
        # 2. 低速配信パート (WebSocket Broadcast)
        # ---------------------------------------------------------
        current_time = time.time()
        
        if CURRENT_RUN_MODE != RunMode.MATH:
            if current_time - last_broadcast_time >= BROADCAST_INTERVAL:
                if app_state.current_state and app_state.websockets:
                    try:
                        for msg_type, payload in app_state.current_state.items():
                            if isinstance(payload, dict) and msg_type not in app_state.mavlink_schema:
                                app_state.mavlink_schema[msg_type] = list(payload.keys())
                    except Exception:
                        pass

                    try:
                        serialized = json.dumps(app_state.current_state, default=str, ensure_ascii=False)
                        if serialized != prev_serialized:
                            asyncio.create_task(_send_to_all(app_state.websockets, serialized))
                            prev_serialized = serialized
                            last_broadcast_time = current_time 
                    except Exception:
                        logger.error("State serialization failed")

        # ---------------------------------------------------------
        # 3. 終了判定 / 4. 周期調整
        # ---------------------------------------------------------
        if CURRENT_RUN_MODE == RunMode.REPLAY and app_state.replay_finished:
            logger.info("リプレイ終了")
            break

        loop_end_perf = time.perf_counter()
        elapsed = loop_end_perf - loop_start_perf
        sleep_time = MIN_LOOP_PERIOD - elapsed

        if sleep_time > 0:
            await asyncio.sleep(sleep_time)
        else:
            await asyncio.sleep(0)

    logger.info("ループ終了")