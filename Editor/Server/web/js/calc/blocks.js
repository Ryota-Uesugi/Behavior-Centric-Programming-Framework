/* ================= Global Variable Definitions ================= */
const field = document.getElementById('field');
let blocks = [];
let blockGroups = new Map();
let groupBoxes = new Map();
let dragInfo = null; // Also referenced in drag.js
let pendingExpression = ''; // Used in config.js/modal

// Tooltip
let globalTooltip = document.getElementById('global-tooltip');
if (!globalTooltip) {
    globalTooltip = document.createElement('div');
    globalTooltip.id = 'global-tooltip';
    document.body.appendChild(globalTooltip);
}

// Mouse position (for duplication)
let lastMousePos = { x: 0, y: 0 };
window.addEventListener('mousemove', e => {
    lastMousePos.x = e.clientX;
    lastMousePos.y = e.clientY;
}, true);

/* ================= Block Creation Core ================= */

/**
 * General Block Creation
 */
function createBlock(type, value = "", addToField = true, op = '', customExpr = '') {
    const block = document.createElement("div");
    block.className = "block";
    block.dataset.type = type;
    block.dataset.value = value;
    block.style.position = "absolute";
    block.style.zIndex = 1000;

    // --- A. Operators, Conditions, Parentheses ---
    if (["condition", "operator", "bit_operator", "parenthesis"].includes(type)) {
        block.classList.add(`${type.replace('_', '-')}-block`);
        block.textContent = op || value;
        block.dataset.value = op || value;

    // --- B. Numbers ---
    } else if (type === "number") {
        block.classList.add("number-block");
        block.innerHTML = `<span>Number</span>`;
        const input = document.createElement("input");
        input.name = "block_number_value"; 
        input.type = "number";
        input.value = value || 1;
        input.style.width = "60px";
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        block.appendChild(input);

    // --- C. Strings (Name) ---
    } else if (type === "string") {
        block.classList.add("string-block"); 
        block.innerHTML = `<span>Text</span>`; 
        
        const input = document.createElement("input");
        input.name = "block_string_value"; 
        input.type = "text"; 
        input.value = value || "text";
        input.style.width = "100px"; 
        input.placeholder = "name";
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        block.appendChild(input);

    // --- [NEW] Storage (Saved Expressions) ---
    } else if (type === "storage") {
        block.classList.add("storage-block");
        block.dataset.expr = customExpr;
        block.textContent = value;

    // --- D. MAVLink / Setting ---
    } else if (type === "mavlink") {
        block.classList.add('mavlink-block');
        block.textContent = value || 'MAVLink';
        block.dataset.configured = "false";

    } else if (type === "setting") {
        block.classList.add('setting-block');
        block.textContent = value || 'setting';
        block.dataset.configured = "false";

    // --- E. Functions (calc / time / export / control / flow) ---
    } else if (["calc_func", "time_func", "export_func", "control_func", "flow_control"].includes(type)) {
        
        let className = 'calc-func-block';
        if (type === 'time_func') className = 'time-func-block';
        if (type === 'export_func') className = 'export-func-block'; 
        if (type === 'control_func') className = 'control-func-block';
        if (type === 'flow_control') className = 'flow-control-block';
        
        block.classList.add(className);
        block.style.display = "inline-flex";
        block.style.alignItems = "center";

        // Reference FUNC_CONFIG
        // [Change] Changed default to array format
        const conf = (typeof FUNC_CONFIG !== 'undefined' && FUNC_CONFIG[value]) 
                      ? FUNC_CONFIG[value] 
                      : { args: ["arg1", "arg2"] };
        
        // Safety: Convert to array if legacy format (number) is mixed in
        const argList = Array.isArray(conf.args) ? conf.args : Array(conf.args).fill("arg");

        const prefix = document.createElement('span');
        prefix.textContent = `${value}( `;
        block.appendChild(prefix);

        // [Change] Loop by argList length
        argList.forEach((argName, i) => {
            if (i > 0) {
                const comma = document.createElement('span');
                comma.textContent = ", ";
                block.appendChild(comma);
            }

            const slot = document.createElement("div");
            slot.className = "slot";
            
            // [Add] Keep argument name as data attribute (can be used for CSS display or validation)
            slot.dataset.argName = argName;
            slot.title = argName; // Show argument name on mouseover

            const isLastArg = (i === argList.length - 1);
            if (type === "time_func" && isLastArg) {
                slot.dataset.accept = "number";
            }

            setupSlotEvents(slot);
            block.appendChild(slot);
        });

        const suffix = document.createElement('span');
        suffix.textContent = (type === "time_func") ? " s )" : " )";
        block.appendChild(suffix);
    }

    // Start drag
    block.addEventListener("mousedown", e => {
        if (["INPUT", "SELECT"].includes(e.target.tagName)) return;
        if (e.button === 0 && typeof startDrag === 'function') {
            startDrag(e, block);
        }
    });

    if (addToField) {
        field.appendChild(block);
        if (typeof blocks !== 'undefined') blocks.push(block);
    }
    return block;
}

