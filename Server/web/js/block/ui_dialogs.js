import { fetchTelemetryFields, fetchSavedcomponents } from './api.js';
import { createBlock, removeBlock, updateGroupBox, updateAllGroupBoxes, setupSlotEvents } from './block.js';
import { State, DOM } from './state.js';
import { spawnBlocksFromExpression } from './parser.js';
import { startDrag } from './drag.js';
import { RESULT_TYPE_VARIABLE, RESULT_TYPE_CALCULATED, RESULT_TYPE_FUNCTION, RESULT_TYPE_EXPRESSION } from './config.js';

export async function openTelemetryConfigForm(block) {
    const data = await fetchTelemetryFields();
    
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
    header.innerHTML = '<h3>Select Telemetry Field</h3>';

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
        
        const group = State.blockGroups.get(block);
        if (group) {
            updateGroupBox(group);
            updateAllGroupBoxes();
        }
        modalDiv.remove();
    };

    body.append(msgLabel, msgSelect, fieldLabel, fieldSelect);
    footer.append(cancelBtn, okBtn);
    content.append(header, body, footer);
    modalDiv.appendChild(content);
    document.body.appendChild(modalDiv);
}

/* ================= components Loader ================= */

export async function openLoadcomponentForm(block) {
    const components = await fetchSavedcomponents();

    // UI作成
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.width = '450px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = '<h3>Load component</h3>';

    const body = document.createElement('div');
    body.className = 'modal-body';

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const labelSelect = document.createElement('p');
    labelSelect.className = 'label';
    labelSelect.textContent = 'Select a saved component:';
    
    const componentSelect = document.createElement('select');
    componentSelect.style.width = '100%';
    componentSelect.style.marginBottom = '10px';

    const labelPreview = document.createElement('p');
    labelPreview.className = 'label';
    labelPreview.textContent = 'Expression Preview (Editable if Custom):';

    const previewTx = document.createElement('textarea');
    previewTx.readOnly = true;
    previewTx.style.width = '100%';
    previewTx.style.height = '80px';
    previewTx.style.backgroundColor = '#f0f0f0';

    // --- ボタン作成 ---
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-close';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        removeBlock(block);
        modalDiv.remove();
    };

    // Setボタン
    const setBtn = document.createElement('button');
    setBtn.className = 'btn-send';
    setBtn.textContent = 'Set'; 
    
    // Getボタン
    const getBtn = document.createElement('button');
    getBtn.className = 'btn-send';
    getBtn.textContent = 'Get';
    getBtn.style.backgroundColor = '#4CAF50'; 

    // Createボタン
    const createBtn = document.createElement('button');
    createBtn.className = 'btn-send';
    createBtn.textContent = 'Create';

    // --- データの充填 ---
    if (components.length === 0) {
        const opt = new Option("-- No saved components --", "");
        opt.disabled = true;
        componentSelect.add(opt);
    } else {
        components.forEach(item => {
            const opt = new Option(item.name, item.name);
            componentSelect.add(opt);
        });
    }
    componentSelect.add(new Option("Custom", "CUSTOM"));

    // --- Helper: コンポーネント検索 ---
    const getSelectedComponentData = () => {
        const selectedName = componentSelect.value;
        if (selectedName === 'CUSTOM') return null;
        return components.find(c => c.name === selectedName);
    };

    // --- プレビューとボタン表示の制御 ---
    const updatePreview = () => {
        const isCustom = componentSelect.value === 'CUSTOM';
        
        const compData = getSelectedComponentData();
        const type = isCustom ? null : (compData ? (compData.type || compData.classification) : null);
        
        const expression = isCustom 
            ? previewTx.value 
            : (compData ? (compData.expression || compData.definition) : "");

        // ボタン制御
        if (isCustom) {
            setBtn.style.display = 'none';
            getBtn.style.display = 'none';
            createBtn.style.display = 'inline-block';
        } else {
            createBtn.style.display = 'inline-block';

            if (type === RESULT_TYPE_VARIABLE) {
                setBtn.textContent = 'Set';
                setBtn.style.display = 'inline-block';
                getBtn.style.display = 'inline-block';
            } else if (type === RESULT_TYPE_CALCULATED) {
                // Calculated: inputがある場合のみSetを表示
                const inputCount = (compData && typeof compData.input_count === 'number') ? compData.input_count : 0;
                
                if (inputCount > 0) {
                    setBtn.textContent = 'Set';
                    setBtn.style.display = 'inline-block';
                } else {
                    setBtn.style.display = 'none';
                }
                getBtn.style.display = 'inline-block';

            } else if (type === RESULT_TYPE_FUNCTION) {
                setBtn.textContent = 'Call';
                setBtn.style.display = 'inline-block';
                getBtn.style.display = 'none';
            } else if (type === RESULT_TYPE_EXPRESSION) {
                setBtn.style.display = 'none';
                getBtn.style.display = 'none';
            } else {
                setBtn.textContent = 'Call';
                setBtn.style.display = 'inline-block';
                getBtn.style.display = 'none';
            }
        }

        // プレビュー表示制御
        if (isCustom) {
            previewTx.readOnly = false;
            previewTx.style.backgroundColor = '#ffffff';
            previewTx.placeholder = "Enter your expression here...";
            if (!previewTx.dataset.isUserTyping) previewTx.value = ""; 
        } else {
            previewTx.readOnly = true;
            previewTx.style.backgroundColor = '#f0f0f0';
            previewTx.placeholder = "";
            previewTx.dataset.isUserTyping = ""; 
            previewTx.value = expression;
        }
    };

    componentSelect.addEventListener('change', updatePreview);
    previewTx.addEventListener('input', () => {
        if (componentSelect.value === 'CUSTOM') previewTx.dataset.isUserTyping = "true";
    });

    if (componentSelect.options[0].disabled && componentSelect.options.length > 1) {
        componentSelect.selectedIndex = 1;
    }
    updatePreview();

    // --- ★Helper: スロット(inputs)生成ロジック ---
    const parseInputs = (inputCount) => {
        const count = (typeof inputCount === 'number') ? inputCount : 0;
        const inputs = [];
        for (let i = 0; i < count; i++) {
            inputs.push(`input${i + 1}`);
        }
        return inputs;
    };

    // --- ボタンアクション ---

    // 1. Set (Call) ボタン
    setBtn.onclick = () => {
        const selectedName = componentSelect.value;
        const compData = getSelectedComponentData();
        
        if (!compData) return;

        // 数値を取得
        const inputCount = (typeof compData.input_count === 'number') ? compData.input_count : 0;
        const type = compData.type || compData.classification;

        let inputs;

        if (inputCount > 0) {
            inputs = parseInputs(inputCount);
        } else if (type === RESULT_TYPE_VARIABLE) {
            inputs = ['val'];
        } else {
            inputs = [];
        }

        createCallBlock(block, selectedName, inputs); 
        modalDiv.remove();
    };

    // 2. Get ボタン
    getBtn.onclick = () => {
        const selectedName = componentSelect.value;
        createGetBlock(block, selectedName);
        modalDiv.remove();
    };

    // 3. Create ボタン
    createBtn.onclick = () => {
        const selectedValue = componentSelect.value;
        const compData = getSelectedComponentData();
        let expression = "";

        if (selectedValue === 'CUSTOM') {
            expression = previewTx.value;
            if (!expression.trim()) return alert("Please enter an expression.");
        } else {
            if (!compData) return;
            expression = compData.expression || compData.definition;
        }

        try {
            const success = replaceBlockWithExpression(block, expression);
            if (success) modalDiv.remove();
        } catch (e) {
            console.error(e);
            alert(e.message);
        }
    };

    body.append(labelSelect, componentSelect, labelPreview, previewTx);
    footer.append(cancelBtn, setBtn, getBtn, createBtn);
    content.append(header, body, footer);
    modalDiv.appendChild(content);
    document.body.appendChild(modalDiv);
}

