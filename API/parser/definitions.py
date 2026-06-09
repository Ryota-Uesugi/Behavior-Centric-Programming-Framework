import ast

# --- 1. 型の定数定義 ---
TYPE_NUMBER = "number"
TYPE_BOOLEAN = "boolean"
TYPE_STRING = "string"       # 文字列型
TYPE_ANY = "any"
TYPE_WINDOW = "window"       # 時間窓用（数値定数のみ許可）
TYPE_VALUE_ONLY = "raw_val"  # 履歴が必要な関数用（属性アクセスのみ許可）

# --- 2. 関数設定 ---
FUNC_CONFIG = {
    # ==========================================
    # フロー制御 (Flow Control)
    # ==========================================
    # Switch: 特別扱いされるが、定義として存在させておく (inputsは可変長なのでダミーまたは空定義)
    "switch": {
        "category": "flow_control",
        "inputs": [], # パーサー側で可変長として処理されるため空リストでOK
        "output": TYPE_ANY
    },
    # 待機: wait(seconds) -> 戻り値はbooleanとする
    "wait": {
        "category": "flow_control",
        "inputs": [TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },

    # ==========================================
    # ドローン制御関数 (Control Functions)
    # ==========================================
    "takeoff":      {"category": "control_func", "inputs": [TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "land":         {"category": "control_func", "inputs": [], "output": TYPE_BOOLEAN},
    "arm":          {"category": "control_func", "inputs": [], "output": TYPE_BOOLEAN},
    "disarm":       {"category": "control_func", "inputs": [], "output": TYPE_BOOLEAN},
    "set_mode":     {"category": "control_func", "inputs": [TYPE_STRING], "output": TYPE_BOOLEAN},
    "set_velocity": {"category": "control_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "goto":         {"category": "control_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "command":      {"category": "control_func", "inputs": [TYPE_NUMBER] * 8, "output": TYPE_BOOLEAN},

    # --- 算術・計算関数 ---
    "clamp":        {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_NUMBER},
    "within":       {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "round":        {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_NUMBER},
    "log":          {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_NUMBER},
    "abs":          {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "floor":        {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "ceil":         {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "sqrt":         {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "is_nan":       {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "hysteresis":   {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "sin":          {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "cos":          {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "tan":          {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "radians":      {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "degrees":      {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    
    # --- 履歴統計関数 ---
    "average":      {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "sum":          {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "min":          {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "max":          {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "trend":        {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "rate":         {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "delta":        {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "duration":     {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "hold":         {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_BOOLEAN},
    "prev":         {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_ANY},

    # --- Export系関数 ---
    "export_txt":   {"category": "export_func", "inputs": [TYPE_NUMBER, TYPE_STRING, TYPE_STRING], "output": TYPE_BOOLEAN},
    "export_graph": {"category": "export_func", "inputs": [TYPE_NUMBER, TYPE_STRING, TYPE_STRING, TYPE_STRING], "output": TYPE_BOOLEAN},
}

# --- 3. 演算子の定義 ---
ARITHMETIC_OPS = {
    ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.Div: "/",
    ast.Mod: "%", ast.Pow: "**", ast.LShift: "<<", ast.RShift: ">>",
    ast.BitOr: "|", ast.BitXor: "^", ast.BitAnd: "&"
}
COMPARISON_OPS = {
    ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">=",
    ast.Eq: "==", ast.NotEq: "!="
}
LOGICAL_OPS = {ast.And: "and", ast.Or: "or"}
ALLOWED_UNARY = {ast.USub: "-", ast.UAdd: "+", ast.Not: "not", ast.Invert: "~"}