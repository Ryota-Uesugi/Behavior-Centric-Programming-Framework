import ast
import copy
from .definitions import (
    TYPE_NUMBER, TYPE_BOOLEAN, TYPE_STRING, TYPE_ANY, TYPE_WINDOW, TYPE_VALUE_ONLY,
    FUNC_CONFIG,
    ARITHMETIC_OPS, COMPARISON_OPS, LOGICAL_OPS, ALLOWED_UNARY
)

# --- ヘルパー関数群 ---

def _get_attr(item, key, default=None):
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)

def _inject_arguments(ast_node, args_list):
    """AST内の変数参照を実引数で置換する"""
    pending_args = list(args_list)
    
    def _traverse(node):
        if isinstance(node, dict):
            if node.get("type") == "variable":
                if not pending_args:
                    raise ValueError("関数の定義に含まれる変数参照の数が、渡された引数の数より多すぎます。")
                return pending_args.pop(0)
            return {k: _traverse(v) for k, v in node.items()}
        if isinstance(node, list):
            return [_traverse(item) for item in node]
        return node
        
    return _traverse(ast_node)

def _validate_context(node: dict, expected_type: str, op_name: str = "operation"):
    """
    ノードが期待される型を持っているか検証します。
    値を返さない要素（SequenceやEnd）が、値を期待する場所で使用された場合にエラーを出力します。
    """
    # 1. 値を返さないノードかどうかの判定 (None型)
    is_void_node = (node.get("name") == "sequence") or (node.get("return_type") is None)
    
    if is_void_node:
        if expected_type is not None:
            if node.get("type") == "end":
                raise ValueError(f"キーワード 'End' は値を返さないため、'{op_name}' の一部として使用できません。")
            elif node.get("name") == "sequence":
                 raise ValueError(f"Sequenceブロックは値を返さないため、'{op_name}' の一部として使用できません。")
            else:
                 raise ValueError(f"この要素は値を返さないため、'{op_name}' の一部として使用できません。")

    # ANY型許容の場合
    if expected_type == TYPE_ANY:
        return

    # switch展開後に生成される if (flow_control) の再帰検証
    if node.get("type") == "flow_control" and node.get("name") == "if":
        _validate_context(node["args"][1], expected_type, f"if-then ({op_name})")
        _validate_context(node["args"][2], expected_type, f"if-else ({op_name})")
        return

    # return_type が TYPE_ANY の場合は型チェックをスキップ (動的型など)
    if node.get("return_type") == TYPE_ANY:
        return

    # 型不一致エラー
    if node.get("return_type") != expected_type:
        raise ValueError(f"型エラー: '{op_name}' は {expected_type} を期待していますが、{node.get('return_type')} が指定されました。")

# --- AST ハンドラー関数群 ---

def _handle_constant(node: ast.Constant):
    val = node.value
    if isinstance(val, bool): v_type = TYPE_BOOLEAN
    elif isinstance(val, (int, float)): v_type = TYPE_NUMBER
    elif isinstance(val, str): v_type = TYPE_STRING
    elif val is None: v_type = TYPE_ANY
    else: raise ValueError(f"未対応のデータ型です: {type(val)}")
    return {"type": "constant", "value_type": v_type, "value": val, "return_type": v_type}

def _handle_attribute(node: ast.Attribute):
    if not isinstance(node.value, ast.Name):
        raise ValueError("属性アクセス形式が不正です。")
    return {"type": "value", "messageType": node.value.id, "field": node.attr, "return_type": TYPE_NUMBER}

def _handle_name(node: ast.Name, definitions: dict):
    lower_id = node.id.lower()
    
    # --- 【追加】switch用のプレースホルダー '_' を許可する ---
    if node.id == "_":
        return {"type": "name", "id": "_", "return_type": TYPE_ANY}
    # ----------------------------------------------------

    if lower_id == "true":
        return {"type": "constant", "value": True, "return_type": TYPE_BOOLEAN}
    if lower_id == "false":
        return {"type": "constant", "value": False, "return_type": TYPE_BOOLEAN}
    if lower_id == "end":
        return {"type": "end", "return_type": None}
    
    if node.id in definitions:
         raise ValueError(f"定義済み項目 '{node.id}' は関数形式 '{node.id}()' として呼び出す必要があります。")

    raise ValueError("不明な文字列が使用されています。") # 元コードのエラーメッセージに準拠

