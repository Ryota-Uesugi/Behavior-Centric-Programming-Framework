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
        # 1. Catch JSON parsing failures
        try:
            data = await request.json()
        except Exception:
            return web.json_response({
                "status": "error", 
                "message": "The request body is not in a valid JSON format."
            }, status=400)

        expression = data.get("expression")
        name = data.get("name")

        # Debug log
        logger.debug(f"Received save request: Name='{name}', Expr='{expression}'")

        # 2. Check for required fields
        # (Validation is also performed in save_setting, but it is better to reject invalid requests at the entry point)
        if not name:
            return web.json_response({
                "status": "error", 
                "message": "Setting name ('name') is required."
            }, status=400)
        
        if not expression:
            return web.json_response({
                "status": "error", 
                "message": "Formula ('expression') is required."
            }, status=400)

        # 3. Execute save process
        # Validation inside save_setting (syntax errors, function argument errors, duplicates, etc.)
        # is expected to be raised as ValueError.
        save_setting(state, expression, name, state.current_state)
        
        return web.json_response({
            "status": "success",
            "message": f"Setting '{name}' has been saved."
        })

    except ValueError as e:
        # Errors caused by input content (syntax errors, argument errors, name duplication, etc.)
        # 400 Bad Request, as this can be fixed on the client side.
        logger.warning(f"Validation error in post_settings: {e}")
        return web.json_response({
            "status": "error", 
            "message": str(e)
        }, status=400)

    except RuntimeError as e:
        # Errors caused by the system (file write failure, etc.)
        # 500 Internal Server Error, as this is a server-side issue.
        logger.error(f"Runtime error in post_settings: {e}")
        return web.json_response({
            "status": "error", 
            "message": f"A system error occurred: {str(e)}"
        }, status=500)

    except Exception as e:
        # Other unexpected errors
        logger.exception("Unexpected error in post_settings")
        return web.json_response({
            "status": "error", 
            "message": "An unexpected error occurred. Please check the logs."
        }, status=500)

async def get_mavlink_schema(request):
    return web.json_response(
        request.app["state"].mavlink_schema
    )

async def delete_settings(request):
    state = request.app["state"]
    delete_setting(state, int(request.match_info["index"]))
    return web.json_response({"status": "ok"})