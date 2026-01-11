import ast
import re

# --- 1. 型の定数定義 ---
TYPE_NUMBER = "number"
TYPE_BOOLEAN = "boolean"
TYPE_STRING = "string"       # 文字列型
TYPE_ANY = "any"
TYPE_WINDOW = "window"       # 時間窓用（数値定数のみ許可）
TYPE_VALUE_ONLY = "raw_val"  # 履歴が必要な関数用（属性アクセスのみ許可）

# --- 2. 関数設定 ---
# category: 関数の分類
# inputs: 引数ごとの期待される型
# output: 戻り値の型
FUNC_CONFIG = {
    # ==========================================
    # ドローン制御関数 (Control Functions)
    # ==========================================
    # 離陸: takeoff(高度[m])
    "takeoff": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },
    # 着陸: land()
    "land": {
        "category": "control_func",
        "inputs": [],
        "output": TYPE_BOOLEAN
    },
    # アーム: arm()
    "arm": {
        "category": "control_func",
        "inputs": [],
        "output": TYPE_BOOLEAN
    },
    # ディスアーム: disarm()
    "disarm": {
        "category": "control_func",
        "inputs": [],
        "output": TYPE_BOOLEAN
    },
    # モード変更: set_mode("GUIDED"など)
    "set_mode": {
        "category": "control_func",
        "inputs": [TYPE_STRING],
        "output": TYPE_BOOLEAN
    },
    # 速度制御: set_velocity(vx, vy, vz, yaw_rate)
    "set_velocity": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },
    # 位置制御: goto(x, y, z, yaw)
    "goto": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },
    # 汎用コマンド: command(id, p1, p2, p3, p4, p5, p6, p7)
    "command": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },

    # --- 算術・計算関数 ---
    "clamp":    {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_NUMBER},
    "within":   {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "round":    {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_NUMBER},
    "log":      {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_NUMBER},
    "abs":      {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "floor":    {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "ceil":     {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "sqrt":     {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_NUMBER},
    "is_nan":   {"category": "calc_func", "inputs": [TYPE_NUMBER], "output": TYPE_BOOLEAN},
    "hysteresis": {"category": "calc_func", "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], "output": TYPE_BOOLEAN},
    
    # --- 履歴統計関数 ---
    "average":  {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "sum":      {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "min":      {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "max":      {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "trend":    {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "rate":     {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "delta":    {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "duration": {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_NUMBER},
    "hold":     {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_BOOLEAN},
    "prev":     {"category": "time_func", "inputs": [TYPE_VALUE_ONLY, TYPE_WINDOW], "output": TYPE_ANY},

    # --- 特殊関数 ---
    "timer":    {"category": "time_func", "inputs": [TYPE_ANY, TYPE_WINDOW], "output": TYPE_ANY},
    
    # --- Export系関数 ---
    "export_txt": {
        "category": "export_func",
        "inputs": [TYPE_ANY, TYPE_STRING, TYPE_STRING], 
        "output": TYPE_BOOLEAN
    },
    "export_graph": {
        "category": "export_func",
        "inputs": [TYPE_NUMBER, TYPE_STRING, TYPE_STRING, TYPE_STRING],
        "output": TYPE_BOOLEAN
    },
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

# --- 4. 型検証ヘルパー ---
def _validate_context(node: dict, expected_type: str, op_name: str = "operation"):
    if expected_type == TYPE_ANY:
        return

    if node.get("type") == "flow_control" and node.get("name") == "if":
        _validate_context(node["args"][1], expected_type, f"if-then ({op_name})")
        _validate_context(node["args"][2], expected_type, f"if-else ({op_name})")
        return

    if node["return_type"] == TYPE_ANY:
        return

    if node["return_type"] != expected_type:
        raise ValueError(f"型エラー: '{op_name}' は {expected_type} を期待していますが、{node['return_type']} が指定されました。")


def parse_expression(expr: str):
    if not expr or not expr.strip():
        raise ValueError("式が空です。")
    
    processed_expr = re.sub(r'\bif\s*\(', 'if_run(', expr.strip())

    try:
        tree = ast.parse(processed_expr, mode="eval")
        return _convert(tree.body)
    except SyntaxError as e:
        raise ValueError(f"式の構文が正しくありません (位置 {e.offset}): {e.msg}")

def _convert(node):
    # 1. 定数
    if isinstance(node, ast.Constant):
        val = node.value
        if isinstance(val, bool): v_type = TYPE_BOOLEAN
        elif isinstance(val, (int, float)): v_type = TYPE_NUMBER
        elif isinstance(val, str): v_type = TYPE_STRING
        else: raise ValueError(f"未対応のデータ型です: {type(val)}")
        return {"type": "constant", "value_type": v_type, "value": val, "return_type": v_type}

    # 2. 属性アクセス
    if isinstance(node, ast.Attribute):
        if not isinstance(node.value, ast.Name):
            raise ValueError("属性アクセス形式が不正です。")
        return {"type": "value", "messageType": node.value.id, "field": node.attr, "return_type": TYPE_NUMBER}

    # 3. 名前
    if isinstance(node, ast.Name):
        return {"type": "name", "id": node.id, "return_type": TYPE_ANY}

    # 4. 二項演算
    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in ARITHMETIC_OPS:
            raise ValueError(f"未対応の演算子です: {op_type}")
        
        left = _convert(node.left)
        right = _convert(node.right)
        op_str = ARITHMETIC_OPS[op_type]

        _validate_context(left, TYPE_NUMBER, op_str)
        _validate_context(right, TYPE_NUMBER, op_str)
            
        return {
            "type": "binary",
            "op": op_str,
            "return_type": TYPE_NUMBER,
            "left": left,
            "right": right
        }

    # 5. 比較演算
    if isinstance(node, ast.Compare):
        if len(node.ops) > 1:
            raise ValueError("比較演算の連結は許可されていません。")
        
        op_type = type(node.ops[0])
        op_str = ARITHMETIC_OPS.get(op_type) or COMPARISON_OPS.get(op_type)
        if not op_str:
            raise ValueError(f"未対応の比較演算子です。")
            
        left = _convert(node.left)
        right = _convert(node.comparators[0])
        
        _validate_context(left, TYPE_NUMBER, op_str)
        _validate_context(right, TYPE_NUMBER, op_str)
        
        return {
            "type": "binary",
            "op": op_str,
            "return_type": TYPE_BOOLEAN,
            "left": left,
            "right": right
        }

    # 6. 論理演算
    if isinstance(node, ast.BoolOp):
        op_str = LOGICAL_OPS[type(node.op)]
        values = [_convert(v) for v in node.values]
        
        for v in values:
            _validate_context(v, TYPE_BOOLEAN, op_str)
        
        res = values[0]
        for next_val in values[1:]:
            res = {
                "type": "binary", "op": op_str,
                "return_type": TYPE_BOOLEAN,
                "left": res, "right": next_val
            }
        return res

    # 7. 単項演算
    if isinstance(node, ast.UnaryOp):
        op_str = ALLOWED_UNARY[type(node.op)]
        operand = _convert(node.operand)
        
        if op_str == "not":
            expected = TYPE_BOOLEAN
            ret_type = TYPE_BOOLEAN
        else:
            expected = TYPE_NUMBER
            ret_type = TYPE_NUMBER

        _validate_context(operand, expected, op_str)
            
        return {
            "type": "unary",
            "op": op_str,
            "return_type": ret_type,
            "node": operand
        }

    # 8. 関数呼び出し
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("不正な関数形式です。")
        
        func_name = node.func.id
        args = [_convert(a) for a in node.args]

        # --- if文 (flow_control) ---
        if func_name == "if_run":
            if len(args) != 3:
                raise ValueError(f"if文は3つの引数(条件, true時, false時)が必要です。")
            
            _validate_context(args[0], TYPE_BOOLEAN, "if-condition")

            then_type = args[1]["return_type"]
            else_type = args[2]["return_type"]
            
            if then_type == TYPE_NUMBER and else_type == TYPE_NUMBER:
                final_ret = TYPE_NUMBER
            elif then_type == TYPE_BOOLEAN and else_type == TYPE_BOOLEAN:
                final_ret = TYPE_BOOLEAN
            else:
                final_ret = TYPE_ANY

            # args は最後
            return {
                "type": "flow_control",
                "name": "if", 
                "return_type": final_ret,  
                "args": args
            }

        # --- 通常関数 ---
        conf = FUNC_CONFIG.get(func_name)

        if not conf:
            raise ValueError(f"未定義の関数です: {func_name}")

        if len(conf["inputs"]) != len(args):
            raise ValueError(f"関数 '{func_name}' は {len(conf['inputs'])} 個の引数が必要ですが、{len(args)} 個渡されました。")

        for i, (expected, arg_node) in enumerate(zip(conf["inputs"], args)):
            if expected == TYPE_WINDOW:
                if arg_node["type"] != "constant" or arg_node["return_type"] != TYPE_NUMBER:
                    raise ValueError(f"関数 '{func_name}' の第{i+1}引数(Window)には数値を指定してください。")
            elif expected == TYPE_VALUE_ONLY:
                if arg_node["type"] != "value":
                    raise ValueError(f"関数 '{func_name}' の第{i+1}引数はフィールド直接指定のみ可能です。")
            elif expected != TYPE_ANY:
                _validate_context(arg_node, expected, f"{func_name} arg{i+1}")

        final_ret = conf["output"]
        if final_ret == TYPE_ANY:
            final_ret = args[0]["return_type"]

        # 【変更】辞書の構築順序を制御し、argsが最後に来るようにする
        result = {
            "type": "func", 
            "name": func_name, 
            "category": conf["category"], 
            "return_type": final_ret
        }
        
        # window情報がある場合はargsより先に追加
        if conf["category"] == "time_func":
            result["window"] = args[-1]["value"]
        
        # argsを最後に追加
        result["args"] = args
                
        return result

    raise ValueError(f"許可されていない構文要素です: {type(node).__name__}")