def _handle_binop(node: ast.BinOp, definitions: dict, references: set):
    op_type = type(node.op)
    if op_type not in ARITHMETIC_OPS:
        raise ValueError(f"未対応の演算子です: {op_type}")
    
    left = _convert(node.left, definitions, references)
    right = _convert(node.right, definitions, references)
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

def _handle_compare(node: ast.Compare, definitions: dict, references: set):
    if len(node.ops) > 1:
        raise ValueError("比較演算の連結は許可されていません。")
    
    op_type = type(node.ops[0])
    op_str = ARITHMETIC_OPS.get(op_type) or COMPARISON_OPS.get(op_type)
    if not op_str:
        raise ValueError(f"未対応の比較演算子です。")
        
    left = _convert(node.left, definitions, references)
    right = _convert(node.comparators[0], definitions, references)
    
    _validate_context(left, TYPE_NUMBER, op_str)
    _validate_context(right, TYPE_NUMBER, op_str)
    
    return {
        "type": "binary",
        "op": op_str,
        "return_type": TYPE_BOOLEAN,
        "left": left,
        "right": right
    }

def _handle_boolop(node: ast.BoolOp, definitions: dict, references: set):
    op_str = LOGICAL_OPS[type(node.op)]
    values = [_convert(v, definitions, references) for v in node.values]
    
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

def _handle_unaryop(node: ast.UnaryOp, definitions: dict, references: set):
    op_str = ALLOWED_UNARY[type(node.op)]
    operand = _convert(node.operand, definitions, references)
    
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

# --- Call (関数呼び出し) 処理の細分化 ---

def _process_switch(args):
    if len(args) < 4 or len(args) % 2 != 0:
        raise ValueError("switch関数は(target, case1, res1, ..., default)の順で指定し、引数は偶数個(最低4つ)である必要があります。")

    target = args[0]
    default_node = args[-1]
    pairs = args[1:-1]

    ret_type = default_node.get("return_type")
    current_node = default_node

    _validate_context(target, TYPE_ANY, "switch target")

    for i in range(len(pairs) - 2, -1, -2):
        case_val = pairs[i]
        res_val = pairs[i+1]
        condition = None

        _validate_context(case_val, TYPE_ANY, "switch case")

        # 特殊なショートハンド処理 (_ == target)
        if case_val.get("type") == "binary":
            if case_val.get("left", {}).get("type") == "name" and case_val["left"].get("id") == "_":
                case_val["left"] = target
                condition = case_val
            elif case_val.get("right", {}).get("type") == "name" and case_val["right"].get("id") == "_":
                case_val["right"] = target
                condition = case_val

        if condition is None:
            condition = {
                "type": "binary", "op": "==",
                "return_type": TYPE_BOOLEAN,
                "left": target, "right": case_val
            }

        if res_val.get("type") == "end":
            pass
        else:
            _validate_context(res_val, ret_type, "switch result")

        current_node = {
            "type": "flow_control",
            "name": "if",
            "return_type": ret_type,
            "args": [condition, res_val, current_node]
        }
    return current_node

def _process_user_defined_func(func_name, args, definition, references):
    input_types = _get_attr(definition, "input_type", [])
    classification = _get_attr(definition, "classification")
    return_type = _get_attr(definition, "return_type")
    is_variable_or_calc = classification in ["variable", "calculated"]

    if is_variable_or_calc:
        if len(args) == len(input_types):
            for i, (arg_node, expected_type) in enumerate(zip(args, input_types)):
                _validate_context(arg_node, expected_type, f"{func_name} 引数{i+1}")
        elif len(args) == 0:
            pass
        else:
            raise ValueError(f"変数 '{func_name}' の引数数が不正です。")
    else:
        if len(args) != len(input_types):
             raise ValueError(f"関数 '{func_name}' の引数数が一致しません。")
        for i, (arg_node, expected_type) in enumerate(zip(args, input_types)):
            _validate_context(arg_node, expected_type, f"{func_name} 引数{i+1}")

    references.add(func_name)

    if classification == "function":
        func_ast = _get_attr(definition, "ast")
        if not func_ast:
            raise ValueError(f"関数 '{func_name}' のASTがありません。")
        inner_args = _get_attr(func_ast, "args")
        raw_body = copy.deepcopy(inner_args[0])
        return _inject_arguments(raw_body, args)
    else:
        return {
            "type": "reference",
            "name": func_name,
            "classification": classification,
            "return_type": return_type,
            "args": args
        }

