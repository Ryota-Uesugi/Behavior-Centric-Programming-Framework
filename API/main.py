import signal
import threading
import asyncio
from aiohttp import web
from config import HTTP_HOST, HTTP_PORT
from config import AppState
from Engine.EvalKernel import EvalEngine
from mavlink.listener import start as start_mavlink
from api.rest import *
from ws.handler import websocket_handler
from ws.broadcast import run_control_loop
from middleware import cors_middleware
from logger import logger

def main():
    logger.info("サーバー起動処理を開始します")

    state = AppState()
    engine = EvalEngine(state)

    state.cached_settings = load_setting() 
    state.cached_definition = load_definition()
    logger.info("設定をロードしました: %d 件", len(state.cached_settings))

    def shutdown(sig, frame):
        logger.info("終了シグナルを受信しました: %s", sig)
        state.should_run = False
        try:
            # 必要であれば engine.finalize() 等を実装
            logger.info("Engine を正常に終了しました")
        except Exception:
            logger.exception("終了処理中に例外が発生しました")
        raise SystemExit

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info("MAVLink リスナースレッドを起動します")
    threading.Thread(
        target=start_mavlink,
        args=(state,),
        daemon=True
    ).start()

    app = web.Application(middlewares=[cors_middleware])
    app["state"] = state

    app.router.add_get("/api/state", get_state)
    app.router.add_get("/api/ast", get_ast)
    app.router.add_get("/api/settings", get_settings)
    app.router.add_post("/api/settings", post_settings)
    app.router.add_get("/api/mavlink/last", get_mavlink_schema)
    app.router.add_delete("/api/settings/{type}/{index}", delete_settings)
    app.router.add_get("/ws/events", websocket_handler)

    async def startup(app):
        logger.info("aiohttp startup 処理開始")
        try:
            # 引数から drone_controller を削除
            app["task"] = asyncio.create_task(
                run_control_loop(state, engine)
            )
            logger.info("run_control_loop タスクを開始しました")
        except Exception:
            logger.exception("startup 処理中に例外が発生しました")
            raise

    async def cleanup(app):
        logger.info("aiohttp cleanup 処理開始")
        task = app.get("task")
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                logger.info("run_control_loop タスクをキャンセルしました")
            except Exception:
                logger.exception("cleanup 中に例外が発生しました")

    app.on_startup.append(startup)
    app.on_cleanup.append(cleanup)

    logger.info(
        "HTTP サーバーを起動します (%s:%s)",
        HTTP_HOST,
        HTTP_PORT
    )

    try:
        web.run_app(app, host=HTTP_HOST, port=HTTP_PORT)
    except Exception:
        logger.exception("aiohttp サーバー実行中に致命的エラーが発生しました")
        raise
    finally:
        logger.info("HTTP サーバーが停止しました")


if __name__ == "__main__":
    main()