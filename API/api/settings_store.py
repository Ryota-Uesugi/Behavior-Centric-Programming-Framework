import json
import os
import re
from config import SETTING_DIR, SETTING_FILE, DEFINITION_FILE, REFERENCE_FILE
from logger import logger
from parser.expr_parser import parse_expression
from parser.expr_analysis import analyze_expr, decide_notify_mode
from parser.definition_parser import parse_definition

def _get_full_path(filename_or_path: str) -> str:
    return os.path.join(SETTING_DIR, os.path.basename(filename_or_path))

def _ensure_setting_dir():
    if not os.path.exists(SETTING_DIR):
        try:
            os.makedirs(SETTING_DIR, exist_ok=True)
        except Exception:
            logger.exception(f"ディレクトリ作成失敗: {SETTING_DIR}")

def load_setting():
    file_path = _get_full_path(SETTING_FILE)
    
    if not os.path.exists(file_path):
        return []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        logger.exception("評価設定読み込み失敗")
        return []

def load_definition():
    file_path = _get_full_path(DEFINITION_FILE)
    
    if not os.path.exists(file_path):
        return []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        logger.exception("定義設定読み込み失敗")
        return []

def load_reference():
    file_path = _get_full_path(REFERENCE_FILE)

    if not os.path.exists(file_path):
        return {}

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
        else:
            logger.warning(f"reference.json format is {type(data)}, expected dict. Returning empty dict.")
            return {}
    except Exception:
        logger.exception("Reference読み込み失敗")
        return {}

def update_reverse_reference(owner_name: str, old_refs: list, new_refs: list, is_delete_owner: bool = False):
    # None対策と重複排除
    old_set = set(old_refs) if old_refs else set()
    new_set = set(new_refs) if new_refs else set()
    
    file_path = _get_full_path(REFERENCE_FILE)

    data = {}
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    data = {}
        except Exception:
            logger.warning(f"{file_path} の読み込みに失敗しました。新規作成します。")
            data = {}

    # 1. 主体（owner_name）のエントリ管理
    if is_delete_owner:
        if owner_name in data:
            del data[owner_name]
    else:
        if owner_name not in data:
            data[owner_name] = []
    
    # 2. 参照関係の差分更新
    if old_set != new_set:
        # 新しく参照するようになった相手 -> 相手のリストに自分(owner)を追加
        to_add = new_set - old_set
        for target in to_add:
            if target not in data:
                data[target] = []
            if owner_name not in data[target]:
                data[target].append(owner_name)

        # 参照しなくなった相手 -> 相手のリストから自分(owner)を削除
        to_remove = old_set - new_set
        for target in to_remove:
            if target in data:
                if owner_name in data[target]:
                    data[target].remove(owner_name)

    # 3. 削除時のクリーンアップ（自分が消える場合、自分が参照していた相手のリストからも自分を消す）
    if is_delete_owner:
        for target in old_set:
            if target in data and owner_name in data[target]:
                data[target].remove(owner_name)

    try:
        _ensure_setting_dir()
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"{file_path} の保存に失敗しました: {e}")


def save_setting(app_state, expression: str, name: str = "", mode: str = "", valid_state: dict = None):
    
    if not name or not name.strip():
        raise ValueError("設定名が空です。一意の名前を入力してください。")

    if not re.fullmatch(r'^[a-zA-Z0-9_\-]+$', name):
        raise ValueError(f"設定名に日本語や全角文字は使用できません。半角英数字、アンダースコア(_)、ハイフン(-)のみを使用してください。")

    if not expression or not expression.strip():
        raise ValueError(f"設定 '{name}' の式が入力されていません。")

    if not mode or not mode.strip():
        raise ValueError(f"設定 '{name}' のモードが入力されていません。")

    if mode == "definition":
        check_definition(app_state, expression, name)
    else:
        check_expression(app_state, expression, name, valid_state)
        

