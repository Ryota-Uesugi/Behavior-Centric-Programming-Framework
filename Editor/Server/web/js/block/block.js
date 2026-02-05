import { FUNC_CONFIG } from './config.js';
import { State, DOM } from './state.js';
import { dom } from './utils.js';
import { startDrag } from './drag.js';
import { validateSlotDrop, handleSlotDrop } from './drop.js';
import { openTelemetryConfigForm, openLoadcomponentForm } from './ui_dialogs.js';

/* ================= ブロック生成ロジック (Strategy Pattern) ================= */

const BLOCK_BUILDERS = {
    // A. 演算子・条件・括弧
    simple: (block, type, value, op) => {
        block.classList.add(`${type.replace('_', '-')}-block`);
        const text = op || value;
        block.textContent = text;
        block.dataset.value = text;
    },

    // B. 数値 (Number)
    number: (block, type, value) => {
        block.classList.add("number-block");
        block.innerHTML = `<span>Number</span>`;
        
        const input = dom.input("number", "block_number_value", value || 0, { style: "width: 60px;" });
        dom.stopProp(input);
        input.addEventListener("input", (e) => { block.dataset.value = e.target.value; });
        block.appendChild(input);
    },

    // C. 文字列 (String)
    string: (block, type, value) => {
        block.classList.add("string-block");
        block.innerHTML = `<span>Text</span>`;

        const input = dom.input("text", "block_string_value", value || "text", {
            style: "width: 100px;",
            placeholder: "name"
        });
        dom.stopProp(input);
        input.addEventListener("input", (e) => { block.dataset.value = e.target.value; });
        block.appendChild(input);
    },

    // D. Bool
    bool: (block, type, value) => {
        block.classList.add("bool-block");
        Object.assign(block.style, { display: "flex", alignItems: "center", gap: "4px" });
        block.innerHTML = `<span>Bool</span>`;

        const input = dom.input("checkbox", "block_bool_value", value, { style: "cursor: pointer;" });
        dom.stopProp(input);
        input.addEventListener("change", (e) => { block.dataset.value = e.target.checked; });
        block.appendChild(input);
    },

    // E. Input / Telemetry / Component / End
    display: (block, type, value) => {
        // --- 変更箇所 (Start) ---
        if (type === "input" || type === "end") {
            block.classList.add(`${type}-block`); // input-block または end-block
            Object.assign(block.style, {
                display: "flex", justifyContent: "center", alignItems: "center", padding: "4px 8px"
            });
            // 値がない場合のデフォルトテキスト設定
            const defaultText = type === "end" ? "End" : "Input";
            block.textContent = value || defaultText;
        // --- 変更箇所 (End) ---
        } else {
            // Telemetry / component
            block.classList.add(`${type}-block`);
            block.textContent = value || type;
            block.dataset.configured = "false";
        }
    },

    // F. 関数系 / Switch
    function: (block, type, value, options = {}) => {
        const { argCount } = options;

        // --- Switchブロック ---
        if (value === 'switch') {
            setupSwitchBlock(block, value);
            
            if (typeof argCount === 'number') {
                // 現在のスロット数を数える (target + default + cases...)
                const currentSlots = block.querySelectorAll('.slot').length;
                
                // 足りない場合、Caseを追加
                if (argCount > currentSlots) {
                    const diff = argCount - currentSlots;
                    // Caseは2スロット(case, result)で1セットなので2で割る
                    const clicksNeeded = Math.floor(diff / 2);
                    const addBtn = block.querySelector('.btn-add-case');
                    if (addBtn) {
                        for(let k=0; k < clicksNeeded; k++) addBtn.click();
                    }
                }
            }
            return;
        }
        
        // --- Sequenceブロック ---
        if (value === 'sequence') {
            setupSequenceBlock(block, value);
            
            if (typeof argCount === 'number') {
                // 現在のスロット数を数える
                const currentSlots = block.querySelectorAll('.slot').length;
                
                // 足りない場合、Stepを追加
                if (argCount > currentSlots) {
                    const diff = argCount - currentSlots;
                    const addBtn = block.querySelector('.btn-add-step');
                    if(addBtn) {
                        // Sequenceは1クリックで1スロット追加
                        for(let k=0; k < diff; k++) addBtn.click();
                    }
                }
            }
            return;
        }

        // --- 通常の関数ブロック ---
        const classMap = {
            'time_func': 'time-func-block',
            'export_func': 'export-func-block',
            'control_func': 'control-func-block',
            'flow_control': 'flow-control-block'
        };
        block.classList.add(classMap[type] || 'calc-func-block');
        Object.assign(block.style, { display: "inline-flex", alignItems: "center" });

        const conf = FUNC_CONFIG[value] || { args: ["arg1", "arg2"] };
        // 設定値を取得
        let argList = Array.isArray(conf.args) ? [...conf.args] : Array(conf.args).fill("arg");

        // argCountが指定されている場合、リストの長さを調整
        if (typeof argCount === 'number') {
            if (argCount > argList.length) {
                const diff = argCount - argList.length;
                for(let i=0; i < diff; i++) {
                    argList.push(`arg${argList.length + 1}`);
                }
            } else if (argCount < argList.length) {
                argList = argList.slice(0, argCount);
            }
        }

        block.appendChild(dom.create('span', '', { textContent: `${value}( ` }));

        argList.forEach((argName, i) => {
            if (i > 0) block.appendChild(dom.create('span', '', { textContent: ", " }));

            const slot = dom.create("div", "slot");
            slot.dataset.argName = argName;
            slot.title = argName;

            if (type === "time_func" && i === argList.length - 1) {
                slot.dataset.accept = "number";
            }

            setupSlotEvents(slot);
            block.appendChild(slot);
        });

        const suffix = (type === "time_func") ? " s )" : " )";
        block.appendChild(dom.create('span', '', { textContent: suffix }));
    }
};

