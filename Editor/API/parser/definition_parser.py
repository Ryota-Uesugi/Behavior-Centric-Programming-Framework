import ast
import copy
from .definitions import (
    TYPE_NUMBER, TYPE_BOOLEAN, TYPE_STRING, TYPE_ANY, TYPE_WINDOW, TYPE_VALUE_ONLY,
    FUNC_CONFIG,
    ARITHMETIC_OPS, COMPARISON_OPS, LOGICAL_OPS, ALLOWED_UNARY
)

# --- 定数 ---
RESULT_TYPE_VARIABLE = "variable"
RESULT_TYPE_CALCULATED = "calculated"
RESULT_TYPE_FUNCTION = "function"

# --- ヘルパー: 安全な属性取得 ---
def _get_attr(item, key, default=None):
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)

# --- ヘルパー: AST注入 ---
def _inject_arguments(ast_node, args_list):
    pending_args = list(args_list)
    def _traverse(node):
        if isinstance(node, dict):
            if node.get("type") == "variable":
                if not pending_args: raise ValueError("引数不足")
                return copy.deepcopy(pending_args.pop(0))
            return {k: _traverse(v) for k, v in node.items()}
        if isinstance(node, list):
            return [_traverse(item) for item in node]
        return node
    return _traverse(ast_node)

# --- ヘルパー: 構造探索 ---
def _find_node(node, predicate):
    if predicate(node): return True
    if isinstance(node, dict):
        for val in node.values():
            if _find_node(val, predicate): return True
    elif isinstance(node, list):
        for item in node:
            if _find_node(item, predicate): return True
    return False

def _has_dynamic_source(node):
    return _find_node(node, lambda n: isinstance(n, dict) and (
        (n.get("type") == "variable" and n.get("id") == "input") or
        (n.get("type") == "value")
    ))

def _has_calculation_element(node):
    ops = {"binary", "unary", "func", "flow_control"}
    return _find_node(node, lambda n: isinstance(n, dict) and n.get("type") in ops)

# --- 型検証 ---
def _validate_context(node: dict, expected_type: str, op_name: str = "operation"):
    """
    ノードが期待される型を持っているか検証します。
    SequenceやEndなど、値を返さない要素が計算式に含まれている場合はエラーとします。
    """
    is_void_node = (node.get("name") == "sequence") or (node.get("return_type") is None)
    
    if is_void_node:
        if expected_type is not None:
            if node.get("type") == "end":
                raise ValueError(f"キーワード 'End' は値を返さないため、'{op_name}' の一部として使用できません。")
            elif node.get("name") == "sequence":
                 raise ValueError(f"Sequenceブロックは値を返さないため、'{op_name}' の一部として使用できません。")
            else:
                 raise ValueError(f"この要素は値を返さないため、'{op_name}' の一部として使用できません。")

    if expected_type == TYPE_ANY: return

    # if文(flow_control)の再帰検証
    if node.get("type") == "flow_control" and node.get("name") == "if":
        if len(node.get("args", [])) >= 3:
            _validate_context(node["args"][1], expected_type, f"if-then ({op_name})")
            _validate_context(node["args"][2], expected_type, f"if-else ({op_name})")
        return

    actual_type = node.get("return_type")
    
    if actual_type == TYPE_ANY: return
    
    if actual_type != expected_type:
        raise ValueError(f"型エラー: '{op_name}' は {expected_type} を期待していますが、{actual_type} が指定されました。")

# --- ハンドラ関数群 ---

def _handle_constant(node):
    val = node.value
    if isinstance(val, bool): v_type = TYPE_BOOLEAN
    elif isinstance(val, (int, float)): v_type = TYPE_NUMBER
    elif isinstance(val, str): v_type = TYPE_STRING
    else: v_type = TYPE_ANY
    return {"type": "constant", "value": val, "return_type": v_type}

def _handle_attribute(node):
    if not isinstance(node.value, ast.Name):
        raise ValueError("属性アクセス形式が不正です。")
    return {"type": "value", "messageType": node.value.id, "field": node.attr, "return_type": TYPE_NUMBER}

