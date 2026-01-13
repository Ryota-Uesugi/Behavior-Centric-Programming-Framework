from .func_handlers import CalcHandlers, TimeHandlers, DroneHandlers, ExportHandlers

# Format: "Function Name": (Handler Method, Auto-Eval Flag)
# auto_eval=True:  'args' contains evaluated values (numbers, bools, etc.).
# auto_eval=False: 'args' contains raw AST nodes (used for lazy evaluation or history lookup).

FUNCTION_REGISTRY = {
    # --- Arithmetic / Calculation (Auto Eval: True) ---
    "abs":        (CalcHandlers.execute, True),
    "round":      (CalcHandlers.execute, True),
    "ceil":       (CalcHandlers.execute, True),
    "floor":      (CalcHandlers.execute, True),
    "sqrt":       (CalcHandlers.execute, True),
    "log":        (CalcHandlers.execute, True),
    "is_nan":     (CalcHandlers.execute, True),
    "clamp":      (CalcHandlers.execute, True),
    "within":     (CalcHandlers.execute, True),
    "hysteresis": (CalcHandlers.execute, True),

    # --- Time / History Statistics (Auto Eval: False -> Node info required) ---
    "average":    (TimeHandlers.execute, False),
    "sum":        (TimeHandlers.execute, False),
    "min":        (TimeHandlers.execute, False),
    "max":        (TimeHandlers.execute, False),
    "hold":       (TimeHandlers.execute, False),
    "duration":   (TimeHandlers.execute, False),
    "delta":      (TimeHandlers.execute, False),
    "rate":       (TimeHandlers.execute, False),
    "trend":      (TimeHandlers.execute, False),
    "prev":       (TimeHandlers.execute, False),

    # --- Drone Control (Auto Eval: True) ---
    "takeoff":      (DroneHandlers.execute, True),
    "land":         (DroneHandlers.execute, True),
    "arm":          (DroneHandlers.execute, True),
    "disarm":       (DroneHandlers.execute, True),
    "set_mode":     (DroneHandlers.execute, True),
    "set_velocity": (DroneHandlers.execute, True),
    "goto":         (DroneHandlers.execute, True),
    "command":      (DroneHandlers.execute, True),

    # --- Export (Auto Eval: True) ---
    "export_txt":   (ExportHandlers.execute, True),
    "export_graph": (ExportHandlers.execute, True),
}