/* ================= ブロック生成コア ================= */

export function createBlock(type, value = "", addToField = true, op = '', customExpr = '', options = {}) {
    const block = dom.create("div", "block");
    block.dataset.type = type;
    block.dataset.value = value;
    Object.assign(block.style, { position: "absolute", zIndex: 1000 });

    // ビルダーの選択と実行
    if (["condition", "operator", "bit_operator", "parenthesis"].includes(type)) {
        BLOCK_BUILDERS.simple(block, type, value, op);
    } else if (BLOCK_BUILDERS[type]) {
        // optionsを渡す
        BLOCK_BUILDERS[type](block, type, value, options);
    // --- 変更箇所 (Start) ---
    } else if (["input", "end", "Telemetry", "component"].includes(type)) { // "end"を追加
        BLOCK_BUILDERS.display(block, type, value);
    // --- 変更箇所 (End) ---
    } else if (["calc_func", "time_func", "export_func", "control_func", "flow_control"].includes(type)) {
        // optionsを渡す
        BLOCK_BUILDERS.function(block, type, value, options);
    } else {
        block.textContent = value || type;
    }

    // ドラッグ開始イベント
    block.addEventListener("mousedown", e => {
        if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(e.target.tagName)) return;
        if (e.button === 0) {
            startDrag(e, block);
        }
    });

    if (addToField) {
        DOM.field.appendChild(block);
        State.blocks.push(block);
    }
    return block;
}

/**
 * Switchブロックの内部構築ロジック
 */