def _handle_name(node, expected_context_type, captured_inputs, definitions):
    var_id = node.id
    var_id_lower = var_id.lower()
    
    # 定義済み変数のチェック
    if var_id in definitions and var_id != "_":
         raise ValueError(f"定義済み項目 '{var_id}' は関数形式として呼び出してください。")

    # 予約語のチェック
    if var_id_lower == "input":
        inferred = expected_context_type 
        captured_inputs.append(inferred)
        return {"type": "variable", "id": "input", "return_type": inferred}
    
    if var_id_lower == "true": return {"type": "constant", "value": True, "return_type": TYPE_BOOLEAN}
    if var_id_lower == "false": return {"type": "constant", "value": False, "return_type": TYPE_BOOLEAN}
    if var_id == "_": return {"type": "name", "id": "_", "return_type": TYPE_ANY}

    if var_id_lower == "end":
        return {"type": "end", "return_type": None}

    raise ValueError(f"未定義の変数です: {var_id}")

def _handle_binop(node, captured_inputs, definitions, references):
    op_type = type(node.op)
    if op_type not in ARITHMETIC_OPS: raise ValueError(f"未対応の演算子: {op_type}")
    op_str = ARITHMETIC_OPS[op_type]
    left = _convert(node.left, TYPE_NUMBER, captured_inputs, definitions, references)
    right = _convert(node.right, TYPE_NUMBER, captured_inputs, definitions, references)
    
    _validate_context(left, TYPE_NUMBER, op_str)
    _validate_context(right, TYPE_NUMBER, op_str)
    
    return {"type": "binary", "op": op_str, "return_type": TYPE_NUMBER, "left": left, "right": right}

def _handle_compare(node, captured_inputs, definitions, references):
    if len(node.ops) > 1: raise ValueError("比較演算の連結は不可です。")
    op_type = type(node.ops[0])
    op_str = COMPARISON_OPS.get(op_type) or ARITHMETIC_OPS.get(op_type)
    if not op_str: raise ValueError(f"未対応の比較演算子です。")
    
    target_type = TYPE_NUMBER 
    if op_str in ["==", "!="]:
        dummy_capture = []
        right_probe = _convert(node.comparators[0], TYPE_ANY, dummy_capture, definitions, references)
        r_type = right_probe.get("return_type")
        if r_type != TYPE_ANY and r_type is not None:
            target_type = r_type
        else:
            left_probe = _convert(node.left, TYPE_ANY, dummy_capture, definitions, references)
            l_type = left_probe.get("return_type")
            if l_type != TYPE_ANY and l_type is not None: target_type = l_type

    left = _convert(node.left, target_type, captured_inputs, definitions, references)
    right = _convert(node.comparators[0], target_type, captured_inputs, definitions, references)
    
    _validate_context(left, target_type, op_str)
    _validate_context(right, target_type, op_str)
    
    return {"type": "binary", "op": op_str, "return_type": TYPE_BOOLEAN, "left": left, "right": right}

def _handle_boolop(node, captured_inputs, definitions, references):
    op_str = LOGICAL_OPS[type(node.op)]
    values = [_convert(v, TYPE_BOOLEAN, captured_inputs, definitions, references) for v in node.values]
    for v in values: _validate_context(v, TYPE_BOOLEAN, op_str)
    res = values[0]
    for next_val in values[1:]:
        res = {"type": "binary", "op": op_str, "return_type": TYPE_BOOLEAN, "left": res, "right": next_val}
    return res

def _handle_unaryop(node, captured_inputs, definitions, references):
    op_str = ALLOWED_UNARY.get(type(node.op))
    if not op_str: raise ValueError(f"未対応の単項演算子です。")
    ctx = TYPE_BOOLEAN if op_str == "not" else TYPE_NUMBER
    operand = _convert(node.operand, ctx, captured_inputs, definitions, references)
    _validate_context(operand, ctx, op_str)
    return {"type": "unary", "op": op_str, "return_type": ctx, "node": operand}

# --- Callハンドラ (Switch, Result, Sequence, Funcなど) ---

def _handle_call_sequence(node, captured_inputs, definitions, references):
    args = [_convert(a, TYPE_ANY, captured_inputs, definitions, references) for a in node.args]
    return {
        "type": "flow_control",
        "name": "sequence",
        "return_type": None,
        "args": args
    }

