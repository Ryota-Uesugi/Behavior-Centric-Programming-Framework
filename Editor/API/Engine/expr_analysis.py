# パーサー側で定義した型名と一致させる
TYPE_NUMBER = "number"
TYPE_BOOLEAN = "boolean"
TYPE_STRING = "string"
TYPE_ANY = "any"

class ExprInfo:
    def __init__(self):
        self.return_type = None   # 最終的な戻り値の型
        self.window_sec = None    # 検出された最小のWindow値
        self.time_dependent = False # 時間依存関数の有無
        self.dependencies = set()   # ★追加: 依存フィールドのセット

def analyze_expr(node, valid_state=None) -> ExprInfo:
    info = ExprInfo()
    if not node:
        return info
    
    # 1. ルートノードの型を取得 (既存ロジックそのまま)
    raw_type = node.get("return_type")
    
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

    # フィールド検証 & ★依存関係の記録
    if t == "value":
        m_type = node.get("messageType")
        field = node.get("field")
        
        # 1. バリデーション
        if valid_state:
            if m_type not in valid_state or field not in valid_state.get(m_type, {}):
                # 必要に応じてエラーにするかパスするか
                pass 

        # 2. 依存関係セットに追加 (例: "BATTERY_STATUS.volt")
        if m_type and field:
            info.dependencies.add(f"{m_type}.{field}")

    # 時間依存判定
    if t == "func":
        if node.get("category") == "time_func" or node.get("time_dependent"):
            info.time_dependent = True
            w = node.get("window")
            if w is not None:
                if info.window_sec is None or w < info.window_sec:
                    info.window_sec = w

    # 子ノード再帰
    for arg in node.get("args", []):
        _recursive_analyze(arg, info, valid_state)
    _recursive_analyze(node.get("left"), info, valid_state)
    _recursive_analyze(node.get("right"), info, valid_state)
    _recursive_analyze(node.get("node"), info, valid_state)

def decide_notify_mode(ast, info: ExprInfo):
    
    node_name = ast.get("name")
    
    
    # Timer特例
    if node_name == "timer":
        interval = info.window_sec if info.window_sec and info.window_sec > 0 else 1.0
        return {"mode": "periodic", "interval": interval}

    # A. Boolean
    if info.return_type == TYPE_BOOLEAN:
        if not info.time_dependent:
            return {"mode": "on_change", "interval": 0}
        else:
            interval = info.window_sec if info.window_sec and info.window_sec > 0 else 1.0
            return {"mode": "periodic_change", "interval": interval}

    # B. Number
    if info.return_type == TYPE_NUMBER:
        if info.time_dependent:
            return {"mode": "periodic", "interval": info.window_sec or 1.0}
        else:
            raise ValueError("数値のみの式はアラートとして不適切です。比較式にするか timer() を使用してください。")

    # C. ANY
    if info.return_type == TYPE_ANY:
        node_type = ast.get("type")
        is_if_statement = (node_name == "if") or (node_type == "flow_control")

        if is_if_statement:
            if not info.time_dependent:
                return {"mode": "on_change", "interval": 0}
            else:
                interval = info.window_sec if info.window_sec and info.window_sec > 0 else 1.0
                return {"mode": "periodic_change", "interval": interval}
        
        raise ValueError("式の型を特定できませんでした。")

    raise ValueError(f"通知方式を決定できません (戻り値型: {info.return_type})")