/**
 * Register Slot Events
 */
let lastHoveredSlot = null;

function setupSlotEvents(slot) {
    slot.addEventListener('mouseenter', (e) => {
        if (!dragInfo) return;
        e.stopPropagation();

        if (lastHoveredSlot && lastHoveredSlot !== slot) {
            lastHoveredSlot.classList.remove('slot-hover-valid', 'slot-hover-invalid');
        }
        lastHoveredSlot = slot;

        // Slot info (argName etc.) becomes available during validation
        const validation = (typeof validateSlotDrop === 'function') 
                           ? validateSlotDrop(dragInfo.group, slot) 
                           : { ok: false, reason: "Loading..." };

        if (validation.ok) {
            if (globalTooltip) globalTooltip.style.display = 'none';
            slot.classList.add('slot-hover-valid'); 
        } else {
            slot.classList.add('slot-hover-invalid');
            if (globalTooltip) {
                globalTooltip.textContent = `🚫 ${validation.reason}`;
                globalTooltip.style.display = 'block';
                globalTooltip.style.opacity = '1';
                const rect = slot.getBoundingClientRect();
                globalTooltip.style.left = `${rect.right + 10}px`;
                globalTooltip.style.top = `${rect.top - 10}px`;
            }
        }
    });

    slot.addEventListener('mouseleave', () => {
        slot.classList.remove('slot-hover-valid', 'slot-hover-invalid');
        if (lastHoveredSlot === slot) lastHoveredSlot = null;
        if (globalTooltip) globalTooltip.style.display = 'none';
    });

    slot.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if(typeof handleSlotDrop === 'function') {
            handleSlotDrop(e, slot);
        }
    });
}

/* ================= Duplication, Deletion, Grouping Management ================= */
// (No changes to the following functions, but kept for completeness)

function duplicateBlock(original, targetX = null, targetY = null) {
    if (!original || !original.dataset) return null;
    const type = original.dataset.type;
    const value = original.dataset.value || "";
    const op = original.dataset.op || "";
    const expr = original.dataset.expr || "";
    
    const clone = createBlock(type, value, true, op, expr);
    if (!clone) return null;

    if (targetX !== null && targetY !== null) {
        clone.style.left = `${targetX}px`;
        clone.style.top = `${targetY}px`;
    }

    if (type === 'number' || type === 'string') {
        const origInput = original.querySelector('input');
        const cloneInput = clone.querySelector('input');
        if (origInput && cloneInput) {
            cloneInput.value = origInput.value;
        }
    }

    if (type === 'mavlink') {
        clone.dataset.configured = original.dataset.configured; 
        clone.textContent = original.textContent;
        clone.dataset.value = original.dataset.value;
    }
    
    if (["condition", "operator", "bit_operator", "parenthesis", "mavlink", "storage"].includes(type)) {
        clone.textContent = original.textContent;
    }

    // Recursive duplication of functions
    if (["calc_func", "time_func", "export_func", "control_func", "flow_control"].includes(type)) {
        const origSlots = original.querySelectorAll(':scope > .slot');
        const cloneSlots = clone.querySelectorAll(':scope > .slot');
        origSlots.forEach((oSlot, idx) => {
            Array.from(oSlot.children).forEach(child => {
                const childClone = duplicateBlock(child);
                if (childClone) {
                    if (cloneSlots[idx]) {
                         cloneSlots[idx].appendChild(childClone);
                         childClone.style.position = "static";
                         blocks = blocks.filter(b => b !== childClone);
                    }
                }
            });
        });
    }
    return clone;
}

function removeBlock(b) {
    if (!b) return;

    const slot = b.querySelector('.slot');
    if (slot) {
        const children = Array.from(slot.children).filter(el => el.classList.contains('block'));
        children.forEach(removeBlock); 
    }

    const g = blockGroups.get(b); 
    if (g) { 
        g.forEach(x => blockGroups.delete(x)); 
        removeGroupBox(g); 
    } 
    
    b.remove(); 
    if (typeof blocks !== 'undefined') {
        blocks = blocks.filter(x => x !== b); 
    }
}

function clearAllBlocks() {
    if (blocks.length === 0 || !confirm("Are you sure you want to delete all blocks on the field?")) return;
    [...blocks].forEach(block => {
        if (block && block.parentNode === field) removeBlock(block);
    });
    blocks = [];
    blockGroups.clear();
    document.querySelectorAll('.group-box').forEach(el => el.remove());
}

