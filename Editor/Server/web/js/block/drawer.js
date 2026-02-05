import { DOM, State } from './state.js';
import { FUNC_CONFIG, GENERAL_DESC, singleBlock, operators } from './config.js';
import { createBlock } from './block.js';
import { startDrag } from './drag.js';

/* ================= ドロワー（パレット）操作 ================= */

DOM.toggleBtn.addEventListener('click', () => {
    State.isOpen = !State.isOpen;
    DOM.drawer.classList.toggle('closed', !State.isOpen);
    DOM.toggleBtn.classList.toggle('closed', !State.isOpen);
    DOM.toggleBtn.textContent = State.isOpen ? '≪' : '≫';
});

function createDrawerBlock(text, type, dataAttr = {}, descText = "", parent = DOM.drawer) {
    const block = document.createElement('div');
    block.className = 'drawer-block';
    block.dataset.type = type;
    
    for (const [key, value] of Object.entries(dataAttr)) {
        block.dataset[key] = value;
    }
    
    const label = document.createElement('span');
    label.textContent = text;
    block.appendChild(label);

    if (!descText) {
        if (dataAttr.func && FUNC_CONFIG) {
            descText = FUNC_CONFIG[dataAttr.func]?.desc || "";
        } else if (GENERAL_DESC) {
            descText = GENERAL_DESC[type] || (dataAttr.op ? `演算子: ${dataAttr.op}` : "");
        }
    }

    // iマーク
    if (descText) {
        block.dataset.desc = descText;
        const infoIcon = document.createElement('div');
        infoIcon.className = 'info-icon';
        infoIcon.textContent = 'i';

        infoIcon.addEventListener('mouseenter', () => {
            if(State.globalTooltip) {
                const rect = infoIcon.getBoundingClientRect();
                State.globalTooltip.innerText = descText;
                State.globalTooltip.style.display = 'block';
                State.globalTooltip.style.top = `${rect.top}px`;
                State.globalTooltip.style.left = `${rect.right + 8}px`;
                State.globalTooltip.style.opacity = '1';
            }
        });

        infoIcon.addEventListener('mouseleave', () => {
            if(State.globalTooltip) {
                State.globalTooltip.style.display = 'none';
                State.globalTooltip.style.opacity = '0';
            }
        });
        block.appendChild(infoIcon);
    }

    if (parent) {
        parent.appendChild(block);
    }
    
    return block;
}

/**
 * ドロワー生成
 */

// 1. ドロワーからの生成イベント
DOM.drawer.addEventListener('mousedown', e => {
    // iマークは無視
    if (e.target.closest('.info-icon')) return;

    const target = e.target.closest('.drawer-block');
    if (!target) return;

    const type = target.dataset.type;
    const value = target.dataset.func ||''; 
    const op = target.dataset.op || '';
    const expr = target.dataset.desc || '';

    let initialValue = value;
    if (type === 'number') {
        const input = target.querySelector('input');
        initialValue = input ? input.value : '1';
    }

    const newBlock = createBlock(type, initialValue, true, op, expr);
    placeBlockAtMouse(e, newBlock);
    startDrag(e, newBlock);
});

function placeBlockAtMouse(e, block) {
    const fieldRect = DOM.field.getBoundingClientRect();
    const width = block.offsetWidth || 120; 
    const height = block.offsetHeight || 40;
    const x = e.clientX - fieldRect.left + DOM.field.scrollLeft - width / 2;
    const y = e.clientY - fieldRect.top + DOM.field.scrollTop - height / 2;
    block.style.left = `${x}px`;
    block.style.top  = `${y}px`;
}

// 2. コンテンツ構築
singleBlock.forEach(block => {
    createDrawerBlock(block.Name, block.type);
});

// 演算子
operators.forEach(group => {
    group.list.forEach(op => {
        createDrawerBlock(op, group.type, { op: op });
    });
});

// 関数ブロック
if (FUNC_CONFIG) {
    Object.entries(FUNC_CONFIG).forEach(([funcName, conf]) => {
        const label = getFuncLabel(funcName, conf);
        createDrawerBlock(label, conf.category, { 
            func: funcName,
            args: conf.args
        });
    });
}

function getFuncLabel(name, conf) {
    let slots = [];
    for (let i = 0; i < conf.args; i++) {
        const isLastArg = (i === conf.args - 1);
        const isTimeFunc = (conf.category === 'time_func');
        if (isTimeFunc && isLastArg) {
            slots.push("[ ]");
        } else {
            slots.push("__");
        }
    }
    return `${name}( ${slots.join(', ')} )`;
}