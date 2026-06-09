import json
import time
import os
from config import CONNECTION_STRING, LOG_DIR
from logger import logger


def replay_log(app_state):
    logger.info("リプレイ処理を開始します")

    log_path = (
        CONNECTION_STRING
        if os.path.isabs(CONNECTION_STRING)
        else os.path.join(LOG_DIR, CONNECTION_STRING)
    )

    logger.info("リプレイログパス: %s", log_path)

    if not os.path.isfile(log_path):
        logger.error("リプレイログが存在しません")
        app_state.should_run = False
        return

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        logger.exception("リプレイログの読み込みに失敗しました")
        app_state.should_run = False
        return

    logger.info("リプレイログ読み込み完了（件数=%d）", len(data))

    prev_ts = None
    frame = 0

    for entry in data:
        if not app_state.should_run:
            logger.info("should_run=False を検出、リプレイ中断")
            break

        ts = entry.get("_ts", time.time())

        if prev_ts is not None:
            sleep_time = max(0, ts - prev_ts)
            if sleep_time > 0:
                time.sleep(sleep_time)

        prev_ts = ts

        state = entry.get("state", entry)
        app_state.current_state.update(state)

        frame += 1
        if frame % 100 == 0:
            logger.debug("リプレイ進行中: frame=%d", frame)

    app_state.replay_finished = True
    logger.info("リプレイ完了（総フレーム=%d）", frame)