function setupSwitchBlock(block, value) {
    block.classList.add('flow-control-block', 'switch-block');
    Object.assign(block.style, {
        display: "inline-flex", flexDirection: "column", alignItems: "stretch",
        padding: "6px", gap: "6px"
    });

    const conf = FUNC_CONFIG[value] || { args: ["target", "case", "res", "default"] };
    const argList = Array.isArray(conf.args) ? conf.args : Array(conf.args).fill("arg");

    // --- 1. ヘッダー行 ---
    const headerRow = dom.create('div', '', { 
        style: "display: flex; align-items: center; gap: 6px; padding-left: 4px;" 
    });
    
    headerRow.appendChild(dom.create('span', '', { textContent: "Switch", style: "font-weight: bold;" }));

    const targetSlot = dom.create('div', 'slot');
    targetSlot.dataset.argName = argList[0] || "target";
    targetSlot.title = "Target Value";
    setupSlotEvents(targetSlot);
    headerRow.appendChild(targetSlot);

    const addBtn = dom.create('button', 'btn-add-case', {
        textContent: '+', title: "Add Case",
        style: "cursor: pointer; padding: 0 6px;"
    });
    addBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    headerRow.appendChild(addBtn);

    block.appendChild(headerRow);

    // --- 疑似ブロック(Targetの分身)の表示更新ロジック ---
    const updateSwitchCaseVisuals = () => {
        const targetBlock = targetSlot.querySelector('.block');
        const pseudoText = targetBlock ? "Target" : null;
        
        block.querySelectorAll('.case-result-row').forEach(row => {
            const cSlot = row.querySelector('.slot[data-arg-name^="case"]');
            if (!cSlot) return;

            let pseudo = row.querySelector('.pseudo-target-block');
            
            if (pseudoText) {
                if (!pseudo) {
                    pseudo = dom.create('div', 'pseudo-target-block', {
                        style: "opacity: 0.7; font-size: 0.8em; margin-right: 2px;"
                    });
                    row.insertBefore(pseudo, cSlot);
                }
                pseudo.textContent = pseudoText;
                cSlot.style.borderTopLeftRadius = "0";
                cSlot.style.borderBottomLeftRadius = "0";
            } else {
                if (pseudo) pseudo.remove();
                cSlot.style.borderTopLeftRadius = "";
                cSlot.style.borderBottomLeftRadius = "";
            }
        });
    };

    const observer = new MutationObserver(updateSwitchCaseVisuals);
    observer.observe(targetSlot, { childList: true });

    // --- [Helper] Case行生成関数 ---
    const createCaseRow = (caseArgName, resArgName) => {
        const row = dom.create('div', 'case-result-row', {
            style: "display: flex; justify-content: flex-start; align-items: center; gap: 4px; padding-left: 4px;"
        });

        const cSlot = dom.create('div', 'slot');
        cSlot.dataset.argName = caseArgName || "case";
        cSlot.title = "Case Condition";
        setupSlotEvents(cSlot);
        row.appendChild(cSlot);

        const rSlot = dom.create('div', 'slot');
        rSlot.dataset.argName = resArgName || "result";
        rSlot.title = "Result Value";
        setupSlotEvents(rSlot);
        row.appendChild(rSlot);

        // 削除ボタン
        const delBtn = dom.create('button', 'btn-del-case', {
            textContent: '-', title: "Remove Case",
            style: "margin-left: 4px; cursor: pointer;"
        });
        delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        delBtn.onclick = () => {
            row.querySelectorAll('.block').forEach(b => removeBlock(b));
            row.remove();
            updateSwitchCaseVisuals();
        };
        row.appendChild(delBtn);

        return row;
    };

    // --- 3. デフォルト行 (Default) ---
    const defaultRow = dom.create('div', 'default-row', {
        style: "display: flex; align-items: center; gap: 4px; margin-top: 4px; padding-left: 4px;"
    });

    defaultRow.appendChild(dom.create('span', '', { textContent: "default :", style: "font-size: 0.9em;" }));

    const defSlot = dom.create('div', 'slot');
    defSlot.dataset.argName = argList[argList.length - 1] || "default";
    defSlot.title = "Default Value";
    setupSlotEvents(defSlot);
    defaultRow.appendChild(defSlot);

    block.appendChild(defaultRow);

    // --- ボタンクリック動作 ---
    addBtn.onclick = () => {
        block.insertBefore(createCaseRow("case_ext", "result_ext"), defaultRow);
        updateSwitchCaseVisuals();
    };

    setTimeout(updateSwitchCaseVisuals, 0);
}