def _handle_call_switch(node, expected_context_type, captured_inputs, definitions, references):
    raw_args = node.args
    if len(raw_args) < 4 or len(raw_args) % 2 != 0: raise ValueError("switch引数エラー")

    dummy_capture = []
    inferred_target_type = TYPE_ANY
    inferred_return_type = expected_context_type

    # Pass 1: Target Type Inference
    target_types_found = set()
    for i in range(1, len(raw_args), 2):
        if i >= len(raw_args) - 1: break
        converted = _convert(raw_args[i], TYPE_ANY, dummy_capture, definitions, references)
        detected = None
        if converted.get("op") in ["==", "!=", ">", "<", ">=", "<="]: pass
        elif converted.get("type") in ["constant", "constant_list"]:
            if converted.get("return_type") != TYPE_ANY: detected = converted.get("return_type")
        if detected: target_types_found.add(detected)
    
    concrete_targets = {t for t in target_types_found if t != TYPE_ANY and t is not None}
    if len(concrete_targets) == 1: inferred_target_type = list(concrete_targets)[0]
    else: inferred_target_type = TYPE_NUMBER

    # Pass 1: Result Type Inference
    result_types_found = set()
    result_indices = list(range(2, len(raw_args), 2)) + [len(raw_args) - 1]
    for i in result_indices:
        converted = _convert(raw_args[i], TYPE_ANY, dummy_capture, definitions, references)
        t = converted.get("return_type")
        if t and t != TYPE_ANY: result_types_found.add(t)
    
    has_void_result = any(t is None for t in result_types_found)

    if inferred_return_type == TYPE_ANY:
        concrete_results = {t for t in result_types_found if t != TYPE_ANY and t is not None}
        if concrete_results:
            if TYPE_NUMBER in concrete_results: inferred_return_type = TYPE_NUMBER
            elif TYPE_STRING in concrete_results: inferred_return_type = TYPE_STRING
            elif TYPE_BOOLEAN in concrete_results: inferred_return_type = TYPE_BOOLEAN
        elif has_void_result:
            inferred_return_type = None 
        else:
            inferred_return_type = TYPE_NUMBER

    # Pass 2: Production
    converted_args = [None] * len(raw_args)
    for i in range(len(raw_args)):
        if i == 0: # Target
            converted_args[i] = _convert(raw_args[i], inferred_target_type, captured_inputs, definitions, references)
            if inferred_target_type != TYPE_ANY:
                 _validate_context(converted_args[i], inferred_target_type, "switch target")
        elif (i % 2 != 0) and (i < len(raw_args) - 1): # Case
            converted_args[i] = _convert(raw_args[i], TYPE_ANY, captured_inputs, definitions, references)
            _validate_context(converted_args[i], TYPE_ANY, "switch case")
        else: # Result
            converted_args[i] = _convert(raw_args[i], inferred_return_type, captured_inputs, definitions, references)

    args = converted_args
    target = args[0]
    default_node = args[-1]
    pairs = args[1:-1]
    
    ret_type = default_node.get("return_type")
    if inferred_return_type != TYPE_ANY: ret_type = inferred_return_type

    current_node = default_node
    for i in range(len(pairs) - 2, -1, -2):
        case_val = pairs[i]
        res_val = pairs[i+1]
        condition = None
        
        # _ == target logic
        if _find_node(case_val, lambda n: isinstance(n, dict) and n.get("id") == "_"):
            def _replace(n):
                if isinstance(n, dict):
                     if n.get("id") == "_": return copy.deepcopy(target)
                     return {k: _replace(v) for k, v in n.items()}
                if isinstance(n, list): return [_replace(x) for x in n]
                return n
            condition = _replace(case_val)
        
        if condition is None:
            if inferred_target_type != TYPE_ANY and case_val.get("return_type") != TYPE_ANY:
                 if inferred_target_type != case_val.get("return_type"): raise ValueError("Type Mismatch")
            condition = {"type": "binary", "op": "==", "return_type": TYPE_BOOLEAN, "left": copy.deepcopy(target), "right": case_val}

        _validate_context(res_val, ret_type, "switch result")
        current_node = {"type": "flow_control", "name": "if", "return_type": ret_type, "args": [condition, res_val, current_node]}
    return current_node

def _handle_call_result(node, captured_inputs, definitions, references):
    args = [_convert(a, TYPE_ANY, captured_inputs, definitions, references) for a in node.args]
    ret_type = args[0].get("return_type", TYPE_ANY) if args else TYPE_ANY
    return {"type": "func", "name": "result", "category": "wrapper", "return_type": ret_type, "args": args}

