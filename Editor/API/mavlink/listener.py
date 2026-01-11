import time
from config import IS_REPLAY_MODE
from .connection import connect
from .replay import replay_log
from logger import logger


def start(app):
    logger.info("ストリーム開始待機中")

    while app.should_run and not app.stream_active:
        time.sleep(0.1)

    if not app.should_run:
        logger.info("起動前に停止要求を受信")
        return

    logger.info("ストリーム開始")

    if IS_REPLAY_MODE:
        logger.info("リプレイモードで起動")
        try:
            replay_log(app)
        except Exception:
            logger.exception("リプレイ処理中に例外が発生しました")
        return

    logger.info("リアルタイム受信モードで起動")

    while app.should_run:
        if not app.mavlink:
            try:
                connect(app)
            except Exception:
                logger.exception("MAVLink 接続処理で例外が発生しました")
                time.sleep(1)
                continue

        try:
            msg = app.mavlink.recv_match(blocking=False)
        except Exception:
            logger.exception("MAVLink 受信中に例外が発生しました")
            time.sleep(0.5)
            continue

        if msg:
            try:
                payload = msg.to_dict()
                payload["_ts"] = time.time()
                app.current_state[msg.get_type()] = payload
            except Exception:
                logger.exception("MAVLink メッセージ処理中に例外が発生しました")
        else:
            time.sleep(0.005)

    logger.info("ストリームループを終了しました")