// Set用ブロック生成
function createCallBlock(targetBlock, blockName, inputsArg) {
    const newBlock = document.createElement('div');
    newBlock.className = 'block calc-func-block'; 
    newBlock.dataset.type = 'calc_func';
    newBlock.dataset.value = blockName;
    
    newBlock.style.position = "absolute";
    newBlock.style.zIndex = 1000;
    newBlock.style.display = "inline-flex";
    newBlock.style.alignItems = "center";

    const prefix = document.createElement('span');
    prefix.textContent = `${blockName}( `;
    newBlock.appendChild(prefix);

    const inputs = (Array.isArray(inputsArg) && inputsArg.length > 0) ? inputsArg : ["arg1"];

    inputs.forEach((argName, i) => {
        if (i > 0) {
            const comma = document.createElement('span');
            comma.textContent = ", ";
            newBlock.appendChild(comma);
        }
        const slot = document.createElement("div");
        slot.className = "slot";
        slot.dataset.argName = argName;
        slot.title = argName;
        setupSlotEvents(slot);
        newBlock.appendChild(slot);
    });

    const suffix = document.createElement('span');
    suffix.textContent = " )";
    newBlock.appendChild(suffix);

    newBlock.addEventListener("mousedown", e => {
        if (["INPUT", "SELECT", "BUTTON"].includes(e.target.tagName)) return;
        if (e.button === 0) startDrag(e, newBlock);
    });

    placeBlockOnField(targetBlock, newBlock);
}

