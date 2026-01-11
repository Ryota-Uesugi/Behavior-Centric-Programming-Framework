import json
from aiohttp import web, WSMsgType
from settings_store import load_setting, save_setting, delete_setting
from logger import logger


async def websocket_handler(request):
    app_state = request.app["state"]
    peer = request.remote
    ws = web.WebSocketResponse()

    await ws.prepare(request)
    app_state.websockets.add(ws)
    app_state.stream_active = True

    logger.info("WebSocket 接続確立: %s (接続数=%d)", peer, len(app_state.websockets))

    await ws.send_str(json.dumps({
        "type": "settings",
        "data": load_setting()
    }, ensure_ascii=False))

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                # クライアントからのコマンドが必要な場合はここに記述
                pass
            elif msg.type == WSMsgType.ERROR:
                logger.error("WebSocket エラー: %s exception=%s", peer, ws.exception())
    finally:
        app_state.websockets.discard(ws)
        if not app_state.websockets:
            app_state.stream_active = False
        logger.info("WebSocket 切断: %s", peer)

    return ws