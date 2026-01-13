/* ================= Constants & Settings ================= */

const FUNC_CONFIG = {
    // --- calc_func (Arithmetic) ---
    "clamp": { 
        args: ["val", "min", "max"], 
        category: 'calc_func', 
        desc: "Limits the value within a specified range.\n(Args: target value, min, max)" 
    },
    "within": { 
        args: ["val", "target", "diff"], 
        category: 'calc_func', 
        desc: "Determines if the value is within a specified error margin from the reference.\n(Args: target value, reference, tolerance)" 
    },
    "hysteresis": { 
        args: ["val", "high", "low"], 
        category: 'calc_func', 
        desc: "Becomes true when exceeding the ON-threshold and remains true until falling below the OFF-threshold.\n(Args: target value, ON-threshold, OFF-threshold)" 
    },
    "round": { 
        args: ["val", "digits"], 
        category: 'calc_func', 
        desc: "Rounds the value to the specified number of decimal places.\n(Args: target value, digits)" 
    },
    "log": { 
        args: ["val", "base"], 
        category: 'calc_func', 
        desc: "Calculates the logarithm. Natural logarithm is used if base is omitted.\n(Args: target value, base)" 
    },
    "abs": { 
        args: ["val"], 
        category: 'calc_func', 
        desc: "Returns the absolute value of the number." 
    },
    "floor": { 
        args: ["val"], 
        category: 'calc_func', 
        desc: "Rounds the number down to the nearest integer." 
    },
    "ceil": { 
        args: ["val"], 
        category: 'calc_func', 
        desc: "Rounds the number up to the nearest integer." 
    },
    "sqrt": { 
        args: ["val"], 
        category: 'calc_func', 
        desc: "Calculates the square root of the number." 
    },
    "is_nan": { 
        args: ["val"], 
        category: 'calc_func', 
        desc: "Returns true if the value is not a number (e.g., error)." 
    },

    // --- time_func (Time & History) ---
    "hold": { 
        args: ["cond", "sec"], 
        category: 'time_func', 
        desc: "Determines if the condition has been continuously true for the specified duration.\n(Args: condition, duration in seconds)" 
    },
    "trend": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Calculates the statistical trend (slope) from all data within the specified time.\n(Args: target value, seconds)" 
    },
    "average": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Calculates the average value over the specified past time.\n(Args: target value, seconds)" 
    },
    "sum": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Calculates the sum of values over the specified past time.\n(Args: target value, seconds)" 
    },
    "min": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Extracts the minimum value within the specified past time.\n(Args: target value, seconds)" 
    },
    "max": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Extracts the maximum value within the specified past time.\n(Args: target value, seconds)" 
    },
    "rate": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Calculates the average rate of change per second by comparing the start of the specified time window with the current time.\n(Args: target value, seconds)" 
    },
    "delta": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "Calculates the difference between the current value and the value from specified seconds ago.\n(Args: target value, seconds)" 
    },
    "prev": { 
        args: ["val", "sec"], 
        category: 'time_func', 
        desc: "References the value from specified seconds ago.\n(Args: target value, seconds)" 
    },
    "duration": { 
        args: ["cond", "limit"], 
        category: 'time_func', 
        desc: "Measures how long the condition has been continuously 'True' within the specified time range.\n(Args: condition, max lookback seconds)" 
    },

    "if": { 
        args: ["cond", "true_val", "false_val"], 
        category: 'flow_control', 
        desc: "Switches the action or value to execute based on the condition.\n(Args: condition, action if True, action if False)" 
    },

    "takeoff": { 
        args: ["alt"], 
        category: 'control_func', 
        desc: "Takes off to the specified altitude.\n(Args: target altitude [m])" 
    },
    "land": { 
        args: [], 
        category: 'control_func', 
        desc: "Switches to land mode at the current location." 
    },
    "arm": { 
        args: [], 
        category: 'control_func', 
        desc: "Arms (starts) the motors." 
    },
    "disarm": { 
        args: [], 
        category: 'control_func', 
        desc: "Disarms (stops) the motors." 
    },
    "set_mode": { 
        args: ["mode"], 
        category: 'control_func', 
        desc: "Changes the flight mode.\n(Args: mode name e.g., 'GUIDED', 'RTL')" 
    },
    "set_velocity": { 
        args: ["vx", "vy", "vz", "yaw_rate"], 
        category: 'control_func', 
        desc: "Controls the vehicle velocity.\n(Args: vx, vy, vz [m/s], yaw_rate [rad/s])" 
    },
    "goto": { 
        args: ["x", "y", "z", "yaw"], 
        category: 'control_func', 
        desc: "Moves to the specified coordinates.\n(Args: x, y, z [m], yaw [rad])" 
    },
    "command": { 
        args: ["id", "p1", "p2", "p3", "p4", "p5", "p6", "p7"], 
        category: 'control_func', 
        desc: "Sends an arbitrary MAVLink command (COMMAND_LONG).\n(Args: ID, p1, p2, p3, p4, p5, p6, p7)" 
    },

    // --- export_func (Output) ---
    "export_txt": { 
        args: ["val", "file", "label"], 
        category: 'export_func', 
        desc: "Outputs the value to a CSV file.\n(Args: value, filename, label)" 
    },
    "export_graph": { 
        args: ["val", "file", "series", "color"], 
        category: 'export_func', 
        desc: "Outputs the value to a graph.\n(Args: value, filename, series name, color)" 
    },
};