// Get用ブロック生成
function createGetBlock(targetBlock, blockName) {
    const newBlock = document.createElement('div');
    newBlock.className = 'block calc-func-block'; 
    newBlock.dataset.type = 'calc_func'; 
    newBlock.dataset.mode = 'get'; 
    newBlock.dataset.value = blockName;
    
    newBlock.style.position = "absolute";
    newBlock.style.zIndex = 1000;
    newBlock.style.display = "inline-flex";
    newBlock.style.alignItems = "center";
    newBlock.classList.add('block-get');

    const prefix = document.createElement('span');
    prefix.textContent = `${blockName}`;
    newBlock.appendChild(prefix);

    newBlock.addEventListener("mousedown", e => {
        if (["INPUT", "SELECT", "BUTTON"].includes(e.target.tagName)) return;
        if (e.button === 0) startDrag(e, newBlock);
    });

    placeBlockOnField(targetBlock, newBlock);
}

function placeBlockOnField(targetBlock, newBlock) {
    if (targetBlock && targetBlock.parentNode) {
        const rect = targetBlock.getBoundingClientRect();
        const fieldRect = DOM.field.getBoundingClientRect();
        const x = rect.left - fieldRect.left + DOM.field.scrollLeft;
        const y = rect.top - fieldRect.top + DOM.field.scrollTop;

        newBlock.style.left = `${x}px`;
        newBlock.style.top = `${y}px`;
        
        DOM.field.appendChild(newBlock);

        State.blocks.push(newBlock);
        State.blockGroups.set(newBlock, [newBlock]);

        removeBlock(targetBlock);
    }
}

function replaceBlockWithExpression(targetBlock, expression) {
    const rect = targetBlock.getBoundingClientRect();
    const fieldRect = DOM.field.getBoundingClientRect();
    const x = rect.left - fieldRect.left + DOM.field.scrollLeft;
    const y = rect.top - fieldRect.top + DOM.field.scrollTop;

    const newBlock = spawnBlocksFromExpression(expression, x, y);
    
    if (newBlock) {
        if (targetBlock.parentNode) targetBlock.parentNode.removeChild(targetBlock);
        State.blocks = State.blocks.filter(b => b !== targetBlock);
        removeBlock(targetBlock);
        return true;
    }
    return false;
}