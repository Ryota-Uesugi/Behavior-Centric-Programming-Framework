import { State, DOM } from './state.js';
import { combinableOps } from './config.js';
import { removeBlock, removeGroupBox, drawGroupBox, updateAllGroupBoxes, updateParentGroupsRecursive } from './block.js';
import { BlockEditorApp } from './modal.js';
import { COMPONENT_CONFIG, SEND_CONFIG } from './config.js';

// ================================
// ドロップ終了時の分岐
// ================================
export function handleDrop(ev, group) {
    const { clientX: x, clientY: y } = ev;
    const tRect = DOM.trash.getBoundingClientRect();
    const eRect = DOM.expressionArea.getBoundingClientRect();
    const sRect = DOM.compomentArea.getBoundingClientRect();

    // 1. ゴミ箱にドロップ
    if (x >= tRect.left && x <= tRect.right && y >= tRect.top && y <= tRect.bottom) {
        dropToTrash(group);
        return;
    }

    // 2. 式生成エリアにドロップ
    if (x >= eRect.left && x <= eRect.right && y >= eRect.top && y <= eRect.bottom) {
        dropToExpressionArea(group);
        return;
    }

    // 3. 倉庫エリアにドロップ
    if (x >= sRect.left && x <= sRect.right && y >= sRect.top && y <= sRect.bottom) {
        dropTocompomentArea(group);
        return;
    }

    // 4. グループ間の挿入
    if (State.dragInfo && State.dragInfo.targetGroup && State.dragInfo.insertIndex != null) {
        dropToGroupInsert(group, State.dragInfo.targetGroup, State.dragInfo.insertIndex);
    } else {
        // 4. ワークスペースへの通常配置
        dropToWorkspace(group);
    }
}

// ================================
// 個別のアクション
// ================================

function dropToTrash(group) {
    group.forEach(removeBlock);
}

function dropToExpressionArea(group) {
    BlockEditorApp.processDropAndOpenUI(group, SEND_CONFIG);
    group.forEach(b => {
        b.style.left = `${b.origLeft}px`;
        b.style.top = `${b.origTop}px`;
    });
    updateAllGroupBoxes();
}

function dropTocompomentArea(group) {
    BlockEditorApp.processDropAndOpenUI(group, COMPONENT_CONFIG);
    group.forEach(b => {
        b.style.left = `${b.origLeft}px`;
        b.style.top = `${b.origTop}px`;
    });
    updateAllGroupBoxes();
}

function dropToGroupInsert(group, targetGroup, index) {
    removeGroupBox(targetGroup);
    removeGroupBox(group);
    targetGroup.splice(index, 0, ...group);
    targetGroup.forEach(b => State.blockGroups.set(b, targetGroup));
    drawGroupBox(targetGroup);
}

function dropToWorkspace(group) {
    group.forEach(b => {
        if (!b.parentNode) DOM.field.appendChild(b);
        if (!State.blocks.includes(b)) {
            State.blocks.push(b);
        }
        checkCollisionAndConnect(b);
    });
}

// ================================
// スロットバリデーション
// ================================

export function validateSlotDrop(group, slot) {
    const parent = slot.closest('.block');
    
    // 1. 基本チェック
    if (group.includes(parent)) return { ok: false, reason: "自分自身の中に配置不可" };
    if (slot.children.length > 0) return { ok: false, reason: "スロットは既に使用中" };
    if (group.some(b => b.contains(slot))) return { ok: false, reason: "親要素を子スロットに配置不可" };

    // 2. 時間関数の第1引数制限
    if (parent.dataset.type === 'time_func') {
        const slots = Array.from(parent.querySelectorAll(':scope > .slot'));
        const slotIndex = slots.indexOf(slot);
        const funcName = parent.dataset.func || parent.dataset.value;
        // timer以外の場合、第1引数は型制限あり
        if (slotIndex === 0 && funcName !== 'timer') {
            const allowedTypes = ['number', 'Telemetry']; 
            if (!group.every(b => allowedTypes.includes(b.dataset.type))) {
                return { ok: false, reason: "第1引数はTelemetryか数値のみ可能です" };
            }
        }
    }

    // 3. 数値専用スロット制限
    if (slot.dataset.accept === 'number') {
        const isAllNumber = group.every(b => b.dataset.type === 'number');
        if (!isAllNumber) {
            return { ok: false, reason: "ここは数値ブロックのみ配置可能です" };
        }
    }

    return { ok: true, reason: "" };
}

