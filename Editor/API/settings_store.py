import json
import os
from config import SETTING_FILE
from logger import logger
from Engine.expr_parser import parse_expression
from Engine.expr_analysis import analyze_expr, decide_notify_mode


def load_setting():
    if not os.path.exists(SETTING_FILE):
        return []

    try:
        with open(SETTING_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        logger.exception("Failed to load settings")
        return []

def save_setting(app_state, expression: str, name: str = "", valid_state: dict = None):
    # 1. Basic validation of input values
    if not name or not name.strip():
        raise ValueError("Setting name is empty. Please enter a unique name.")
    
    if not expression or not expression.strip():
        raise ValueError(f"Expression for setting '{name}' has not been entered.")

    # 2. Parse expression
    try:
        ast_dict = parse_expression(expression)
    except ValueError as e:
        raise ValueError(f"Failed to parse expression for setting '{name}': {e}")

    # 3. ★ Expression structure analysis (Extraction of dependencies)
    try:
        # Get info here
        expr_info = analyze_expr(ast_dict, valid_state)
    except Exception as e:
        raise ValueError(f"Failed to analyze expression structure: {e}")

    # 4. Determine notification mode (Pass the analyzed info)
    try:
        notify = decide_notify_mode(ast_dict, expr_info)
    except Exception as e:
        raise ValueError(f"An error occurred while determining the notification mode: {e}")

    # 5. Load existing settings and check for duplicates (Improvement plan)
    try:
        settings = load_setting()
    except Exception as e:
        settings = [] # Create new if file does not exist

    # Remove if the same name exists (for overwriting)
    settings = [s for s in settings if s.get("name") != name]

    # 6. Create new setting
    new_setting = {
        "name": name,
        "expression": expression,
        "ast": ast_dict,
        "notify": notify,
        "dependencies": list(expr_info.dependencies),   
        "is_time_sensitive": expr_info.time_dependent,
    }
    settings.append(new_setting)

    # 7. Save to file
    try:
        with open(SETTING_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except IOError as e:
        logger.error("File save error: %s", e)
        raise RuntimeError(f"Failed to save setting file '{SETTING_FILE}'.")
    except Exception as e:
        logger.error("Unexpected save error: %s", e)
        raise RuntimeError(f"An unexpected error occurred during the save process: {e}")

    # 8. Update cache
    try:
        app_state.cached_settings = settings 
        logger.info("Saved settings and updated cache: %s", name)
    except AttributeError:
        logger.warning("Skipped memory update because 'cached_settings' does not exist in app_state.")
    
    return True

def delete_setting(app_state, index):
    settings = load_setting()
    if not (0 <= index < len(settings)): return

    settings.pop(index)

    with open(SETTING_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

    # [Important] Synchronize cache with the latest state
    app_state.cached_settings = settings
    logger.info("Deleted setting and updated cache")