const singleBlock = [
    {Name:'Number' , type: 'number'},
    {Name:'String' , type: 'string'},
    {Name:'MAVLink' , type: 'mavlink'},
    {Name:'Setting' , type: 'setting'},
];

const operators = [
    { list: ['>', '<', '=', 'and', 'or', 'not'], type: 'condition' },
    { list: ['+', '-', '*', '/', '%'], type: 'operator' },
    { list: ['&', '|', '^', '~'], type: 'bit_operator' },
    { list: ['(', ')'], type: 'parenthesis' } 
];

const GENERAL_DESC = {
    "number": "Enter a numeric value. (int or float)",
    "string": "Enter a name. (String type)",
    "setting": "Load saved setting & create expression blocks",
    "mavlink": "References a value from a MAVLink message.",
    "condition": "Comparison operator used for conditional branching.",
    "operator": "Performs arithmetic operations.",
    "bit_operator": "Performs bitwise operations.",
    "parenthesis": "Specifies the calculation order (precedence)."
};

/* ================= MAVLink Settings ================= */

async function fetchMavlinkFields() {
    try {
        const res = await fetch('http://localhost:5000/api/mavlink/last');
        return await res.json();
    } catch (e) { 
        return {}; 
    }
}

async function openMavlinkConfigForm(block) {
    const data = await fetchMavlinkFields();
    
    // Background (Overlay)
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal'; 

    // Content container
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.width = '350px'; 

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = '<h3>Select MAVLink Field</h3>';

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';

    const msgLabel = document.createElement('p');
    msgLabel.className = 'label';
    msgLabel.textContent = 'Select Message:';
    const msgSelect = document.createElement('select');
    
    const fieldLabel = document.createElement('p');
    fieldLabel.className = 'label';
    fieldLabel.textContent = 'Select Field:';
    const fieldSelect = document.createElement('select');

    // Populate Data
    Object.keys(data).forEach(msg => msgSelect.add(new Option(msg, msg)));

    msgSelect.addEventListener('change', () => {
        fieldSelect.innerHTML = '';
        (data[msgSelect.value] || [])
            .filter(f => f !== '_ts' && f !== 'mavpackettype')
            .forEach(f => fieldSelect.add(new Option(f, f)));
    });
    msgSelect.dispatchEvent(new Event('change'));

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-close';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        removeBlock(block);
        modalDiv.remove();
    }

    const okBtn = document.createElement('button');
    okBtn.className = 'btn-send';
    okBtn.textContent = 'Apply';
    okBtn.onclick = () => {
        block.dataset.message = msgSelect.value;
        block.dataset.field = fieldSelect.value;
        block.dataset.configured = 'true';
        block.textContent = `${msgSelect.value}.${fieldSelect.value}`;
        
        // Use function from block.js
        if(typeof blockGroups !== 'undefined') {
            const group = blockGroups.get(block);
            if (group) {
                updateGroupBox(group);
                updateAllGroupBoxes();
            }
        }
        modalDiv.remove();
    };

    body.append(msgLabel, msgSelect, fieldLabel, fieldSelect);
    footer.append(cancelBtn, okBtn);
    content.append(header, body, footer);
    modalDiv.appendChild(content);
    document.body.appendChild(modalDiv);
}

