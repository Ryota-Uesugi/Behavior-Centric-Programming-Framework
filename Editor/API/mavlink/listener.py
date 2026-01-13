import time
from config import IS_REPLAY_MODE
from .connection import connect
from .replay import replay_log
from logger import logger


def start(app):
    logger.info("Waiting for stream to start")

    while app.should_run and not app.stream_active:
        time.sleep(0.1)

    if not app.should_run:
        logger.info("Received stop request before startup")
        return

    logger.info("Stream started")

    if IS_REPLAY_MODE:
        logger.info("Starting in replay mode")
        try:
            replay_log(app)
        except Exception:
            logger.exception("Exception occurred during replay processing")
        return

    logger.info("Starting in real-time mode")

    while app.should_run:
        if not app.mavlink:
            try:
                connect(app)
            except Exception:
                logger.exception("Exception occurred during MAVLink connection")
                time.sleep(1)
                continue

        try:
            msg = app.mavlink.recv_match(blocking=False)
        except Exception:
            logger.exception("Exception occurred during MAVLink reception")
            time.sleep(0.5)
            continue

        if msg:
            try:
                payload = msg.to_dict()
                payload["_ts"] = time.time()
                app.current_state[msg.get_type()] = payload
            except Exception:
                logger.exception("Exception occurred while processing MAVLink message")
        else:
            time.sleep(0.005)

    logger.info("Stream loop finished")