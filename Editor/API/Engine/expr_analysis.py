# Match the type names defined in the parser
TYPE_NUMBER = "number"
TYPE_BOOLEAN = "boolean"
TYPE_STRING = "string"
TYPE_ANY = "any"

class ExprInfo:
    def __init__(self):
        self.return_type = None     # Final return type
        self.window_sec = None      # Minimum detected window value
        self.time_dependent = False # Presence of time-dependent functions
        self.dependencies = set()   # ★Added: Set of dependency fields

def analyze_expr(node, valid_state=None) -> ExprInfo:
    info = ExprInfo()
    if not node:
        return info
    
    # 1. Get the type of the root node (Keep existing logic as is)
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
    
    # 2. Tree analysis (includes dependency extraction)
    _recursive_analyze(node, info, valid_state)
    return info

def _recursive_analyze(node, info: ExprInfo, valid_state: dict = None):
    if not node or not isinstance(node, dict):
        return

    t = node.get("type")

    # Field validation & ★Record dependencies
    if t == "value":
        m_type = node.get("messageType")
        field = node.get("field")
        
        # 1. Validation
        if valid_state:
            if m_type not in valid_state or field not in valid_state.get(m_type, {}):
                # Raise an error or pass as needed
                pass 

        # 2. Add to dependency set (e.g., "BATTERY_STATUS.volt")
        if m_type and field:
            info.dependencies.add(f"{m_type}.{field}")

    # Time-dependency check
    if t == "func":
        if node.get("category") == "time_func" or node.get("time_dependent"):
            info.time_dependent = True
            w = node.get("window")
            if w is not None:
                if info.window_sec is None or w < info.window_sec:
                    info.window_sec = w

    # Recursion for child nodes
    for arg in node.get("args", []):
        _recursive_analyze(arg, info, valid_state)
    _recursive_analyze(node.get("left"), info, valid_state)
    _recursive_analyze(node.get("right"), info, valid_state)
    _recursive_analyze(node.get("node"), info, valid_state)

def decide_notify_mode(ast, info: ExprInfo):
    
    node_name = ast.get("name")

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
            raise ValueError("Numeric-only expressions are unsuitable for alerts. Please use a comparison expression or use Notify().")

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
        
        raise ValueError("Could not identify the expression type.")

    raise ValueError(f"Cannot determine notification mode (Return Type: {info.return_type})")