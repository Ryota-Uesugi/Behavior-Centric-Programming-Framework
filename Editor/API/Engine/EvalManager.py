from collections import deque
from .expr_eval import ExpressionEvaluator 
from .component.drone_controller import DroneController

class EvalEngine:
    def __init__(self, state):
        self.state = state
        self.drone = DroneController(state)
        self.history = {}

        # Caches: Managed using 'name' as the key
        self.evaluators = {}
        self.func_states = {}
        self.prev_values = {}
        self.last_eval_time = {}

    def update_state(self, current_state_dict, now):
        """
        Stores the received latest state into the history (deque).
        """
        for mtype, msg in current_state_dict.items():
            if not isinstance(msg, dict): continue
            for field, value in msg.items():
                self.history.setdefault(mtype, {}).setdefault(
                    field, deque(maxlen=1000)
                ).append((now, value))

    def evaluate(self, now):
        """
        Evaluates conditions for all settings and returns events (results requiring notification).
        """
        current_dict = self.state.current_state
        settings = self.state.cached_settings

        # Update history
        self.update_state(current_dict, now)

        if not settings:
            self._clear_all_caches()
            return []

        # 1. Cleanup: Remove caches for names not present in the current settings list
        current_names = {s.get("name") for s in settings if s.get("name")}
        self._cleanup_unused_caches(current_names)

        events = []
        for setting in settings:
            name = setting.get("name")
            ast = setting.get("ast")
            if not name or not ast:
                continue

            # Retrieve notification settings
            notify = setting.get("notify", {})
            mode = notify.get("mode", "on_change")
            interval = notify.get("interval", 0)
            
            last_time = self.last_eval_time.get(name, 0)
            
            # Periodic execution check
            if mode in ("periodic", "periodic_change"):
                if (now - last_time < interval):
                    continue

            # 2. Retrieve state and Evaluator (create if missing)
            if name not in self.func_states:
                self.func_states[name] = {}
            
            if name not in self.evaluators:
                self.evaluators[name] = ExpressionEvaluator(
                    self.history, 
                    self.func_states[name], 
                    drone_controller=self.drone
                )
            
            evaluator = self.evaluators[name]
            
            try:
                # Execute evaluation
                value = evaluator.eval(ast, now)
                if value is None:
                    self.prev_values[name] = None
                    continue
            except Exception:
                # Skip errors during evaluation (logger.exception could be added here)
                continue

            # 3. Determine changes and generate events
            prev = self.prev_values.get(name)
            send_event = False

            if mode == "on_change" and prev != value:
                send_event = True
            elif mode == "periodic_change" and prev != value:
                send_event = True
            elif mode == "periodic":
                send_event = True

            if send_event:
                # Add data for notification
                events.append((name, value, setting))
                self.prev_values[name] = value
            
            self.last_eval_time[name] = now

        return events

    def _cleanup_unused_caches(self, current_names):
        """
        Removes caches for settings that no longer exist to prevent memory leaks.
        """
        stored_names = list(self.evaluators.keys())
        for name in stored_names:
            if name not in current_names:
                self.evaluators.pop(name, None)
                self.func_states.pop(name, None)
                self.prev_values.pop(name, None)
                self.last_eval_time.pop(name, None)

    def _clear_all_caches(self):
        """
        Initializes (clears) all caches.
        """
        self.evaluators.clear()
        self.func_states.clear()
        self.prev_values.clear()
        self.last_eval_time.clear()