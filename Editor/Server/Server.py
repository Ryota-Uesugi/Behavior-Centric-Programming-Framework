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
WEB_DIR = os.path.join(BASE_DIR, "web")  # Serve the "web" directory

async def index(request):
    # / -> web/index.html
    return web.FileResponse(os.path.join(WEB_DIR, "index.html"))


def open_browser():
    """
    Opens the browser after the server starts.
    """
    time.sleep(1)  # Wait for server to start (important)
    url = f"http://localhost:{PORT}/"
    webbrowser.open(url)


def main():
    app = web.Application()

    # Home page
    app.router.add_get("/", index)

    # Serve static files from the "web" directory
    app.router.add_static("/", WEB_DIR, show_index=True)

    # Automatically open browser (separate thread)
    threading.Thread(target=open_browser, daemon=True).start()

    web.run_app(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()