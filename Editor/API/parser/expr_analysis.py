import ast
from .definitions import (
    TYPE_NUMBER, TYPE_BOOLEAN, TYPE_STRING, TYPE_ANY, TYPE_WINDOW, TYPE_VALUE_ONLY,
    FUNC_CONFIG
)

# --- 定数定義 ---
# パーサー側の定義と一致させます
# (definitions.py からインポートしている場合は重複定義不要ですが、念のため記載)
TYPE_NUMBER = "number"
TYPE_BOOLEAN = "boolean"
TYPE_STRING = "string"
TYPE_ANY = "any"

class ExprInfo:
    def __init__(self):
        self.return_type = None   # 最終的な戻り値の型
        self.window_sec = None    # 検出された最小のWindow値
        self.time_dependent = False # 時間依存関数の有無
        self.dependencies = set()   # 依存フィールド (例: "BATTERY.volt")
        self.references = set()     # 依存するcached_definitionの名前

def analyze_expr(node, valid_state=None, parser_references=None) -> ExprInfo:
    """
    ASTを解析し、型、依存関係、時間依存性などを抽出します。
    parser_references: parse_expression() が返した参照リスト
    """
    info = ExprInfo()
    
    # パーサーが検出した参照定義を初期セット
    if parser_references:
        info.references.update(parser_references)

    if not node:
        return info
    
    # 1. ルートノードの型を取得
    raw_type = node.get("return_type")
    
    # IF文の戻り値型推論 (Anyの場合の解決)
    if raw_type == TYPE_ANY and node.get("name") == "if":
        args = node.get("args", [])
        if len(args) == 3:
            then_type = args[1].get("return_type")
            else_type = args[2].get("return_type")
            
            if then_type == TYPE_NUMBER and else_type == TYPE_NUMBER:
                info.return_type = TYPE_NUMBER
            elif then_type == TYPE_BOOLEAN and else_type == TYPE_BOOLEAN:
                info.return_type = TYPE_BOOLEAN
            else:
                info.return_type = TYPE_ANY
        else:
            info.return_type = TYPE_ANY
    else:
        info.return_type = raw_type
    
    # 2. ツリー解析 (依存関係抽出を含む)
    _recursive_analyze(node, info, valid_state)
    return info

def _recursive_analyze(node, info: ExprInfo, valid_state: dict = None):
    if not node or not isinstance(node, dict):
        return

    t = node.get("type")

    # --- A. フィールド値 (依存関係: Dependencies) ---
    if t == "value":
        m_type = node.get("messageType")
        field = node.get("field")
        
        # 1. バリデーション (valid_stateがある場合)
        if valid_state:
            if m_type not in valid_state or field not in valid_state.get(m_type, {}):
                # 必要に応じて警告ログやエラー処理
                pass 

        # 2. 依存関係セットに追加 (例: "BATTERY_STATUS.volt")
        if m_type and field:
            info.dependencies.add(f"{m_type}.{field}")

    # --- B. 定義済み参照 (依存関係: References) ---
    # parse_expression時点でも収集していますが、再帰探索でも念のため確認
    if t == "reference":
        ref_name = node.get("name")
        if ref_name:
            info.references.add(ref_name)

    # --- C. 時間依存判定 ---
    if t == "func":
        # 時間依存フラグのチェック
        if node.get("category") == "time_func" or node.get("time_dependent"):
            info.time_dependent = True
            w = node.get("window")
            # Window値の最小値を探す (より短い期間での更新が必要か判定するため)
            if w is not None:
                if info.window_sec is None or w < info.window_sec:
                    info.window_sec = w

    # --- 子ノード再帰 ---
    for arg in node.get("args", []):
        _recursive_analyze(arg, info, valid_state)
    
    _recursive_analyze(node.get("left"), info, valid_state)
    _recursive_analyze(node.get("right"), info, valid_state)
    _recursive_analyze(node.get("node"), info, valid_state) # 単項演算用

def decide_notify_mode(ast_node, info: ExprInfo):
    node_name = ast_node.get("name")

    # A. Boolean (条件式)
    if info.return_type == TYPE_BOOLEAN:
        if not info.time_dependent:
            # 時間依存なし -> 値が変わった瞬間のみ判定 (Event Driven)
            return {"mode": "on_change", "interval": 0}
        else:
            # 時間依存あり -> 定期的に監視が必要 (Polling)
            interval = info.window_sec if info.window_sec and info.window_sec > 0 else 1.0
            return {"mode": "periodic_change", "interval": interval}

    # B. Number (数値)
    if info.return_type == TYPE_NUMBER:
        if info.time_dependent:
            # 平均値や合計値など -> 定期通知
            return {"mode": "periodic", "interval": info.window_sec or 1.0}
        else:
            # 単なる計算式 -> 値の変化ごとは負荷が高い可能性があるが、変数の場合は計算用途なので許可する場合もある
            # ここでは要件に従いエラーまたはon_changeとします
            raise ValueError("数値のみの式をアラートの条件として使用することは推奨されません。比較式にするか、Notify()関数を使用してください。")

    # C. ANY (不明/複合)
    if info.return_type == TYPE_ANY or info.return_type == None:
        node_type = ast_node.get("type")
        is_if_statement = (node_name == "if") or (node_type == "flow_control")

        if is_if_statement:
            if not info.time_dependent:
                return {"mode": "on_change", "interval": 0}
            else:
                interval = info.window_sec if info.window_sec and info.window_sec > 0 else 1.0
                return {"mode": "periodic_change", "interval": interval}
        
        # return_typeがANYでも処理を継続したい場合はここを調整
        pass 

    raise ValueError(f"通知方式を決定できません (戻り値型: {info.return_type})")