import asyncio
import json
import time
from logger import logger
from config import BROADCAST_INTERVAL, IS_REPLAY_MODE

async def _send_to_all(websockets, msg_str):
    """
    全WebSocketクライアントにメッセージを送信する共通関数
    """
    if not websockets:
        return
    # list()化は反復中の要素削除（切断）によるエラーを防ぐために必要
    await asyncio.gather(
        *[ws.send_str(msg_str) for ws in list(websockets)],
        return_exceptions=True,
    )

async def notify_condition_result(app_state, idx, value, setting):
    msg = json.dumps({
        "type": "condition_result",
        "value": value,
        "name": setting.get("name"),
        "idx": idx # デバッグ用にidxも含めるのが一般的
    }, ensure_ascii=False)
    await _send_to_all(app_state.websockets, msg)

async def run_control_loop(app_state, engine):
    """
    制御と配信を統合したメインループ (最適化版)
    """
    logger.info("制御・配信ループ(run_control_loop)を開始します")
    
    CONTROL_HZ = 10
    CONTROL_PERIOD = 1.0 / CONTROL_HZ
    
    # 配信間引き計算 (0除算防止)
    broadcast_divider = max(1, int(CONTROL_HZ * BROADCAST_INTERVAL))

    loop_count = 0
    prev_serialized = ""

    while app_state.should_run:
        loop_start = time.time()
        loop_count += 1
        
        # ---------------------------------------------------------
        # 1. 高速制御パート (Engine Evaluate)
        # ---------------------------------------------------------
        if app_state.current_state: 
            try:
                # engine.evaluate 内で Evaluator がキャッシュ再利用される
                events = engine.evaluate(loop_start)

                if events:
                    for idx, value, setting in events:
                        # タスクを投げてループを止めない
                        asyncio.create_task(
                            notify_condition_result(app_state, idx, value, setting)
                        )
            except Exception:
                logger.exception("Engine evaluation Error")

        # ---------------------------------------------------------
        # 2. 低速配信パート (WebSocket Broadcast)
        # ---------------------------------------------------------
        if loop_count % broadcast_divider == 0:
            if app_state.current_state and app_state.websockets:
                # スキーマの更新処理
                try:
                    for msg_type, payload in app_state.current_state.items():
                        if isinstance(payload, dict) and msg_type not in app_state.mavlink_schema:
                            app_state.mavlink_schema[msg_type] = list(payload.keys())
                except Exception:
                    pass

                # 全体状態のシリアライズと送信
                try:
                    serialized = json.dumps(app_state.current_state, default=str, ensure_ascii=False)
                    if serialized != prev_serialized:
                        asyncio.create_task(_send_to_all(app_state.websockets, serialized))
                        prev_serialized = serialized
                except Exception:
                    logger.error("State serialization failed")

        # ---------------------------------------------------------
        # 3. 終了判定
        # ---------------------------------------------------------
        if IS_REPLAY_MODE and app_state.replay_finished:
            logger.info("リプレイ終了")
            break

        # ---------------------------------------------------------
        # 4. 周期調整
        # ---------------------------------------------------------
        elapsed = time.time() - loop_start
        sleep_time = CONTROL_PERIOD - elapsed
        if sleep_time > 0:
            await asyncio.sleep(sleep_time)
        else:
            # 処理が追いついていない場合の警告（憶測：頻発する場合はHZを下げる検討が必要）
            if loop_count % 100 == 0:
                logger.warning(f"Control loop lag detected: {elapsed:.4f}s")
            await asyncio.sleep(0) # 最小限の譲渡

    logger.info("ループ終了")