/**
 * Sequenceブロックの内部構築ロジック
 */
function setupSequenceBlock(block, value) {
    block.classList.add('flow-control-block', 'sequence-block');
    Object.assign(block.style, {
        display: "inline-flex", flexDirection: "column", alignItems: "stretch",
        padding: "6px", gap: "4px"
    });

    // 設定取得 (デフォルトは step1, step2)
    const conf = FUNC_CONFIG[value] || { args: ["step1", "step2"] };
    const argList = Array.isArray(conf.args) ? conf.args : Array(conf.args).fill("step");

    // --- 1. ヘッダー行 (+ボタン) ---
    const headerRow = dom.create('div', '', { 
        style: "display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 4px;" 
    });
    
    headerRow.appendChild(dom.create('span', '', { textContent: "Sequence", style: "font-weight: bold;" }));

    const addBtn = dom.create('button', 'btn-add-step', {
        textContent: '+', title: "Add Step",
        style: "cursor: pointer; padding: 0 6px;"
    });
    addBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    headerRow.appendChild(addBtn);

    block.appendChild(headerRow);

    // --- [Helper] Step行生成関数 ---
    const createStepRow = (argName) => {
        const row = dom.create('div', 'sequence-step-row', {
            style: "display: flex; align-items: center; gap: 4px; padding-left: 4px;"
        });

        // 実行ステップ用スロット
        const slot = dom.create('div', 'slot');
        slot.dataset.argName = argName || "step";
        slot.title = "Execute Step";
        slot.style.minWidth = "80px"; // 少し広めに確保
        setupSlotEvents(slot);
        row.appendChild(slot);

        // 削除ボタン
        const delBtn = dom.create('button', 'btn-del-step', {
            textContent: '-', title: "Remove Step",
            style: "cursor: pointer;"
        });
        delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        delBtn.onclick = () => {
            row.querySelectorAll('.block').forEach(b => removeBlock(b));
            row.remove();
        };
        row.appendChild(delBtn);

        return row;
    };

    // --- 2. 初期引数分の行を生成 ---
    argList.forEach(argName => {
        block.appendChild(createStepRow(argName));
    });

    // --- ボタンクリック動作 ---
    addBtn.onclick = () => {
        block.appendChild(createStepRow("step_ext"));
    };
}

/* ================= スロットイベント管理 ================= */

export function setupSlotEvents(slot) {
    slot.addEventListener('mouseenter', (e) => {
        if (!State.dragInfo) return;
        e.stopPropagation();

        if (State.lastActiveSlot && State.lastActiveSlot !== slot) {
            State.lastActiveSlot.classList.remove('slot-hover-valid', 'slot-hover-invalid');
        }
        State.lastActiveSlot = slot;

        const validation = validateSlotDrop(State.dragInfo.group, slot);

        if (validation.ok) {
            if (State.globalTooltip) State.globalTooltip.style.display = 'none';
            slot.classList.add('slot-hover-valid'); 
        } else {
            slot.classList.add('slot-hover-invalid');
            if (State.globalTooltip) {
                State.globalTooltip.textContent = `🚫 ${validation.reason}`;
                Object.assign(State.globalTooltip.style, {
                    display: 'block', opacity: '1',
                    left: `${slot.getBoundingClientRect().right + 10}px`,
                    top: `${slot.getBoundingClientRect().top - 10}px`
                });
            }
        }
    });

    slot.addEventListener('mouseleave', () => {
        slot.classList.remove('slot-hover-valid', 'slot-hover-invalid');
        if (State.lastActiveSlot === slot) State.lastActiveSlot = null;
        if (State.globalTooltip) State.globalTooltip.style.display = 'none';
    });

    slot.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        handleSlotDrop(e, slot);
    });
}

/* ================= 複製・削除・グルーピング管理 ================= */

/**
 * ブロックが持つ直下のスロットのみを取得するヘルパー
 * (孫ブロックのスロットを混入させないため)
 */
