import json
from aiohttp import web
from logger import logger
from settings_store import load_setting, save_setting, delete_setting

async def get_state(request):
    return web.json_response(request.app["state"].current_state)

async def get_settings(request):
    full_settings = load_setting()
    simplified_settings = [
        {
            "name": item["name"],
            "expression": item["expression"]
        }
        for item in full_settings
    ]

    return web.json_response(simplified_settings)

async def post_settings(request):
    state = request.app["state"]
    try:
        # 1. JSONパース自体の失敗をキャッチ
        try:
            data = await request.json()
        except Exception:
            return web.json_response({
                "status": "error", 
                "message": "リクエストボディが正しいJSON形式ではありません。"
            }, status=400)

        expression = data.get("expression")
        name = data.get("name")

        # デバッグログ
        logger.debug(f"Received save request: Name='{name}', Expr='{expression}'")

        # 2. 必須項目のチェック（save_setting内でも行いますが、入り口で弾くのが親切です）
        if not name:
            return web.json_response({
                "status": "error", 
                "message": "設定名（name）は必須項目です。"
            }, status=400)
        
        if not expression:
            return web.json_response({
                "status": "error", 
                "message": "数式（expression）は必須項目です。"
            }, status=400)

        # 3. 保存処理の実行
        # save_setting内でのバリデーション（構文ミス、関数引数ミス、重複など）は
        # すべて ValueError として送出される想定です。
        save_setting(state, expression, name, state.current_state)
        
        return web.json_response({
            "status": "success",
            "message": f"設定 '{name}' を保存しました。"
        })

    except ValueError as e:
        # 入力内容に起因するエラー（構文エラー、引数エラー、名前重複など）
        # クライアント側で修正可能なため 400 Bad Request
        logger.warning(f"Validation error in post_settings: {e}")
        return web.json_response({
            "status": "error", 
            "message": str(e)
        }, status=400)

    except RuntimeError as e:
        # システム起因のエラー（ファイル書き込み失敗など）
        # サーバー側の問題のため 500 Internal Server Error
        logger.error(f"Runtime error in post_settings: {e}")
        return web.json_response({
            "status": "error", 
            "message": f"システムエラーが発生しました: {str(e)}"
        }, status=500)

    except Exception as e:
        # その他予期せぬエラー
        logger.exception("Unexpected error in post_settings")
        return web.json_response({
            "status": "error", 
            "message": "予期せぬエラーが発生しました。ログを確認してください。"
        }, status=500)

async def get_mavlink_schema(request):
    return web.json_response(
        request.app["state"].mavlink_schema
    )

async def delete_settings(request):
    state = request.app["state"]
    delete_setting(state, int(request.match_info["index"]))
    return web.json_response({"status": "ok"})