def _handle_call_defined_func(node, func_name, definition, captured_inputs, definitions, references):
    def_input_types = _get_attr(definition, "input_type", [])
    classification = _get_attr(definition, "classification")
    return_type = _get_attr(definition, "return_type")

    args = []
    raw_args = node.args
    is_strict = (len(raw_args) == len(def_input_types))
    for i, arg_node in enumerate(raw_args):
        expected = def_input_types[i] if is_strict else TYPE_ANY
        args.append(_convert(arg_node, expected, captured_inputs, definitions, references))

    if classification in ["variable", "calculated"]:
        if len(args) == len(def_input_types):
             for i, (a, e) in enumerate(zip(args, def_input_types)): _validate_context(a, e, f"{func_name} 引数{i+1}")
        elif len(args) != 0: raise ValueError(f"引数不一致: {func_name}")
    else:
         if len(args) != len(def_input_types): raise ValueError(f"引数不一致: {func_name}")
         for i, (a, e) in enumerate(zip(args, def_input_types)): _validate_context(a, e, f"{func_name} 引数{i+1}")
    references.add(func_name)

    if classification == "function":
        func_ast = _get_attr(definition, "ast")
        raw_body = copy.deepcopy(_get_attr(func_ast, "args")[0])
        return _inject_arguments(raw_body, args)
    else:
        return {"type": "reference", "name": func_name, "classification": classification, "return_type": return_type, "args": args}

def _handle_call_standard_func(node, func_name_lower, captured_inputs, definitions, references):
    conf = FUNC_CONFIG.get(func_name_lower)
    if not conf: raise ValueError(f"未定義: {func_name_lower}")

    if len(node.args) != len(conf["inputs"]):
         raise ValueError(f"関数 '{func_name_lower}' は {len(conf['inputs'])} 個の引数を期待していますが、{len(node.args)} 個指定されました。")

    args = []
    for i, arg_node in enumerate(node.args):
        expected = conf["inputs"][i] if i < len(conf["inputs"]) else TYPE_ANY
        converted_arg = _convert(arg_node, expected, captured_inputs, definitions, references)
        
        if expected == TYPE_WINDOW:
             if converted_arg["type"] != "constant" or converted_arg["return_type"] != TYPE_NUMBER:
                  raise ValueError(f"関数 '{func_name_lower}' の第{i+1}引数(Window)には数値を指定してください。")
        elif expected == TYPE_VALUE_ONLY:
             if converted_arg["type"] != "value":
                   raise ValueError(f"関数 '{func_name_lower}' の第{i+1}引数はフィールド直接指定のみ可能です。")
        elif expected != TYPE_ANY:
             _validate_context(converted_arg, expected, f"{func_name_lower} arg{i+1}")
        else:
             _validate_context(converted_arg, TYPE_ANY, f"{func_name_lower} arg{i+1}")
        
        args.append(converted_arg)
    
    final_ret = conf["output"]
    if final_ret == TYPE_ANY and args: final_ret = args[0].get("return_type", TYPE_ANY)
    res = {"type": "func", "name": func_name_lower, "category": conf["category"], "return_type": final_ret, "args": args}
    if conf["category"] == "time_func": res["window"] = args[-1].get("value")
    return res

def _handle_call(node, expected_context_type, captured_inputs, definitions, references):
    func_name = node.func.id
    func_name_lower = func_name.lower()

    if func_name_lower == "sequence":
        return _handle_call_sequence(node, captured_inputs, definitions, references)
    
    if func_name_lower == "switch":
        return _handle_call_switch(node, expected_context_type, captured_inputs, definitions, references)
    
    if func_name_lower == "result":
        return _handle_call_result(node, captured_inputs, definitions, references)
    
    if func_name in definitions:
        return _handle_call_defined_func(node, func_name, definitions[func_name], captured_inputs, definitions, references)
    
    return _handle_call_standard_func(node, func_name_lower, captured_inputs, definitions, references)


