import json
from aiohttp import web
from logger import logger
from .settings_store import load_setting, save_setting, delete_setting, load_definition, load_reference

async def get_state(request):
    return web.json_response(request.app["state"].current_state)

async def get_ast(request):
    """
    保存されている全ての設定・定義から name と ast のセットを取得する
    """
    full_settings = []

    # 1. すべての設定（expression）と定義（definition）をロード
    try:
        full_settings.extend(load_setting())
    except Exception as e:
        logger.error(f"Error loading settings: {e}")
        return web.json_response({
            "status": "error",
            "message": "データの読み込み中にエラーが発生しました。"
        }, status=500)

    result = [
        {
            "name": item.get("name"),
            "ast": item.get("ast")
        }
        for item in full_settings
        if "name" in item  # nameが存在する項目のみ対象
    ]

    return web.json_response(result)

async def get_settings(request):

    target_type = request.query.get('type')
    full_settings = []

    # 1. 設定と定義をロード
    if target_type is None or target_type == 'expression':
        full_settings.extend(load_setting())
    
    if target_type is None or target_type == 'definition':
        full_settings.extend(load_definition())

    reference_map = load_reference()
    
    if not isinstance(reference_map, dict):
        reference_map = {}

    simplified_settings = []

    for item in full_settings:
        name = item.get("name")
        
        # タイプ判定
        if "expression" in item:
            expression_value = item["expression"]
            type_label = "expression"
            input_count = 0 
        elif "definition" in item:
            expression_value = item["definition"]
            type_label = item.get("classification", "definition")
            input_count = len(item.get("input_type", []))
        else:
            continue

        reference_list = reference_map.get(name, [])

        simplified_settings.append({
            "name": name,
            "expression": expression_value,
            "type": type_label,
            "input_count": input_count,
            "reference": reference_list
        })

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
        mode = data.get("mode")
        

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
        
        if not mode:
            return web.json_response({
                "status": "error", 
                "message": "登録形式（mode）は必須項目です。"
            }, status=400)

        # 3. 保存処理の実行
        # save_setting内でのバリデーション（構文ミス、関数引数ミス、重複など）は
        # すべて ValueError として送出される想定です。
        save_setting(state, expression, name, mode, state.current_state)
        
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
    
    target_type = request.match_info.get("type")
    index_str = request.match_info.get("index")

    try:
        index = int(index_str)
    except (ValueError, TypeError):
        return web.json_response(
            {"status": "error", "reason": "インデックスは数値で指定してください"}, 
            status=400
        )

    try:
        delete_setting(state, target_type, index)
        return web.json_response({"status": "ok", "type": target_type, "index": index})
    except Exception as e:
        logger.error(f"削除処理中にエラーが発生しました: {e}")
        return web.json_response({"status": "error", "reason": str(e)}, status=500)