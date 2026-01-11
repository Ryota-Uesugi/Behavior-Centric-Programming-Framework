from .func_handlers import CalcHandlers, TimeHandlers, DroneHandlers, ExportHandlers

# "関数名": (ハンドラメソッド, 引数の自動評価フラグ)
# auto_eval=True:  args には評価済みの値（数値やbool）が入ってくる。
# auto_eval=False: args には ASTノード がそのまま入ってくる（遅延評価や履歴参照用）。

FUNCTION_REGISTRY = {
    # --- 算術・計算 (Auto Eval: True) ---
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

    # --- 時間・履歴統計 (Auto Eval: False -> ノード情報が必要) ---
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
    "timer":      (TimeHandlers.execute, False),

    # --- ドローン制御 (Auto Eval: True) ---
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