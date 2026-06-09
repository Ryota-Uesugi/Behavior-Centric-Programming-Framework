/* ==========================================================================
   CONSTANTS & CONFIGURATIONS
   ========================================================================== */

export const FUNC_CONFIG = {
    // --- calc_func (Arithmetic) ---
    "clamp":      { args: ["val", "min", "max"], category: 'calc_func', desc: "Limits the value within a specified range.\n(Args: target value, min, max)" },
    "within":     { args: ["val", "target", "diff"], category: 'calc_func', desc: "Determines if the value is within a specified error margin from the reference.\n(Args: target value, reference, tolerance)" },
    "hysteresis": { args: ["val", "high", "low"], category: 'calc_func', desc: "Becomes true when exceeding the ON-threshold and remains true until falling below the OFF-threshold.\n(Args: target value, ON-threshold, OFF-threshold)" },
    "round":      { args: ["val", "digits"], category: 'calc_func', desc: "Rounds the value to the specified number of decimal places.\n(Args: target value, digits)" },
    "log":        { args: ["val", "base"], category: 'calc_func', desc: "Calculates the logarithm. Natural logarithm is used if base is omitted.\n(Args: target value, base)" },
    "abs":        { args: ["val"], category: 'calc_func', desc: "Returns the absolute value of the number." },
    "floor":      { args: ["val"], category: 'calc_func', desc: "Rounds the number down to the nearest integer." },
    "ceil":       { args: ["val"], category: 'calc_func', desc: "Rounds the number up to the nearest integer." },
    "sqrt":       { args: ["val"], category: 'calc_func', desc: "Calculates the square root of the number." },
    "is_nan":     { args: ["val"], category: 'calc_func', desc: "Returns true if the value is not a number (e.g., error)." },

    // === 追加部分 (Start) ===
    "sin":        { args: ["rad"], category: 'calc_func', desc: "Calculates the sine of the angle (in radians).\n(Args: angle in radians)" },
    "cos":        { args: ["rad"], category: 'calc_func', desc: "Calculates the cosine of the angle (in radians).\n(Args: angle in radians)" },
    "tan":        { args: ["rad"], category: 'calc_func', desc: "Calculates the tangent of the angle (in radians).\n(Args: angle in radians)" },
    "radians":    { args: ["deg"], category: 'calc_func', desc: "Converts degrees to radians.\n(Args: angle in degrees)" },
    "degrees":    { args: ["rad"], category: 'calc_func', desc: "Converts radians to degrees.\n(Args: angle in radians)" },
    // === 追加部分 (End) ===

    // --- time_func (Time & History) ---
    "hold":       { args: ["cond", "sec"], category: 'time_func', desc: "Determines if the condition has been continuously true for the specified duration.\n(Args: condition, duration in seconds)" },
    "trend":      { args: ["val", "sec"], category: 'time_func', desc: "Calculates the statistical trend (slope) from all data within the specified time.\n(Args: target value, seconds)" },
    "average":    { args: ["val", "sec"], category: 'time_func', desc: "Calculates the average value over the specified past time.\n(Args: target value, seconds)" },
    "sum":        { args: ["val", "sec"], category: 'time_func', desc: "Calculates the sum of values over the specified past time.\n(Args: target value, seconds)" },
    "min":        { args: ["val", "sec"], category: 'time_func', desc: "Extracts the minimum value within the specified past time.\n(Args: target value, seconds)" },
    "max":        { args: ["val", "sec"], category: 'time_func', desc: "Extracts the maximum value within the specified past time.\n(Args: target value, seconds)" },
    "rate":       { args: ["val", "sec"], category: 'time_func', desc: "Calculates the average rate of change per second by comparing the start of the specified time window with the current time.\n(Args: target value, seconds)" },
    "delta":      { args: ["val", "sec"], category: 'time_func', desc: "Calculates the difference between the current value and the value from specified seconds ago.\n(Args: target value, seconds)" },
    "prev":       { args: ["val", "sec"], category: 'time_func', desc: "References the value from specified seconds ago.\n(Args: target value, seconds)" },
    "duration":   { args: ["cond", "limit"], category: 'time_func', desc: "Measures how long the condition has been continuously 'True' within the specified time range.\n(Args: condition, max lookback seconds)" },

    // --- flow_control (Flow Control) ---
    "switch":     { args: ["target", "case1", "res1", "default"], category: 'flow_control', desc: "Evaluates target and executes the matching result.\nFormat: (Target, Case1, Res1, Case2, Res2, ..., Default)" },
    "sequence":   { args: ["...steps"], category: 'flow_control', desc: "Executes the provided steps sequentially from top to bottom.\n(Args: step1, step2, ...)" },
    "wait":       { args: ["sec"], category: 'flow_control', desc: "Pauses execution for the specified seconds.\n(Args: seconds)" },
    "result":     { args: ["val"], category: 'flow_control', desc: "return definition result(Definition Only).\n(Args: value)" },

    // --- control_func (Drone Control) ---
    "takeoff":    { args: ["alt"], category: 'control_func', desc: "Takes off to the specified altitude.\n(Args: target altitude [m])" },
    "land":       { args: [], category: 'control_func', desc: "Switches to land mode at the current location." },
    "arm":        { args: [], category: 'control_func', desc: "Arms (starts) the motors." },
    "disarm":     { args: [], category: 'control_func', desc: "Disarms (stops) the motors." },
    "set_mode":   { args: ["mode"], category: 'control_func', desc: "Changes the flight mode.\n(Args: mode name e.g., 'GUIDED', 'RTL')" },
    "set_velocity": { args: ["vx", "vy", "vz", "yaw_rate"], category: 'control_func', desc: "Controls the vehicle velocity.\n(Args: vx, vy, vz [m/s], yaw_rate [rad/s])" },
    "goto":       { args: ["x", "y", "z", "yaw"], category: 'control_func', desc: "Moves to the specified coordinates.\n(Args: x, y, z [m], yaw [rad])" },
    "command":    { args: ["id", "p1", "p2", "p3", "p4", "p5", "p6", "p7"], category: 'control_func', desc: "Sends an arbitrary Telemetry command (COMMAND_LONG).\n(Args: ID, p1, p2, p3, p4, p5, p6, p7)" },

    // --- export_func (Output) ---
    "export_txt":   { args: ["val", "file", "label"], category: 'export_func', desc: "Outputs the value to a CSV file.\n(Args: value, filename, label)" },
    "export_graph": { args: ["val", "file", "series", "color"], category: 'export_func', desc: "Outputs the value to a graph.\n(Args: value, filename, series name, color)" },
};