window.addEventListener('keydown', e => {
    if (dragInfo) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const groupToDelete = [...dragInfo.group];
            dragInfo = null;
            
            if (typeof dropToTrash === 'function') dropToTrash(groupToDelete);
            else groupToDelete.forEach(removeBlock);

            if (typeof hideInsertIndicator === 'function') hideInsertIndicator();
            return;
        }
        if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            const oldGroup = dragInfo.group;
            oldGroup.forEach(b => b.classList.remove("dragging"));
            const offsetDist = 5;
            const newGroup = oldGroup.map(ob => {
                const nx = ob.offsetLeft + offsetDist;
                const ny = ob.offsetTop + offsetDist;
                return duplicateBlock(ob, nx, ny);
            });
            newGroup.forEach(nb => nb.classList.add("dragging"));
            
            dragInfo.group = newGroup;
            dragInfo.offsets = newGroup.map(nb => ({
                block: nb,
                offsetX: lastMousePos.x - nb.offsetLeft,
                offsetY: lastMousePos.y - nb.offsetTop
            }));
            
            if (newGroup.length > 1) {
                newGroup.forEach(nb => blockGroups.set(nb, newGroup));
                drawGroupBox(newGroup);
            }
            updateAllGroupBoxes();
        }
    } else if (e.key === 'Delete' && e.shiftKey) {
        clearAllBlocks();
    }
});

/* ================= Stringification Utility ================= */

function getBlockExpression(block) {
    if (!block || !block.dataset) return '';
    const type = block.dataset.type;

    if (type === 'number') {
        return block.querySelector('input')?.value || '0';
    }

    if (type === 'string') {
        const val = block.querySelector('input')?.value || '';
        return `'${val}'`;
    }

    if (type === 'storage') {
        return block.dataset.expr || '?';
    }

    if (["calc_func", "time_func", "export_func", "control_func", "flow_control"].includes(type)) {
        const funcName = block.dataset.func || block.dataset.value;
        const children = Array.from(block.childNodes);
        let argsExprs = [];

        children.forEach(node => {
            if (node.classList && node.classList.contains('slot')) {
                const childBlocks = Array.from(node.children).filter(el => el.classList.contains('block'));
                if (childBlocks.length > 0) {
                    const combined = childBlocks.map(b => getBlockExpression(b)).join(' ');
                    argsExprs.push(combined);
                } else {
                    argsExprs.push("?");
                }
            }
        });
        return `${funcName}( ${argsExprs.join(', ')} )`;
    }
    return block.dataset.op || block.dataset.value || block.textContent.trim();
}

/* ================= Group Box Drawing ================= */

function drawGroupBox(group){
    if(group.length <= 1) { 
        removeGroupBox(group); 
        return; 
    }
    removeGroupBox(group);
    const box = document.createElement('div');
    box.className = 'group-box';
    field.appendChild(box);
    groupBoxes.set(group, box);
    updateGroupBox(group);
}


function updateGroupBox(group) {
    if (!group || group.length <= 1) { 
        removeGroupBox(group); 
        return; 
    }

    const validBlocks = group.filter(b => b.parentNode === field);

    if (validBlocks.length <= 1) {
        removeGroupBox(group);
        return;
    }

    const box = groupBoxes.get(group);
    if(!box) return;
    
    const sorted = validBlocks.sort((a, b) => a.offsetLeft - b.offsetLeft); 
    
    let curL = sorted[0].offsetLeft;
    const top = Math.min(...sorted.map(b => b.offsetTop));
    
    sorted.forEach((b) => {
        b.style.left = `${curL}px`; 
        b.style.top = `${top}px`;
        curL += b.offsetWidth + 5;
        blockGroups.set(b, group); 
    });
    
    const totalW = curL - 5 - sorted[0].offsetLeft;
    const maxH = Math.max(...sorted.map(b => b.offsetHeight));
    
    Object.assign(box.style, { 
        left: `${sorted[0].offsetLeft - 5}px`, 
        top: `${top - 5}px`, 
        width: `${totalW + 10}px`, 
        height: `${maxH + 10}px`, 
        display: 'block' 
    });
}

function removeGroupBox(g){ 
    const box = groupBoxes.get(g); 
    if(box){ 
        box.remove(); 
        groupBoxes.delete(g); 
    } 
}

function updateAllGroupBoxes(){ 
    const seen = new Set(); 
    blockGroups.forEach(g => { 
        if(!seen.has(g)){ 
            updateGroupBox(g); 
            seen.add(g); 
        }
    }); 
}

function updateParentGroupsRecursive(block) {
    let current = block;
    while (current) {
        const pg = blockGroups.get(current);
        if (pg) updateGroupBox(pg);
        
        const parentSlot = current.closest('.slot');
        if (parentSlot) {
            current = parentSlot.closest('.block');
        } else {
            current = null;
        }
    }
}