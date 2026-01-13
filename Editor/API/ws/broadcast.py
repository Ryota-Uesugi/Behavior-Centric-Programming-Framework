import asyncio
import json
import time
from logger import logger
from config import BROADCAST_INTERVAL, IS_REPLAY_MODE

async def _send_to_all(websockets, msg_str):
    """
    Common function to send a message to all WebSocket clients.
    """
    if not websockets:
        return
    # Converting to list() is necessary to prevent errors caused by elements 
    # being removed (disconnections) during iteration.
    await asyncio.gather(
        *[ws.send_str(msg_str) for ws in list(websockets)],
        return_exceptions=True,
    )

async def notify_condition_result(app_state, idx, value, setting):
    msg = json.dumps({
        "type": "condition_result",
        "value": value,
        "name": setting.get("name"),
        "idx": idx # It is common practice to include idx for debugging purposes
    }, ensure_ascii=False)
    await _send_to_all(app_state.websockets, msg)

async def run_control_loop(app_state, engine):
    """
    Optimized main loop integrating control logic and data broadcasting.
    """
    logger.info("Starting control/broadcast loop (run_control_loop)")
    
    CONTROL_HZ = 10
    CONTROL_PERIOD = 1.0 / CONTROL_HZ
    
    # Calculate broadcast throttling interval (prevent division by zero)
    broadcast_divider = max(1, int(CONTROL_HZ * BROADCAST_INTERVAL))

    loop_count = 0
    prev_serialized = ""

    while app_state.should_run:
        loop_start = time.time()
        loop_count += 1
        
        # ---------------------------------------------------------
        # 1. High-speed Control Part (Engine Evaluate)
        # ---------------------------------------------------------
        if app_state.current_state: 
            try:
                # The Evaluator is cached and reused within engine.evaluate
                events = engine.evaluate(loop_start)

                if events:
                    for idx, value, setting in events:
                        # Spawn a task to avoid blocking the loop
                        asyncio.create_task(
                            notify_condition_result(app_state, idx, value, setting)
                        )
            except Exception:
                logger.exception("Engine evaluation Error")

        # ---------------------------------------------------------
        # 2. Low-speed Broadcast Part (WebSocket Broadcast)
        # ---------------------------------------------------------
        if loop_count % broadcast_divider == 0:
            if app_state.current_state and app_state.websockets:
                # Schema update process
                try:
                    for msg_type, payload in app_state.current_state.items():
                        if isinstance(payload, dict) and msg_type not in app_state.mavlink_schema:
                            app_state.mavlink_schema[msg_type] = list(payload.keys())
                except Exception:
                    pass

                # Serialize and transmit the entire state
                try:
                    serialized = json.dumps(app_state.current_state, default=str, ensure_ascii=False)
                    if serialized != prev_serialized:
                        asyncio.create_task(_send_to_all(app_state.websockets, serialized))
                        prev_serialized = serialized
                except Exception:
                    logger.error("State serialization failed")

        # ---------------------------------------------------------
        # 3. Termination Check
        # ---------------------------------------------------------
        if IS_REPLAY_MODE and app_state.replay_finished:
            logger.info("Replay finished")
            break

        # ---------------------------------------------------------
        # 4. Cycle Adjustment (Frequency Control)
        # ---------------------------------------------------------
        elapsed = time.time() - loop_start
        sleep_time = CONTROL_PERIOD - elapsed
        if sleep_time > 0:
            await asyncio.sleep(sleep_time)
        else:
            # Warning if processing is lagging (Speculation: If this occurs frequently, consider lowering the HZ)
            if loop_count % 100 == 0:
                logger.warning(f"Control loop lag detected: {elapsed:.4f}s")
            await asyncio.sleep(0) # Minimal yield to event loop

    logger.info("Loop finished")