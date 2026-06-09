#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import threading
import time
import webbrowser
from aiohttp import web

HOST = "0.0.0.0"
PORT = 8080

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")  # web 以下を配信


async def index(request):
    # / → web/index.html
    return web.FileResponse(os.path.join(WEB_DIR, "test.html"))


def open_browser():
    """
    サーバ起動後にブラウザを開く
    """
    time.sleep(1)  # サーバ起動待ち（重要）
    url = f"http://localhost:{PORT}/"
    webbrowser.open(url)


def main():
    app = web.Application()

    # トップページ
    app.router.add_get("/", index)

    # web 以下をそのまま静的配信
    app.router.add_static("/", WEB_DIR, show_index=True)

    # ブラウザ自動起動（別スレッド）
    threading.Thread(target=open_browser, daemon=True).start()

    web.run_app(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