// ================================
// スロットへのドロップ実行
// ================================
export function handleSlotDrop(e, slot) {
    if (!State.dragInfo) return;
    e.stopPropagation(); // Workspaceへのドロップを阻止

    const group = State.dragInfo.group;
    const validation = validateSlotDrop(group, slot);

    // ツールチップ消去
    if (State.globalTooltip) State.globalTooltip.style.display = 'none';
    slot.classList.remove('slot-hover-valid', 'slot-hover-invalid');

    if (!validation.ok) {
        console.warn(`拒否: ${validation.reason}`);
        bounceBlockBelow(group, slot);
        State.dragInfo = null; // ドラッグ終了
        return;
    }

    // 埋め込み処理
    const parent = slot.closest('.block');
    removeGroupBox(group);
    
    group.sort((a, b) => a.offsetLeft - b.offsetLeft).forEach(b => {
        slot.appendChild(b); 
        b.style.position = "static"; 
        b.style.width = "auto";
        // グローバル配列からの除外
        State.blocks = State.blocks.filter(x => x !== b);
        State.blockGroups.delete(b);
        b.classList.remove('dragging');
    });

    updateParentGroupsRecursive(parent);
    State.dragInfo = null;
}

function bounceBlockBelow(group, slot) {
    const slotRect = slot.getBoundingClientRect();
    const fieldRect = DOM.field.getBoundingClientRect();

    let currentX = slotRect.left - fieldRect.left + DOM.field.scrollLeft;
    const targetY = slotRect.bottom - fieldRect.top + DOM.field.scrollTop + 15;

    removeGroupBox(group);

    group.sort((a, b) => a.offsetLeft - b.offsetLeft).forEach(b => {
        if (b.parentNode !== DOM.field) DOM.field.appendChild(b);
        b.style.position = "absolute";
        b.style.left = `${currentX}px`;
        b.style.top = `${targetY}px`;
        b.style.zIndex = 1000;

        if (!State.blocks.includes(b)) {
            State.blocks.push(b);
        }
        b.classList.remove('dragging');
        currentX += b.offsetWidth + 5;
    });

    if (group.length > 1) {
        group.forEach(b => State.blockGroups.set(b, group));
        drawGroupBox(group);
    } else if (group.length > 0) {
        State.blockGroups.set(group[0], [group[0]]);
    }
}

// ================================
// ブロック接続・衝突
// ================================

export function checkCollisionAndConnect(block) {
    if (block.parentElement && block.parentElement.classList.contains('slot')) return;
    
    State.blocks.forEach(other => {
        if (other === block || other.parentElement.classList.contains('slot')) return;
        const rect1 = block.getBoundingClientRect();
        const rect2 = other.getBoundingClientRect();
        const isOverlap = !(rect1.right < rect2.left - 2 || rect1.left > rect2.right + 2 || rect1.bottom < rect2.top - 2 || rect1.top > rect2.bottom + 2);
        if (isOverlap) connectBlocks(block, other);
    });
}

function connectBlocks(block1, block2) {
    // 記号合体（>= など）の判定
    const combined = tryCombineSingleBlocks(block1, block2);
    if (combined) { 
        State.blockGroups.set(combined, [combined]); 
        return; 
    }

    // 通常の横連結
    let group1 = State.blockGroups.get(block1) || [block1];
    let group2 = State.blockGroups.get(block2) || [block2];
    if (group1 === group2) return;

    removeGroupBox(group1); 
    removeGroupBox(group2);
    let combinedArray = Array.from(new Set([...group1, ...group2])).sort((a, b) => a.offsetLeft - b.offsetLeft);
    combinedArray.forEach(b => State.blockGroups.set(b, combinedArray));
    drawGroupBox(combinedArray);
}

function tryCombineSingleBlocks(block1, block2) {
    const validTypes = ['condition', 'operator', 'bit_operator', 'compare', 'calc', 'logic'];
    
    // 型チェック
    if (!validTypes.includes(block1.dataset.type) || !validTypes.includes(block2.dataset.type)) {
        return null;
    }

    const first = block1.textContent.trim();
    const second = block2.textContent.trim();

    let combinedOp = null;
    let newType = null;
    let config = null;

    // 順序1: block1 + block2
    if (combinableOps[first] && combinableOps[first].next && combinableOps[first].next.includes(second)) {
        combinedOp = first + second;
        config = combinableOps[first];
    } 
    // 順序2: block2 + block1
    else if (combinableOps[second] && combinableOps[second].next && combinableOps[second].next.includes(first)) {
        combinedOp = second + first;
        config = combinableOps[second];
    }

    if (!combinedOp || !config) return null;

    if (config.overrides && config.overrides[combinedOp]) {
        newType = config.overrides[combinedOp];
    } else {
        newType = config.type;
    }

    // ブロックの更新
    block1.textContent = combinedOp;
    block1.dataset.op = combinedOp;
    block1.dataset.value = combinedOp;
    
    if (newType) {
        block1.dataset.type = newType;
    }

    // block2の削除
    if (block2.parentNode) block2.parentNode.removeChild(block2);
    State.blocks = State.blocks.filter(b => b !== block2);

    return block1;
}