/* ================= Settings Loader ================= */

async function fetchSavedSettings() {
    try {
        const res = await fetch('http://localhost:5000/api/settings');
        if (!res.ok) throw new Error("Failed to fetch settings");
        return await res.json();
    } catch (e) {
        console.error(e);
        return [];
    }
}

async function openLoadSettingForm(block) {
    const settings = await fetchSavedSettings();

    // 1. Create UI
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.width = '400px';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = '<h3>Load Setting</h3>';

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';

    // Select Box
    const labelSelect = document.createElement('p');
    labelSelect.className = 'label';
    labelSelect.textContent = 'Select a saved setting:';
    
    const settingSelect = document.createElement('select');
    settingSelect.style.width = '100%';
    settingSelect.style.marginBottom = '10px';

    // Preview Area
    const labelPreview = document.createElement('p');
    labelPreview.className = 'label';
    labelPreview.textContent = 'Expression Preview (Editable if Custom):';

    const previewTx = document.createElement('textarea');
    previewTx.readOnly = true;
    previewTx.style.width = '100%';
    previewTx.style.height = '80px';
    previewTx.style.backgroundColor = '#f0f0f0';

    // Populate Data
    if (settings.length === 0) {
        const opt = new Option("-- No saved settings --", "");
        opt.disabled = true;
        settingSelect.add(opt);
    } else {
        settings.forEach(item => {
            const opt = new Option(item.name, item.name);
            opt.dataset.expression = item.expression;
            settingSelect.add(opt);
        });
    }

    // Add Custom Option
    const customOpt = new Option("Custom", "CUSTOM");
    settingSelect.add(customOpt);

    // Preview Update Logic
    const updatePreview = () => {
        const selectedValue = settingSelect.value;
        const selectedOpt = settingSelect.options[settingSelect.selectedIndex];

        if (selectedValue === 'CUSTOM') {
            previewTx.readOnly = false;
            previewTx.style.backgroundColor = '#ffffff';
            previewTx.placeholder = "Enter your expression here...";
            
            if (!previewTx.dataset.isUserTyping) {
                 previewTx.value = ""; 
            }
        } else {
            previewTx.readOnly = true;
            previewTx.style.backgroundColor = '#f0f0f0';
            previewTx.placeholder = "";
            previewTx.dataset.isUserTyping = ""; 

            if (selectedOpt && selectedOpt.dataset.expression) {
                previewTx.value = selectedOpt.dataset.expression;
            } else {
                previewTx.value = "";
            }
        }
    };

    previewTx.addEventListener('input', () => {
        if (settingSelect.value === 'CUSTOM') {
            previewTx.dataset.isUserTyping = "true";
        }
    });

    settingSelect.addEventListener('change', updatePreview);
    
    if (settingSelect.options[0].disabled && settingSelect.options.length > 1) {
        settingSelect.selectedIndex = 1;
    }
    updatePreview();

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-close';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        removeBlock(block);
        modalDiv.remove();
    }

    const okBtn = document.createElement('button');
    okBtn.className = 'btn-send';
    okBtn.textContent = 'Create';
    
    // --- Change: Generation process and error handling ---
    okBtn.onclick = () => {
        const selectedValue = settingSelect.value;
        const selectedOpt = settingSelect.options[settingSelect.selectedIndex];

        // Selection Check
        if (selectedValue !== 'CUSTOM' && (!selectedOpt || !selectedOpt.dataset.expression)) {
            if (settingSelect.options[0].disabled && settingSelect.selectedIndex === 0) return;
        }

        let expression = "";
        if (selectedValue === 'CUSTOM') {
            expression = previewTx.value;
            if (!expression.trim()) {
                alert("Please enter an expression.");
                return;
            }
        } else {
            expression = selectedOpt.dataset.expression;
        }

        // Coordinate Calculation
        const rect = block.getBoundingClientRect();
        const fieldRect = field.getBoundingClientRect();
        const x = rect.left - fieldRect.left + field.scrollLeft;
        const y = rect.top - fieldRect.top + field.scrollTop;

        try {
            // Execute generation (throws error here if failed)
            const newBlock = spawnBlocksFromExpression(expression, x, y);
            
            // Only remove old block and modal if successful
            if (newBlock) {
                if (block.parentNode) block.parentNode.removeChild(block);
                if (typeof blocks !== 'undefined') blocks = blocks.filter(b => b !== block);
                removeBlock(block);
                
                modalDiv.remove();
            }
        } catch (e) {
            // On failure: Show alert and exit function (do not close modal)
            console.error(e);
            alert(e.message); 
            return; 
        }
    };

    body.append(labelSelect, settingSelect, labelPreview, previewTx);
    footer.append(cancelBtn,okBtn);
    content.append(header, body, footer);
    modalDiv.appendChild(content);
    document.body.appendChild(modalDiv);
}