function getOwnSlots(block) {
    // block以下の全slotを取得し、そのslotの直近の親blockが自分自身であるものだけをフィルタリング
    return Array.from(block.querySelectorAll('.slot')).filter(slot => slot.closest('.block') === block);
}

export function duplicateBlock(original, targetX = null, targetY = null) {
    if (!original || !original.dataset) return null;
    const { type, value = "", op = "", expr = "" } = original.dataset;
    
    // 1. 標準的な複製（初期状態のブロック生成）
    const clone = createBlock(type, value, true, op, expr);
    if (!clone) return null;

    if (targetX !== null && targetY !== null) {
        clone.style.left = `${targetX}px`;
        clone.style.top = `${targetY}px`;
    }

    if (original.dataset.mode === 'get') {
        clone.dataset.mode = 'get';
        clone.classList.add('block-get');
        clone.innerHTML = '';
        const prefix = document.createElement('span');
        prefix.textContent = value;
        clone.appendChild(prefix);
        return clone;
    }

    // Input/Bool値のコピー
    const origInput = original.querySelector('input');
    const cloneInput = clone.querySelector('input');
    if (origInput && cloneInput) {
        if (type === 'bool') {
            cloneInput.checked = origInput.checked;
            clone.dataset.value = origInput.checked;
        } else {
            cloneInput.value = origInput.value;
            clone.dataset.value = origInput.value;
        }
    }

    if (type === 'Telemetry') {
        clone.dataset.configured = original.dataset.configured; 
        clone.textContent = original.textContent;
        clone.dataset.value = original.dataset.value;
        clone.dataset.message = original.dataset.message;
        clone.dataset.field = original.dataset.field;
    }
    
    // --- 変更箇所 (Start) ---
    if (["condition", "operator", "bit_operator", "parenthesis", "Telemetry", "input", "end"].includes(type)) { // "end"を追加
    // --- 変更箇所 (End) ---
        clone.textContent = original.textContent;
    }

    // 関数系の再帰複製
    if (["calc_func", "time_func", "export_func", "control_func", "flow_control"].includes(type)) {
        
        const origSlots = getOwnSlots(original);
        let cloneSlots = getOwnSlots(clone);
        
        // --- デフォルト生成でスロット過多になった場合（Setter等）の削除ロジック ---
        if (cloneSlots.length > origSlots.length) {
             const excessCount = cloneSlots.length - origSlots.length;
             for (let i = 0; i < excessCount; i++) {
                 const slotToRemove = cloneSlots.pop();
                 const prev = slotToRemove.previousElementSibling;
                 if (prev && prev.tagName === 'SPAN' && prev.textContent.includes(',')) {
                     prev.remove();
                 }
                 slotToRemove.remove();
             }
        }

        // --- 不足分のスロット追加ロジック ---
        if (cloneSlots.length < origSlots.length) {
            // Switch/Sequenceはボタンで追加
            if ((value === 'switch' || value === 'sequence')) {
                const addBtn = clone.querySelector('.btn-add-case') || clone.querySelector('.btn-add-step');
                if (addBtn) {
                    while (getOwnSlots(clone).length < origSlots.length) {
                        addBtn.click();
                    }
                    cloneSlots = getOwnSlots(clone);
                }
            } 
            // 汎用ブロックは手動追加
            else {
                const slotsToAdd = origSlots.length - cloneSlots.length;
                // 挿入位置: 最後の閉じカッコ ' )' または ' s )' の直前
                let insertTarget = null;
                for (let i = clone.childNodes.length - 1; i >= 0; i--) {
                    const node = clone.childNodes[i];
                    if (node.nodeType === Node.TEXT_NODE || (node.tagName === 'SPAN' && node.textContent.includes(')'))) {
                        insertTarget = node;
                        break;
                    }
                }
                if (!insertTarget) insertTarget = clone.lastElementChild;

                for (let i = 0; i < slotsToAdd; i++) {
                    const comma = dom.create('span', '', { textContent: ", " });
                    clone.insertBefore(comma, insertTarget);

                    const newSlot = dom.create('div', 'slot');
                    // 元のブロックから引数名をコピー（もしあれば）
                    const origSlotIndex = cloneSlots.length;
                    const origSlot = origSlots[origSlotIndex];
                    const argName = origSlot ? origSlot.dataset.argName : `arg${origSlotIndex+1}`;
                    
                    newSlot.dataset.argName = argName;
                    newSlot.title = argName;
                    setupSlotEvents(newSlot);

                    clone.insertBefore(newSlot, insertTarget);
                    cloneSlots.push(newSlot);
                }
            }
        }

        // 子要素の複製と配置
        origSlots.forEach((oSlot, idx) => {
            Array.from(oSlot.children).forEach(child => {
                if (!child.classList.contains('block')) return;
                
                const childClone = duplicateBlock(child);
                if (childClone) {
                    if (cloneSlots[idx]) {
                        cloneSlots[idx].appendChild(childClone);
                        childClone.style.position = "static";
                        State.blocks = State.blocks.filter(x => x !== childClone);
                    } else {
                        removeBlock(childClone);
                    }
                }
            });
        });
    }
    return clone;
}