def check_expression(app_state, expression: str, name: str = "", valid_state: dict = None):
    
    # 1. 式の構文解析 (Parse)
    try:
        # parsed_data["references"] は式中に直接書かれた変数のみを含みます（再帰なし）
        parsed_data = parse_expression(expression, app_state.cached_definition)
        ast_dict = parsed_data["result"]
        parsed_refs = parsed_data["references"]
    except ValueError as e:
        raise ValueError(f"設定 '{name}' の式解析に失敗しました: {e}")

    # 2. 構造分析 (Analyze)
    try:
        expr_info = analyze_expr(ast_dict, valid_state, parser_references=parsed_refs)
    except Exception as e:
        raise ValueError(f"式の構造分析に失敗しました: {e}")

    # 3. 通知モード決定 (Decide Mode)
    try:
        notify = decide_notify_mode(ast_dict, expr_info)
    except Exception as e:
        raise ValueError(f"通知モードの判定中にエラーが発生しました: {e}")

    # 4. 保存処理 (Save)
    try:
        settings = load_setting()
    except Exception:
        settings = []

    # 既存の設定を探し、古い参照リストを取得する（Reference更新用）
    old_refs = []
    target_idx = -1
    
    for i, s in enumerate(settings):
        if s.get("name") == name:
            old_refs = s.get("references", [])
            target_idx = i
            break
    
    if target_idx != -1:
        settings.pop(target_idx)

    # 今回保存する直接参照リスト
    new_refs = parsed_refs

    new_setting = {
        "name": name,
        "expression": expression,
        "ast": ast_dict,
        "notify": notify,
        "input_type": list(expr_info.dependencies), 
        
        # settings.json に保存する参照リストも、整合性のため parsed_refs (直接参照) にします
        "references": new_refs,
        
        "return_type": expr_info.return_type
    }
    
    # ★逆参照リストの更新（自分、古い直接参照、新しい直接参照）
    update_reverse_reference(name, old_refs, new_refs)
    
    settings.append(new_setting)

    file_path = _get_full_path(SETTING_FILE)
    try:
        _ensure_setting_dir()
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)

    except IOError as e:
        logger.error("ファイル保存エラー: %s", e)
        raise RuntimeError(f"設定ファイル '{file_path}' の保存に失敗しました。")
    except Exception as e:
        logger.error("予期せぬ保存エラー: %s", e)
        raise RuntimeError(f"保存処理中に予期せぬエラーが発生しました: {e}")

    try:
        app_state.cached_settings = settings
        logger.info("設定を保存し、キャッシュを更新しました: %s", name)
    except AttributeError:
        logger.warning("app_state に cached_settings が存在しないため、メモリ更新をスキップしました。")

    return True

def check_definition(app_state, expression: str, name: str = ""):

    try:
        # 定義のパース結果の references も直接参照のみであることを前提とします
        parse_result = parse_definition(expression, app_state.cached_definition)
    except ValueError as e:
        raise ValueError(f"設定 '{name}' の式解析に失敗しました: {e}")

    try:
        settings = load_definition()
    except Exception as e:
        logger.warning(f"設定ファイルの読み込みに失敗、またはファイルが存在しません。新規作成します。: {e}")
        settings = [] 

    old_refs = []
    target_idx = -1
    for i, s in enumerate(settings):
        if s.get("name") == name:
            old_refs = s.get("references", [])
            target_idx = i
            break

    if target_idx != -1:
        settings.pop(target_idx)

    new_refs = parse_result["references"]

    new_setting = {
        "name": name,
        "definition": expression,
        "classification": parse_result["classification"],
        "ast": parse_result["ast"],   
        "references": new_refs,
        "input_type": parse_result["input_types"],
        "return_type": parse_result["overall_return_type"]      
    }

    if "initial_value" in parse_result:
        new_setting["initial_value"] = parse_result["initial_value"]

    # ★逆参照リストの更新
    update_reverse_reference(name, old_refs, new_refs)

    settings.append(new_setting)

    file_path = _get_full_path(DEFINITION_FILE)
    try:
        _ensure_setting_dir()
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)

    except IOError as e:
        logger.error("ファイル保存エラー: %s", e)
        raise RuntimeError(f"設定ファイル '{file_path}' の保存に失敗しました。")
    except Exception as e:
        logger.error("予期せぬ保存エラー: %s", e)
        raise RuntimeError(f"保存処理中に予期せぬエラーが発生しました: {e}")

    try:
        app_state.cached_definition = settings
        logger.info(f"設定を保存しました: {name} (Type: {parse_result['classification']})")
    except AttributeError:
        logger.warning("app_state に cached_definition が存在しないため、メモリ更新をスキップしました。")


def delete_setting(app_state, target_type, index):
    
    if target_type == "expression":
        settings = load_setting()
        
        if 0 <= index < len(settings):
            removed_item = settings.pop(index)
            
            # ★削除処理: 古い参照(old_refs)に対して、自分をリストから外すよう依頼
            # new_refs は [] (空) とし、is_delete_owner=True で自身のキーも削除
            if "name" in removed_item:
                old_refs = removed_item.get("references", [])
                update_reverse_reference(removed_item["name"], old_refs, [], is_delete_owner=True)

            file_path = _get_full_path(SETTING_FILE)
            _ensure_setting_dir()
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
            
            app_state.cached_settings = settings
            logger.info(f"settingsからインデックス {index} を削除しました。削除項目: {removed_item}")
        else:
            logger.warning(f"settingsのインデックス {index} は範囲外です (現在の要素数: {len(settings)})")

    elif target_type == "definition":
        definition = load_definition()
        
        if 0 <= index < len(definition):
            removed_item = definition.pop(index)

            # ★定義削除時の逆参照更新
            if "name" in removed_item:
                old_refs = removed_item.get("references", [])
                update_reverse_reference(removed_item["name"], old_refs, [], is_delete_owner=True)
            
            file_path = _get_full_path(DEFINITION_FILE)
            _ensure_setting_dir()
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(definition, f, ensure_ascii=False, indent=2)
            
            app_state.cached_definitions = definition 
            logger.info(f"definitionからインデックス {index} を削除しました。削除項目: {removed_item}")
        else:
            logger.warning(f"definitionのインデックス {index} は範囲外です (現在の要素数: {len(definition)})")
    
    else:
        logger.error(f"不正なタイプが指定されました: {target_type}")