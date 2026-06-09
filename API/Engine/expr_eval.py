# import uuid  # UUIDは使用しないため削除
from logger import logger
from .component.func_register import FUNCTION_REGISTRY

class ExpressionEvaluator:
    def __init__(self, history, states, global_vars=None, definitions=None, drone_controller=None):
        self.history = history
        
        # プロセス固有のステート (ローカル変数, _cooldowns等)
        self.states = states 
        
        # 全プロセス共有の変数 (cached_definition用)
        self.global_vars = global_vars if global_vars is not None else {}
        
        self.definitions = definitions if definitions else {}
        self.drone = drone_controller 
        
        # 固有ステートに内部管理用の領域を作成
        if "_cooldowns" not in self.states:
            self.states["_cooldowns"] = {}

    def eval(self, node, now=None, local_scope=None, path="root"):
        """
        path引数を追加: 現在のノードのツリー上の位置を示す文字列
        例: "root", "root/args/0", "root/left" 等
        """

        if node is None: return None
        
        node_id = path
        
        # _eval_logic に path を渡す
        result = yield from self._eval_logic(node, now, local_scope, path)

        if isinstance(result, dict) and "signal" in result:
            return result
        
        if result is None:
            return None

        yield {
            "signal": "STEP_NOTIFY",
            "value": result,
            "node_type": node.get("type"),
            "node_id": node_id  
        }

        return result

    def _eval_logic(self, node, now, local_scope, path):
        """
        [旧 eval] 実際の計算ロジック
        再帰呼び出し時に path を更新して渡します。
        """
        yield # 実行権を譲渡（非同期ループ対策の最小単位）

        if node is None: return None
        node_type = node.get("type")
        
        # 計算用の一時変数スコープ (Input引数など)
        if local_scope is None:
            local_scope = {}

        try:
            # -------------------------------------------------------
            # Endノード処理
            # Endノードが来たらステート遷移シグナルを送出して終了
            # -------------------------------------------------------
            if node_type == "end":
                logger.info("End node encountered. Signaling transition to STOP.")
                yield {"signal": "TRANSITION", "state": "STOP"}
                return None

            if node_type == "constant":
                return node.get("value")

            # Variable Access (for calculated logic)
            if node_type == "variable":
                var_id = node.get("id")
                # 1. ローカルスコープ
                if var_id in local_scope:
                    return local_scope[var_id]
                # 2. 共有変数
                if var_id in self.global_vars:
                    return self.global_vars[var_id]
                # 3. 従来変数 (states)
                return self.states.get(var_id)

            if node_type == "value":
                m_type = node.get("messageType")
                field = node.get("field")
                msg_hist = self.history.get(m_type, {})
                field_hist = msg_hist.get(field)
                if not msg_hist or not field_hist: return None
                return field_hist[-1][1]

            # Legacy Name Access
            if node_type == "name":
                return self.states.get(node.get("id"))

            # Reference Node (Getter / Setter)
            if node_type == "reference":
                return (yield from self._handle_reference(node, now, local_scope, path))

            if node_type == "unary":
                # pathに "/node" (または "/operand") を追加
                v = yield from self.eval(node["node"], now, local_scope, path=f"{path}/node")
                if v is None: return None
                op = node["op"]
                if op == "not": return not v
                if op == "-":   return -v
                if op == "+":   return +v
                if op == "~":   return ~int(v)
                return None

            if node_type == "binary":
                # 短絡評価 (Short-circuit evaluation)
                # 左右の枝に "/left", "/right" を追加
                if node["op"] == "and":
                    left_val = yield from self.eval(node["left"], now, local_scope, path=f"{path}/left")
                    if not left_val: return left_val
                    return (yield from self.eval(node["right"], now, local_scope, path=f"{path}/right"))
                
                if node["op"] == "or":
                    left_val = yield from self.eval(node["left"], now, local_scope, path=f"{path}/left")
                    if left_val: return left_val
                    return (yield from self.eval(node["right"], now, local_scope, path=f"{path}/right"))
                
                a = yield from self.eval(node["left"], now, local_scope, path=f"{path}/left")
                b = yield from self.eval(node["right"], now, local_scope, path=f"{path}/right")
                
                if a is None or b is None: return None
                return self._apply_binary(a, b, node["op"])

            if node_type == "func" or node_type == "flow_control":
                return (yield from self._eval_func(node, now, local_scope, path))

            return None

        except Exception as e:
            logger.error(f"Eval Error: {e}")
            return None

    def _handle_reference(self, node, now, local_scope, path):
        ref_name = node.get("name")
        args = node.get("args", [])
        
        definition = self.definitions.get(ref_name)
        classification = definition.get("classification", "variable") if definition else "variable"

        # Getter
        if not args:
            return self.global_vars.get(ref_name)

        # Setter
        else:
            # Setterの引数部分のパス
            input_val = yield from self.eval(args[0], now, local_scope, path=f"{path}/args/0")
            final_val = input_val

            # Calculated変数の場合、定義式を実行
            if classification == "calculated" and definition:
                calc_ast = definition.get("ast")
                if calc_ast:
                    calc_scope = {"input": input_val}
                    # Calculated ASTの実行パス
                    calculated_result = yield from self.eval(calc_ast, now, calc_scope, path=f"{path}/calculated")
                    
                    if calculated_result is not None:
                        final_val = calculated_result

            # 共有メモリに書き込み
            self.global_vars[ref_name] = final_val
            return final_val

    def _apply_binary(self, a, b, op):
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

    def _eval_func(self, node, now, local_scope, path):
        name = node["name"]

        # --- Flow Control Handlers ---
        if name == "if":
             return (yield from self._handle_if(node, now, local_scope, path))
        
        # [New] Sequence処理
        if name == "sequence":
             return (yield from self._handle_sequence(node, now, local_scope, path))

        # [New] Wait処理
        if name == "wait":
            return (yield from self._handle_wait(node, now, local_scope, path))

        # --- Standard Function Handlers ---
        entry = FUNCTION_REGISTRY.get(name)
        if not entry:
            logger.warning(f"Unknown function: {name}")
            return None

        handler, auto_eval_args = entry
        raw_args = node.get("args", [])

        try:
            if auto_eval_args:
                eval_args = []
                for i, a in enumerate(raw_args):
                    # 引数リストのパス: args/0, args/1 ...
                    val = yield from self.eval(a, now, local_scope, path=f"{path}/args/{i}")
                    if val is None: return None
                    eval_args.append(val)
                
                # ハンドラにpathを渡す必要がある場合はここで拡張が必要ですが、
                # 既存のハンドラシグネチャ(self, name, args, node, now)を変えない場合はそのまま
                result = handler(self, name, eval_args, node, now)
            else:
                result = handler(self, name, raw_args, node, now)

            # ジェネレータが返された場合は実行委譲
            if hasattr(result, '__iter__') and not isinstance(result, (str, list, tuple, dict)):
                return (yield from result)
            
            return result

        except Exception as e:
            logger.error(f"Func Exec Error [{name}]: {e}")
            return None

    # --- Specific Handlers ---

    def _handle_if(self, node, now, local_scope, path):
        args = node.get("args", [])
        # 条件式のパス
        condition = yield from self.eval(args[0], now, local_scope, path=f"{path}/args/0")
        
        if condition is None: return None
        
        if condition:
            # True節のパス
            return (yield from self.eval(args[1], now, local_scope, path=f"{path}/args/1"))
        else:
            # False節のパス
            return (yield from self.eval(args[2], now, local_scope, path=f"{path}/args/2"))

    def _handle_sequence(self, node, now, local_scope, path):
        """
        Sequenceブロック処理:
        ステップを上から順に実行します。
        """
        steps = node.get("args", [])
        for i, step in enumerate(steps):
            # ステップごとのパス: args/0, args/1...
            yield from self.eval(step, now, local_scope, path=f"{path}/args/{i}")
        
        # Sequence自体は値を返さない
        return None

    def _handle_wait(self, node, now, local_scope, path):
        """
        Waitブロック処理
        """
        args = node.get("args", [])
        if not args: return False

        seconds = yield from self.eval(args[0], now, local_scope, path=f"{path}/args/0")
        if seconds is None or seconds <= 0: return False

        # 実行エンジンへ一時停止シグナルを送出
        yield {"signal": "WAIT", "duration": seconds}
        
        return True

    def _get_window_history(self, value_node, now, window):
        m_type = value_node.get("messageType")
        field = value_node.get("field")
        hist = self.history.get(m_type, {}).get(field, [])
        if window is None or now is None: return hist
        return [item for item in hist if (now - item[0]) <= window]