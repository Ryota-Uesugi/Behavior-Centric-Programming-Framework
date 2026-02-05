import time
# configから モード定義(RunMode) と 現在のモード(CURRENT_RUN_MODE) をインポート
from config import CURRENT_RUN_MODE, RunMode
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

    # ---------------------------------------------------------
    # Replay Mode: ログ再生
    # ---------------------------------------------------------
    if CURRENT_RUN_MODE == RunMode.REPLAY:
        logger.info("【Replay Mode】ログ再生モードで起動")
        try:
            replay_log(app)
        except Exception:
            logger.exception("リプレイ処理中に例外が発生しました")
        return

    # ---------------------------------------------------------
    # Math Mode: 外部入力なし (評価ループのみ実行させるための待機)
    # ---------------------------------------------------------
    elif CURRENT_RUN_MODE == RunMode.MATH:
        logger.info("【Math Mode】計算評価モードで起動 (外部入力なし)")
        
        # 外部からのデータ更新は行わず、アプリが終了するまでループを維持する
        # ※ 推測: 評価ループ自体は別スレッドまたはメインスレッドの別の場所で
        #    app.current_state を参照して動いていると仮定しています。
        while app.should_run:
            time.sleep(1.0)
        
        logger.info("Mathモードを終了しました")
        return

    # ---------------------------------------------------------
    # Mavlink Mode: リアルタイム受信
    # ---------------------------------------------------------
    elif CURRENT_RUN_MODE == RunMode.MAVLINK:
        logger.info("【Mavlink Mode】リアルタイム受信モードで起動")

        while app.should_run:
            # 1. 未接続なら接続を試行
            if not app.mavlink:
                try:
                    connect(app)
                except Exception:
                    logger.exception("MAVLink 接続処理で例外が発生しました")
                    time.sleep(1)
                    continue

            # 2. メッセージ受信
            try:
                msg = app.mavlink.recv_match(blocking=False)
            except Exception:
                logger.exception("MAVLink 受信中に例外が発生しました")
                time.sleep(0.5)
                continue

            # 3. ペイロード処理
            if msg:
                try:
                    payload = msg.to_dict()
                    payload["_ts"] = time.time()
                    app.current_state[msg.get_type()] = payload
                except Exception:
                    logger.exception("MAVLink メッセージ処理中に例外が発生しました")
            else:
                # メッセージがない場合は少し待機してCPU負荷を下げる
                time.sleep(0.005)

    logger.info("ストリームループを終了しました")