export function removeBlock(b) {
    if (!b) return;

    // ネストしたブロックの再帰的削除
    b.querySelectorAll('.slot').forEach(s => {
        Array.from(s.children)
            .filter(el => el.classList.contains('block'))
            .forEach(removeBlock);
    });

    const g = State.blockGroups.get(b); 
    if (g) { 
        g.forEach(x => State.blockGroups.delete(x)); 
        removeGroupBox(g); 
    } 
    
    b.remove(); 
    State.blocks = State.blocks.filter(x => x !== b); 
}

export function clearAllBlocks() {
    if (State.blocks.length === 0 || !confirm("フィールド上のすべてのブロックを削除しますか？")) return;
    [...State.blocks].forEach(block => {
        if (block && block.parentNode === DOM.field) removeBlock(block);
    });
    State.blocks = [];
    State.blockGroups.clear();
    document.querySelectorAll('.group-box').forEach(el => el.remove());
}

/* ================= グループボックス描画 ================= */

export function drawGroupBox(group){
    removeGroupBox(group);
    if(!group || group.length <= 1) return;

    const box = dom.create('div', 'group-box');
    DOM.field.appendChild(box);
    State.groupBoxes.set(group, box);
    updateGroupBox(group);
}

export function updateGroupBox(group) {
    if (!group || group.length <= 1) { 
        removeGroupBox(group); 
        return; 
    }

    const validBlocks = group.filter(b => b.parentNode === DOM.field);
    if (validBlocks.length <= 1) {
        removeGroupBox(group);
        return;
    }

    const box = State.groupBoxes.get(group);
    if(!box) return;
    
    const sorted = validBlocks.sort((a, b) => a.offsetLeft - b.offsetLeft); 
    
    let curL = sorted[0].offsetLeft;
    const top = Math.min(...sorted.map(b => b.offsetTop));
    
    sorted.forEach((b) => {
        b.style.left = `${curL}px`; 
        b.style.top = `${top}px`;
        curL += b.offsetWidth + 5;
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

export function removeGroupBox(g){ 
    const box = State.groupBoxes.get(g); 
    if(box){ 
        box.remove(); 
        State.groupBoxes.delete(g); 
    } 
}

export function updateAllGroupBoxes(){ 
    const seen = new Set(); 
    State.blockGroups.forEach(g => { 
        if(!seen.has(g)){ 
            updateGroupBox(g); 
            seen.add(g); 
        }
    }); 
}

export function updateParentGroupsRecursive(block) {
    let current = block;
    while (current) {
        const pg = State.blockGroups.get(current);
        if (pg) updateGroupBox(pg);
        
        const parentSlot = current.closest('.slot');
        current = parentSlot ? parentSlot.closest('.block') : null;
    }
}