def _process_standard_func(func_name, args):
    conf = FUNC_CONFIG.get(func_name)
    if not conf:
        raise ValueError(f"未定義の関数です: {func_name}")

    if len(conf["inputs"]) != len(args):
        raise ValueError(f"関数 '{func_name}' の引数数が一致しません。")

    for i, (expected, arg_node) in enumerate(zip(conf["inputs"], args)):
        if expected == TYPE_WINDOW:
            if arg_node["type"] != "constant" or arg_node["return_type"] != TYPE_NUMBER:
                raise ValueError(f"関数 '{func_name}' の第{i+1}引数(Window)には数値を指定してください。")
        elif expected == TYPE_VALUE_ONLY:
            if arg_node["type"] != "value":
                raise ValueError(f"関数 '{func_name}' の第{i+1}引数はフィールド直接指定のみ可能です。")
        else:
            # SequenceやEndを排除するために検証を実行 (TYPE_ANYでもvoidチェックは行う)
            check_type = expected if expected != TYPE_ANY else TYPE_ANY
            _validate_context(arg_node, check_type, f"{func_name} arg{i+1}")

    final_ret = conf["output"]
    if final_ret == TYPE_ANY:
        final_ret = args[0].get("return_type")

    result = {
        "type": "func", 
        "name": func_name, 
        "category": conf["category"], 
        "return_type": final_ret,
        "args": args
    }
    
    if conf["category"] == "time_func":
        result["window"] = args[-1]["value"]
            
    return result

def _handle_call(node: ast.Call, definitions: dict, references: set):
    if not isinstance(node.func, ast.Name):
        raise ValueError("不正な関数形式です。")
    
    func_name = node.func.id
    args = [_convert(a, definitions, references) for a in node.args]

    # 1. Sequence (フロー制御)
    if func_name == "sequence":
        return {
            "type": "flow_control",
            "name": "sequence",
            "return_type": None, 
            "args": args
        }

    # 2. Switch (展開処理)
    if func_name == "switch":
        return _process_switch(args)

    # 3. 定義済み関数/変数 (Cached Definition)
    if func_name in definitions:
        return _process_user_defined_func(func_name, args, definitions[func_name], references)

    # 4. 標準関数 (FUNC_CONFIG)
    return _process_standard_func(func_name, args)

# --- メインロジック ---

def _convert(node, definitions: dict, references: set):
    """ASTノードを内部辞書形式に変換し、型チェックを行います"""
    
    if isinstance(node, ast.Constant):
        return _handle_constant(node)
    
    if isinstance(node, ast.Attribute):
        return _handle_attribute(node)
    
    if isinstance(node, ast.Name):
        return _handle_name(node, definitions)
    
    if isinstance(node, ast.BinOp):
        return _handle_binop(node, definitions, references)
    
    if isinstance(node, ast.Compare):
        return _handle_compare(node, definitions, references)
    
    if isinstance(node, ast.BoolOp):
        return _handle_boolop(node, definitions, references)
    
    if isinstance(node, ast.UnaryOp):
        return _handle_unaryop(node, definitions, references)
    
    if isinstance(node, ast.Call):
        return _handle_call(node, definitions, references)

    raise ValueError(f"許可されていない構文要素です: {type(node).__name__}")

def parse_expression(expr: str, cached_definition: list):
    """
    数式文字列を解析し、定義情報を利用して変換結果と参照変数を返します。
    """
    if not expr or not expr.strip():
        raise ValueError("式が空です。")
    
    if cached_definition is None:
        cached_definition = []

    definitions_map = {}
    for item in cached_definition:
        name = _get_attr(item, "name")
        if name:
            definitions_map[name] = item

    collected_references = set()

    try:
        tree = ast.parse(expr.strip(), mode="eval")
        ast_result = _convert(tree.body, definitions_map, collected_references)
        
        return {
            "result": ast_result,
            "references": list(collected_references)
        }
    except SyntaxError as e:
        raise ValueError(f"式の構文が正しくありません (位置 {e.offset}): {e.msg}")