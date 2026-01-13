import ast
import re

# --- 1. Type Constant Definitions ---
TYPE_NUMBER = "number"
TYPE_BOOLEAN = "boolean"
TYPE_STRING = "string"       # String type
TYPE_ANY = "any"
TYPE_WINDOW = "window"       # For time windows (numeric constants only)
TYPE_VALUE_ONLY = "raw_val"  # For functions requiring history (attribute access only)

# --- 2. Function Configuration ---
# category: Function classification
# inputs: Expected types for each argument
# output: Return value type
FUNC_CONFIG = {
    # ==========================================
    # Drone Control Functions
    # ==========================================
    # Takeoff: takeoff(altitude[m])
    "takeoff": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },
    # Land: land()
    "land": {
        "category": "control_func",
        "inputs": [],
        "output": TYPE_BOOLEAN
    },
    # Arm: arm()
    "arm": {
        "category": "control_func",
        "inputs": [],
        "output": TYPE_BOOLEAN
    },
    # Disarm: disarm()
    "disarm": {
        "category": "control_func",
        "inputs": [],
        "output": TYPE_BOOLEAN
    },
    # Set Mode: set_mode("GUIDED", etc.)
    "set_mode": {
        "category": "control_func",
        "inputs": [TYPE_STRING],
        "output": TYPE_BOOLEAN
    },
    # Velocity Control: set_velocity(vx, vy, vz, yaw_rate)
    "set_velocity": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },
    # Position Control: goto(x, y, z, yaw)
    "goto": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },
    # General Command: command(id, p1, p2, p3, p4, p5, p6, p7)
    "command": {
        "category": "control_func",
        "inputs": [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER],
        "output": TYPE_BOOLEAN
    },

    # --- Arithmetic/Calculation Functions ---
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
    
    # --- History/Statistics Functions ---
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

    # --- Export Functions ---
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


# --- 3. Operator Definitions ---
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

# --- 4. Type Validation Helper ---
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
        raise ValueError(f"Type Error: '{op_name}' expects {expected_type}, but {node['return_type']} was provided.")


def parse_expression(expr: str):
    if not expr or not expr.strip():
        raise ValueError("Expression is empty.")
    
    processed_expr = re.sub(r'\bif\s*\(', 'if_run(', expr.strip())

    try:
        tree = ast.parse(processed_expr, mode="eval")
        return _convert(tree.body)
    except SyntaxError as e:
        raise ValueError(f"Invalid expression syntax (position {e.offset}): {e.msg}")

def _convert(node):
    # 1. Constants
    if isinstance(node, ast.Constant):
        val = node.value
        if isinstance(val, bool): v_type = TYPE_BOOLEAN
        elif isinstance(val, (int, float)): v_type = TYPE_NUMBER
        elif isinstance(val, str): v_type = TYPE_STRING
        else: raise ValueError(f"Unsupported data type: {type(val)}")
        return {"type": "constant", "value_type": v_type, "value": val, "return_type": v_type}

    # 2. Attribute Access
    if isinstance(node, ast.Attribute):
        if not isinstance(node.value, ast.Name):
            raise ValueError("Invalid attribute access format.")
        return {"type": "value", "messageType": node.value.id, "field": node.attr, "return_type": TYPE_NUMBER}

    # 3. Names
    if isinstance(node, ast.Name):
        return {"type": "name", "id": node.id, "return_type": TYPE_ANY}

    # 4. Binary Operations
    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in ARITHMETIC_OPS:
            raise ValueError(f"Unsupported operator: {op_type}")
        
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

    # 5. Comparison Operations
    if isinstance(node, ast.Compare):
        if len(node.ops) > 1:
            raise ValueError("Chained comparison operators are not allowed.")
        
        op_type = type(node.ops[0])
        op_str = ARITHMETIC_OPS.get(op_type) or COMPARISON_OPS.get(op_type)
        if not op_str:
            raise ValueError(f"Unsupported comparison operator.")
            
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

    # 6. Logical Operations
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

    # 7. Unary Operations
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

    # 8. Function Calls
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Invalid function format.")
        
        func_name = node.func.id
        args = [_convert(a) for a in node.args]

        # --- If Statement (flow_control) ---
        if func_name == "if_run":
            if len(args) != 3:
                raise ValueError(f"The 'if' statement requires 3 arguments (condition, true_case, false_case).")
            
            _validate_context(args[0], TYPE_BOOLEAN, "if-condition")

            then_type = args[1]["return_type"]
            else_type = args[2]["return_type"]
            
            if then_type == TYPE_NUMBER and else_type == TYPE_NUMBER:
                final_ret = TYPE_NUMBER
            elif then_type == TYPE_BOOLEAN and else_type == TYPE_BOOLEAN:
                final_ret = TYPE_BOOLEAN
            else:
                final_ret = TYPE_ANY

            # args are added last
            return {
                "type": "flow_control",
                "name": "if", 
                "return_type": final_ret,  
                "args": args
            }

        # --- Standard Function ---
        conf = FUNC_CONFIG.get(func_name)

        if not conf:
            raise ValueError(f"Undefined function: {func_name}")

        if len(conf["inputs"]) != len(args):
            raise ValueError(f"Function '{func_name}' requires {len(conf['inputs'])} arguments, but {len(args)} were provided.")

        for i, (expected, arg_node) in enumerate(zip(conf["inputs"], args)):
            if expected == TYPE_WINDOW:
                if arg_node["type"] != "constant" or arg_node["return_type"] != TYPE_NUMBER:
                    raise ValueError(f"Argument {i+1} (Window) of function '{func_name}' must be a number.")
            elif expected == TYPE_VALUE_ONLY:
                if arg_node["type"] != "value":
                    raise ValueError(f"Argument {i+1} of function '{func_name}' allows only direct field specification.")
            elif expected != TYPE_ANY:
                _validate_context(arg_node, expected, f"{func_name} arg{i+1}")

        final_ret = conf["output"]
        if final_ret == TYPE_ANY:
            final_ret = args[0]["return_type"]

        # [Change] Control dictionary construction order so 'args' comes last
        result = {
            "type": "func", 
            "name": func_name, 
            "category": conf["category"], 
            "return_type": final_ret
        }
        
        # If there is window information, add it before args
        if conf["category"] == "time_func":
            result["window"] = args[-1]["value"]
        
        # Add args last
        result["args"] = args
                
        return result

    raise ValueError(f"Unauthorized syntax element: {type(node).__name__}")