export const singleBlock = [
    { Name: 'Number',    type: 'number' },
    { Name: 'String',    type: 'string' },
    { Name: 'Bool',      type: 'bool' },
    { Name: 'input',     type: 'input' },
    { Name: 'end',       type: 'end' },       
    { Name: 'Telemetry', type: 'Telemetry' },
    { Name: 'Component', type: 'component' },
];

export const operators = [
    { list: ['>', '<', '=', 'and', 'or', 'not'], type: 'condition' },
    { list: ['+', '-', '*', '/', '%'],           type: 'operator' },
    { list: ['&', '|', '^', '~'],                type: 'bit_operator' },
    { list: ['(', ')'],                          type: 'parenthesis' }
];

export const combinableOps = {
    '>': { next: ['=', '>'], type: 'condition', overrides: { '>>': 'bit_operator' } },
    '<': { next: ['=', '<'], type: 'condition', overrides: { '<<': 'bit_operator' } },
    '=': { next: ['='],      type: 'condition' }, // ==
    '!': { next: ['='],      type: 'condition' }, // !=
    '*': { next: ['*'],      type: 'operator'  }  // **
};

export const GENERAL_DESC = {
    "number":       "Enter a numeric value. (int or float)",
    "string":       "Enter a name. (String type)",
    "bool":         "Enter a boolean value. (True or False)",
    "input":        "Definition Input. (Definition Only)",
    "end":          "End of the evaluation.",
    "component":    "Load saved component",
    "Telemetry":    "References a value from a Telemetry message.",
    "condition":    "Comparison operator used for conditional branching.",
    "operator":     "Performs arithmetic operations.",
    "bit_operator": "Performs bitwise operations.",
    "parenthesis":  "Specifies the calculation order (precedence)."
};

export const RESULT_TYPE_VARIABLE    = "variable";
export const RESULT_TYPE_CALCULATED  = "calculated";
export const RESULT_TYPE_FUNCTION    = "function";
export const RESULT_TYPE_EXPRESSION  = "expression";

export const COMPONENT_CONFIG = {
    sourceName: "Component Area",
    apiUrl: "http://localhost:5000/api/settings",
    mode: "definition",
    domSelectors: {
        listModalId: 'compoment-modal',
        listContainerId: 'compoment-list-container',
        listItemRowClass: 'compoment-row',
        listItemTextClass: 'compoment-text-item',
        listItemDeleteBtnClass: 'compoment-delete-btn'
    }
};

export const SEND_CONFIG = {
    sourceName: "Send Area",
    apiUrl: "http://localhost:5000/api/settings",
    mode: "expression",
    domSelectors: {
        expressionModalId: 'expression-modal',
        expressionNameInputId: 'expression-name',
        expressionTextareaId: 'expression-textarea'
    }
};

export const TARGET_FPS = 60;
export const FRAME_INTERVAL = 1000 / TARGET_FPS;