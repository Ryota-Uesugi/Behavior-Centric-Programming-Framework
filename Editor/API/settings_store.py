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
        logger.exception("設定読み込み失敗")
        return []

def save_setting(app_state, expression: str, name: str = "", valid_state: dict = None):
    # 1. 入力値の基本バリデーション
    if not name or not name.strip():
        raise ValueError("設定名が空です。一意の名前を入力してください。")
    
    if not expression or not expression.strip():
        raise ValueError(f"設定 '{name}' の式が入力されていません。")

    # 2. 式のパース
    try:
        ast_dict = parse_expression(expression)
    except ValueError as e:
        raise ValueError(f"設定 '{name}' の式解析に失敗しました: {e}")

    # 3. ★式の構造分析 (依存関係の抽出)
    try:
        # ここで info を取得する
        expr_info = analyze_expr(ast_dict, valid_state)
    except Exception as e:
        raise ValueError(f"式の構造分析に失敗しました: {e}")

    # 4. 通知モードの決定 (解析済みの info を渡す)
    try:
        notify = decide_notify_mode(ast_dict, expr_info)
    except Exception as e:
        raise ValueError(f"通知モードの判定中にエラーが発生しました: {e}")

    # 5. 既存設定の読み込みと重複チェック（改善案）
    try:
        settings = load_setting()
    except Exception as e:
        settings = [] # ファイルがない場合は新規作成

    # 同じ名前があれば削除（上書きのため）
    settings = [s for s in settings if s.get("name") != name]

    # 6. 新規設定の作成
    new_setting = {
        "name": name,
        "expression": expression,
        "ast": ast_dict,
        "notify": notify,
        "dependencies": list(expr_info.dependencies),   
        "is_time_sensitive": expr_info.time_dependent,
    }
    settings.append(new_setting)

    # 7. ファイルへの保存
    try:
        with open(SETTING_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except IOError as e:
        logger.error("ファイル保存エラー: %s", e)
        raise RuntimeError(f"設定ファイル '{SETTING_FILE}' の保存に失敗しました。")
    except Exception as e:
        logger.error("予期せぬ保存エラー: %s", e)
        raise RuntimeError(f"保存処理中に予期せぬエラーが発生しました: {e}")

    # 8. キャッシュの更新
    try:
        app_state.cached_settings = settings 
        logger.info("設定を保存し、キャッシュを更新しました: %s", name)
    except AttributeError:
        logger.warning("app_state に cached_settings が存在しないため、メモリ更新をスキップしました。")
    
    return True

def delete_setting(app_state, index):
    settings = load_setting()
    if not (0 <= index < len(settings)): return

    settings.pop(index)

    with open(SETTING_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

    # 【重要】キャッシュを最新に同期
    app_state.cached_settings = settings
    logger.info("設定を削除し、キャッシュを更新しました")