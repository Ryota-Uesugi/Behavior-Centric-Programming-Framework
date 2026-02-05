import time
from collections import deque
from enum import Enum, auto
from .expr_eval import ExpressionEvaluator 
from .component.drone_controller import DroneController
from config import CURRENT_RUN_MODE, RunMode
from logger import logger

# プロセスの状態定義
class ProcessState(Enum):
    READY = auto()      # 実行可能
    RUNNING = auto()    # 実行中
    WAITING = auto()    # 時間待ち (Sleep/Wait)
    BLOCKED = auto()    # I/O待ち (非同期タスクなど)
    TERMINATED = auto() # 終了 (一時的、ループなど)
    STOPPED = auto()    # 完全停止 (Endノード到達時)

class Process:
    def __init__(self, name, setting, evaluator):
        self.name = name
        self.setting = setting
        self.evaluator = evaluator
        
        # 実行コンテキスト
        self.generator = None 
        self.state = ProcessState.READY
        self.wake_up_time = 0 
        
        # イベント判定用
        self.prev_value = None
        self.last_exec_time = 0

class EvalEngine:
    def __init__(self, state):
        self.state = state
        self.history = {}
        self.processes = {}
        
        # 全プロセス共有の変数領域
        self.variable_store = {}
        # 定義情報の辞書化
        self.definitions_map = {}
        
        self.time_budget_per_frame = 0.005
        self.drone = DroneController(state)
        
        if CURRENT_RUN_MODE in (RunMode.REPLAY, RunMode.MATH):
            logger.info(f"EvalEngine: {CURRENT_RUN_MODE.name} モードのため、ドローン制御の影響範囲に注意してください")

        # 定義の初期ロード
        self._refresh_definitions()

    def _refresh_definitions(self):
        defs = getattr(self.state, "cached_definition", [])
        if not defs:
            return

        for d in defs:
            name = d.get("name")
            if not name: continue
            
            self.definitions_map[name] = d
            
            if d.get("classification") in ("variable", "calculated"):
                initial_val = d.get("initial_value", 0)
                if name not in self.variable_store:
                    self.variable_store[name] = initial_val

    def update_state(self, current_state_dict, now):
        for mtype, msg in current_state_dict.items():
            if not isinstance(msg, dict): continue
            for field, value in msg.items():
                self.history.setdefault(mtype, {}).setdefault(
                    field, deque(maxlen=1000)
                ).append((now, value))

    def evaluate(self, now, budget=None):
        start_compute_time = time.perf_counter()
        time_limit = budget if budget is not None else self.time_budget_per_frame

        current_dict = self.state.current_state
        settings = self.state.cached_settings

        self._refresh_definitions()
        self.update_state(current_dict, now)

        if not settings:
            self.processes.clear()
            return []

        self._reconcile_processes(settings)

        events = []
        active_processes = list(self.processes.values())
        
        for proc in active_processes:
            # バジェット超過チェック
            elapsed = time.perf_counter() - start_compute_time
            if elapsed > time_limit:
                break

            if proc.state == ProcessState.STOPPED:
                continue

            if proc.state == ProcessState.WAITING:
                if now >= proc.wake_up_time:
                    proc.state = ProcessState.READY
                else:
                    continue

            if proc.state == ProcessState.READY or proc.state == ProcessState.RUNNING:
                event = self._step_process(proc, now)
                if event:
                    events.append(event)

        return events

    def _step_process(self, proc: Process, now):
        if proc.generator is None:
            notify = proc.setting.get("notify", {})
            mode = notify.get("mode", "on_change")
            interval = notify.get("interval", 0)
            
            if mode in ("periodic", "periodic_change"):
                if (now - proc.last_exec_time < interval):
                    return None

            proc.generator = proc.evaluator.eval(proc.setting.get("ast"), now)
            proc.state = ProcessState.RUNNING

        try:
            yielded_val = next(proc.generator)

            # --- System Call Check ---
            if isinstance(yielded_val, dict) and "signal" in yielded_val:
                signal = yielded_val["signal"]

                if signal == "WAIT":
                    duration = yielded_val.get("duration", 0)
                    if duration > 0:
                        proc.wake_up_time = now + duration
                        proc.state = ProcessState.WAITING
                        return None
                
                elif signal == "TRANSITION":
                    target_state = yielded_val.get("state")
                    if target_state == "STOP":
                        logger.info(f"Process '{proc.name}' stopped by End node.")
                        proc.state = ProcessState.STOPPED
                        proc.generator = None
                        return None

                # ---------------------------------------------------------
                # STEP_NOTIFY (経過) -> "trace" として通知
                # ---------------------------------------------------------
                elif signal == "STEP_NOTIFY":
                    val = yielded_val.get("value")
                    node_id = yielded_val.get("node_id") 
                    return ("trace", proc.name, val, proc.setting, node_id)
            
            # 値が返ってきたがシグナルでない場合 (eval終了時など)
            proc.state = ProcessState.READY
            return None

        except StopIteration as e:
            # 正常終了 -> 結果判定へ
            result_value = e.value
            proc.generator = None
            proc.state = ProcessState.TERMINATED
            proc.last_exec_time = now
            proc.state = ProcessState.READY 
            
            return self._handle_process_result(proc, result_value)

        except Exception as e:
            logger.error(f"Process '{proc.name}' crashed: {e}")
            proc.generator = None
            proc.state = ProcessState.READY
            return None

    def _handle_process_result(self, proc: Process, value):
        if value is None: return None

        notify = proc.setting.get("notify", {})
        mode = notify.get("mode", "on_change")
        
        send_event = False
        prev = proc.prev_value

        if mode == "on_change" and prev != value:
            send_event = True
        elif mode == "periodic_change" and prev != value:
            send_event = True
        elif mode == "periodic":
            send_event = True

        proc.prev_value = value

        if send_event:
            # ---------------------------------------------------------
            # 最終結果通知 -> "condition_result" として通知
            # ---------------------------------------------------------
            return ("condition_result", proc.name, value, proc.setting)
        
        return None

    def _reconcile_processes(self, settings):
        current_names = set()
        
        for setting in settings:
            name = setting.get("name")
            ast = setting.get("ast")
            if not name or not ast: continue
            
            current_names.add(name)
            
            if name not in self.processes:
                func_state = {} 
                evaluator = ExpressionEvaluator(
                    self.history, 
                    func_state, 
                    global_vars=self.variable_store,
                    definitions=self.definitions_map, 
                    drone_controller=self.drone
                )
                self.processes[name] = Process(name, setting, evaluator)
            else:
                self.processes[name].setting = setting

        for name in list(self.processes.keys()):
            if name not in current_names:
                del self.processes[name]