/* ================= Expression Parser & Builder ================= */
function getOperatorType(token) {
    if (typeof operators === 'undefined') return null;
    for (const group of operators) {
        if (group.list.includes(token) || group.list.includes(token.toLowerCase())) {
            return group.type;
        }
    }
    return null;
}

function tokenize(expression) {
    const regex = /\s*('[\s\S]*?'|=>|>=|<=|==|!=|\w+\.\w+|\d+(?:\.\d+)?|[a-zA-Z_]\w*|[+\-*/%^&|~()<>=,])\s*/g;
    let tokens = [];
    let match;
    while ((match = regex.exec(expression)) !== null) {
        if (match[0].trim()) {
            tokens.push(match[0].trim());
        }
    }
    return tokens;
}

function spawnBlocksFromExpression(expression, x, y) {
    const tokens = tokenize(expression);
    let cursor = 0;

    function peek() { return tokens[cursor]; }
    function consume(expected) {
        if (tokens[cursor] === expected) { cursor++; return true; }
        return false;
    }

    function parseBlock() {
        if (cursor >= tokens.length) return null;
        
        const token = tokens[cursor++];

        // --- 1. Number ---
        if (!isNaN(parseFloat(token)) && !token.startsWith("'")) {
            return createBlock('number', token, false);
        }

        // --- 2. String ---
        if (token.startsWith("'")) {
            return createBlock('string', token.slice(1, -1), false);
        }

        // --- 3. MAVLink ---
        if (token.includes('.') && isNaN(parseFloat(token))) {
            const b = createBlock('mavlink', token, false);
            const p = token.split('.');
            b.dataset.message = p[0]; 
            b.dataset.field = p[1]; 
            b.dataset.configured = 'true';
            return b;
        }

        // --- 4. Function call ---
        if (peek() === '(') {
            consume('(');
            
            let category = 'calc_func'; 
            let funcName = token;

            if (typeof FUNC_CONFIG !== 'undefined' && FUNC_CONFIG[token]) {
                category = FUNC_CONFIG[token].category;
            } else {
                throw new Error(`Error: Function '${token}' is not defined.`);
            }

            const funcBlock = createBlock(category, funcName, false);
            const slots = Array.from(funcBlock.querySelectorAll(':scope > .slot'));
            let slotIndex = 0;

            while (peek() !== ')' && cursor < tokens.length) {
                if (peek() === ',') {
                    consume(',');
                    slotIndex++;
                    continue;
                }

                const child = parseBlock();
                
                if (child) {
                    if (slots[slotIndex]) {
                        slots[slotIndex].appendChild(child);
                        child.style.position = 'static';
                        if (typeof blocks !== 'undefined') blocks = blocks.filter(b => b !== child);
                    } else {
                        console.warn(`Extra argument detected for ${funcName}:`, child);
                    }
                }
            }
            
            if (!consume(')')) {
                 throw new Error(`Error: Closing parenthesis ')' for function '${token}' not found.`);
            }
            return funcBlock;
        }

        // --- 5. Operator ---
        const opType = getOperatorType(token);
        if (opType) {
            return createBlock(opType, token, false, token);
        }

        // --- 6. Others (variables etc.) ---
        return createBlock('string', token, false);
    }
    
    const rootBlock = parseBlock();
    
    // Add to screen only if parsing completes without error and root block is generated
    if (rootBlock) {
        field.appendChild(rootBlock);
        if (typeof blocks !== 'undefined') blocks.push(rootBlock);

        rootBlock.style.position = 'absolute';
        rootBlock.style.opacity = '0';

        setTimeout(() => {
            rootBlock.style.left = `${x}px`;
            rootBlock.style.top = `${y}px`;
            rootBlock.style.opacity = '1';
            blockGroups.set(rootBlock, [rootBlock]);
        }, 10);

        return rootBlock;
    }

    return null;
}