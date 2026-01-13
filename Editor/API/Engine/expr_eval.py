from logger import logger
from .component.func_register import FUNCTION_REGISTRY

class ExpressionEvaluator:
    def __init__(self, history, states, drone_controller=None):
        self.history = history
        self.states = states
        self.drone = drone_controller 
        
        if "_cooldowns" not in self.states:
            self.states["_cooldowns"] = {}

    def eval(self, node, now=None):
        if node is None: return None
        node_type = node.get("type")

        try:
            if node_type == "constant":
                return node.get("value")

            if node_type == "value":
                m_type = node.get("messageType")
                field = node.get("field")
                msg_hist = self.history.get(m_type, {})
                field_hist = msg_hist.get(field)
                if not msg_hist or not field_hist: return None
                return field_hist[-1][1]

            if node_type == "name":
                return self.states.get(node.get("id"))

            if node_type == "unary":
                v = self.eval(node["node"], now)
                if v is None: return None
                op = node["op"]
                if op == "not": return not v
                if op == "-":   return -v
                if op == "+":   return +v
                if op == "~":   return ~int(v)
                return None

            if node_type == "binary":
                # Short-circuit evaluation
                if node["op"] == "and":
                    return self.eval(node["left"], now) and self.eval(node["right"], now)
                if node["op"] == "or":
                    return self.eval(node["left"], now) or self.eval(node["right"], now)
                
                a = self.eval(node["left"], now)
                b = self.eval(node["right"], now)
                if a is None or b is None: return None
                return self._apply_binary(a, b, node["op"])

            # Handle both 'func' and 'flow_control' collectively here
            if node_type == "func" or node_type == "flow_control":
                return self._eval_func(node, now)

            return None

        except Exception as e:
            logger.error(f"Eval Error: {e}")
            return None

    def _apply_binary(self, a, b, op):
        # (Content of existing _apply_binary remains unchanged)
        try:
            if op == "+":  return a + b
            if op == "-":  return a - b
            if op == "*":  return a * b
            if op == "/":  return a / b if b != 0 else None
            if op == "%":  return a % b
            if op == "**": return a ** b
            if op == ">":  return a > b
            if op == "<":  return a < b
            if op == ">=": return a >= b
            if op == "<=": return a <= b
            if op == "==": return a == b
            if op == "!=": return a != b
            ia, ib = int(a), int(b)
            if op == "&":  return ia & ib
            if op == "|":  return ia | ib
            if op == "^":  return ia ^ ib
            if op == "<<": return ia << ib
            if op == ">>": return ia >> ib
        except:
            return None

    def _eval_func(self, node, now):
        name = node["name"]

        # 1. Treat IF statements as special flow control (Hardcoding recommended here only)
        if name == "if":
             return self._handle_if(node, now)

        # 2. Retrieve handler from registry (Fast lookup)
        entry = FUNCTION_REGISTRY.get(name)
        if not entry:
            logger.warning(f"Unknown function: {name}")
            return None

        handler, auto_eval_args = entry
        raw_args = node.get("args", [])

        try:
            # 3. Argument processing
            if auto_eval_args:
                # Pre-evaluation mode: For numerical calculations and actions
                eval_args = []
                for a in raw_args:
                    val = self.eval(a, now)
                    if val is None: return None # If argument calculation fails, function returns None
                    eval_args.append(val)
                # Execute handler (pass evaluated arguments)
                return handler(self, name, eval_args, node, now)
            else:
                # Lazy evaluation / Raw data mode: For statistics and timers
                # Execute handler (pass raw node list)
                return handler(self, name, raw_args, node, now)

        except Exception as e:
            logger.error(f"Func Exec Error [{name}]: {e}")
            return None

    def _handle_if(self, node, now):
        args = node.get("args", [])
        condition = self.eval(args[0], now)
        if condition is None: return None
        
        if condition:
            return self.eval(args[1], now)
        else:
            return self.eval(args[2], now)

    # Make public (or accessible) so handlers can access it
    def _get_window_history(self, value_node, now, window):
        m_type = value_node.get("messageType")
        field = value_node.get("field")
        hist = self.history.get(m_type, {}).get(field, [])
        if window is None or now is None: return hist
        # Optimization: could implement backward search and stop once window is exceeded
        return [item for item in hist if (now - item[0]) <= window]