# --- 変換コア (Dispatcher) ---
def _convert(node, expected_context_type=TYPE_ANY, captured_inputs=None, definitions=None, references=None):
    """ASTノードを内部辞書形式に変換し、型チェックを行います"""
    
    # Init Defaults (Recursionのため)
    if captured_inputs is None: captured_inputs = []
    if definitions is None: definitions = {}
    if references is None: references = set()

    if isinstance(node, ast.Constant):
        return _handle_constant(node)
    
    if isinstance(node, ast.Attribute):
        return _handle_attribute(node)
    
    if isinstance(node, ast.Name):
        return _handle_name(node, expected_context_type, captured_inputs, definitions)
    
    if isinstance(node, ast.BinOp):
        return _handle_binop(node, captured_inputs, definitions, references)
    
    if isinstance(node, ast.Compare):
        return _handle_compare(node, captured_inputs, definitions, references)
    
    if isinstance(node, ast.BoolOp):
        return _handle_boolop(node, captured_inputs, definitions, references)
    
    if isinstance(node, ast.UnaryOp):
        return _handle_unaryop(node, captured_inputs, definitions, references)
    
    if isinstance(node, ast.Call):
        return _handle_call(node, expected_context_type, captured_inputs, definitions, references)

    raise ValueError(f"許可されていない構文要素です: {type(node).__name__}")


# --- メイン解析 ---
def parse_definition(expr: str, cached_definition: list = None):
    """
    数式文字列を解析し、定義情報を利用して変換結果と参照変数を返します。
    """
    if not expr or not expr.strip(): raise ValueError("式が空です。")
    stripped_expr = expr.strip()
    # return キーワードを result 関数に置換
    if stripped_expr.startswith("return"): stripped_expr = stripped_expr.replace("return", "result", 1)

    definitions_map = { _get_attr(item, "name"): item for item in (cached_definition or []) if _get_attr(item, "name") }

    try:
        tree = ast.parse(stripped_expr, mode="eval")
        input_types = []
        collected_references = set()
        
        expression_structure = _convert(
            tree.body, 
            expected_context_type=TYPE_ANY, 
            captured_inputs=input_types,
            definitions=definitions_map,
            references=collected_references
        )
        
        # Input単体の定義禁止チェック
        if expression_structure.get("type") == "variable" and expression_structure.get("id") == "input":
             raise ValueError("Input単体での定義は許可されていません。演算や関数と組み合わせて使用してください。")

        # AST内の "Any" Inputノードを "Number" に修正
        def _fix_any_nodes(node):
            if isinstance(node, dict):
                if node.get("type") == "variable" and node.get("id") == "input" and node.get("return_type") == TYPE_ANY:
                    node["return_type"] = TYPE_NUMBER
                for v in node.values(): _fix_any_nodes(v)
            elif isinstance(node, list):
                for item in node: _fix_any_nodes(item)
        _fix_any_nodes(expression_structure)

        # input_types の "Any" を "Number" に修正
        for i, t in enumerate(input_types):
            if t == TYPE_ANY: input_types[i] = TYPE_NUMBER
        
        overall_ret = expression_structure.get("return_type", TYPE_ANY)
        if overall_ret == TYPE_ANY:
            overall_ret = TYPE_NUMBER
            if expression_structure.get("type") == "variable" and expression_structure.get("id") == "input":
                expression_structure["return_type"] = TYPE_NUMBER

        is_result_wrapper = (expression_structure.get("type") == "func" and expression_structure.get("name") == "result")
        
        base_res = {
            "name": "test_node",
            "definition": expr,
            "ast": expression_structure,
            "input_types": input_types,
            "references": list(collected_references),
            "overall_return_type": overall_ret
        }

        if is_result_wrapper:
            if len(input_types) > 0: base_res["classification"] = RESULT_TYPE_FUNCTION
            else:
                base_res["classification"] = RESULT_TYPE_VARIABLE
                if expression_structure["args"]:
                    inner = expression_structure["args"][0]
                    if inner.get("type") in ("constant", "constant_list"):
                         base_res["initial_value"] = inner.get("value")
        else:
            if _has_dynamic_source(expression_structure):
                base_res["classification"] = RESULT_TYPE_CALCULATED
            elif _has_calculation_element(expression_structure):
                base_res["classification"] = RESULT_TYPE_CALCULATED
            else:
                base_res["classification"] = RESULT_TYPE_VARIABLE
                if expression_structure.get("type") in ("constant", "constant_list"):
                    base_res["initial_value"] = expression_structure.get("value")
                    base_res["input_types"] = [overall_ret]

        return base_res

    except Exception as e:
        raise e