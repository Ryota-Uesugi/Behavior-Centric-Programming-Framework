/* ================= ドロップ・結合・スロットロジック ================= */

const trash = document.getElementById('trash');
const expressionArea = document.getElementById('expression-area');
const storageArea = document.getElementById('storage-area');

// ================================
// ドロップ終了時の分岐 (Drag.jsから呼ばれる)
// ================================
function handleDrop(ev, group) {
    const { clientX: x, clientY: y } = ev;
    const tRect = trash.getBoundingClientRect();
    const eRect = expressionArea.getBoundingClientRect();
    const sRect = storageArea.getBoundingClientRect();
    

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
        dropToStorageArea(group);
        return;
    }

    // 4. グループ間の挿入 (dragInfoはglobal)
    if (dragInfo && dragInfo.targetGroup && dragInfo.insertIndex != null) {
        dropToGroupInsert(group, dragInfo.targetGroup, dragInfo.insertIndex);
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
    updateExpressionArea(group);
    group.forEach(b => {
        b.style.left = `${b.origLeft}px`;
        b.style.top = `${b.origTop}px`;
    });
    updateAllGroupBoxes();
}

function dropToStorageArea(group) {
    group.forEach(b => {
        b.style.left = `${b.origLeft}px`;
        b.style.top = `${b.origTop}px`;
    });
    updateStorageArea(group);
}

function dropToGroupInsert(group, targetGroup, index) {
    removeGroupBox(targetGroup);
    removeGroupBox(group);
    targetGroup.splice(index, 0, ...group);
    targetGroup.forEach(b => blockGroups.set(b, targetGroup));
    drawGroupBox(targetGroup);
}

function dropToWorkspace(group) {
    group.forEach(b => {
        if (!b.parentNode) field.appendChild(b);
        if (typeof blocks !== 'undefined' && !blocks.includes(b)) {
            blocks.push(b);
        }
        checkCollisionAndConnect(b);
    });
}

// ================================
// スロットバリデーション (block.jsのhoverと共有)
// ================================

function validateSlotDrop(group, slot) {
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
            const allowedTypes = ['number', 'mavlink']; 
            if (!group.every(b => allowedTypes.includes(b.dataset.type))) {
                return { ok: false, reason: "第1引数はMavlinkか数値のみ可能です" };
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
function handleSlotDrop(e, slot) {
    if (!dragInfo) return;
    e.stopPropagation(); // Workspaceへのドロップを阻止

    const group = dragInfo.group;
    const validation = validateSlotDrop(group, slot);

    // ツールチップ消去
    if (typeof globalTooltip !== 'undefined') globalTooltip.style.display = 'none';
    slot.classList.remove('slot-hover-valid', 'slot-hover-invalid');

    if (!validation.ok) {
        console.warn(`拒否: ${validation.reason}`);
        bounceBlockBelow(group, slot);
        dragInfo = null; // ドラッグ終了
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
        if(typeof blocks !== 'undefined') blocks = blocks.filter(x => x !== b);
        blockGroups.delete(b);
        b.classList.remove('dragging');
    });

    updateParentGroupsRecursive(parent);
    dragInfo = null;
}

function bounceBlockBelow(group, slot) {
    const slotRect = slot.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();

    let currentX = slotRect.left - fieldRect.left + field.scrollLeft;
    const targetY = slotRect.bottom - fieldRect.top + field.scrollTop + 15;

    removeGroupBox(group);

    group.sort((a, b) => a.offsetLeft - b.offsetLeft).forEach(b => {
        if (b.parentNode !== field) field.appendChild(b);
        b.style.position = "absolute";
        b.style.left = `${currentX}px`;
        b.style.top = `${targetY}px`;
        b.style.zIndex = 1000;

        if (typeof blocks !== 'undefined' && !blocks.includes(b)) {
            blocks.push(b);
        }
        b.classList.remove('dragging');
        currentX += b.offsetWidth + 5;
    });

    if (group.length > 1) {
        group.forEach(b => blockGroups.set(b, group));
        drawGroupBox(group);
    } else if (group.length > 0) {
        blockGroups.set(group[0], [group[0]]);
    }
}

// ================================
// ブロック接続・衝突
// ================================

const combinableOps = { 
    '>': ['=', '>'], '<': ['=', '<'], '=': ['='], '*': ['*'] 
};

function checkCollisionAndConnect(block) {
    if (block.parentElement && block.parentElement.classList.contains('slot')) return;
    const allBlocks = typeof blocks !== 'undefined' ? blocks : Array.from(document.querySelectorAll('#field > .block'));
    
    allBlocks.forEach(other => {
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
        blockGroups.set(combined, [combined]); 
        return; 
    }

    // 通常の横連結
    let group1 = blockGroups.get(block1) || [block1];
    let group2 = blockGroups.get(block2) || [block2];
    if (group1 === group2) return;

    removeGroupBox(group1); 
    removeGroupBox(group2);
    let combinedArray = Array.from(new Set([...group1, ...group2])).sort((a, b) => a.offsetLeft - b.offsetLeft);
    combinedArray.forEach(b => blockGroups.set(b, combinedArray));
    drawGroupBox(combinedArray);
}

function tryCombineSingleBlocks(block1, block2) {
    const validTypes = ['condition', 'operator', 'bit_operator'];
    if (!validTypes.includes(block1.dataset.type) || !validTypes.includes(block2.dataset.type)) {
        return null;
    }

    const first = block1.textContent.trim();
    const second = block2.textContent.trim();

    let combinedOp = null;
    if (combinableOps[first] && combinableOps[first].includes(second)) {
        combinedOp = first + second;
    } else if (combinableOps[second] && combinableOps[second].includes(first)) {
        combinedOp = second + first;
    }

    if (!combinedOp) return null;

    block1.textContent = combinedOp;
    block1.dataset.op = combinedOp;
    block1.dataset.value = combinedOp;
    
    if (['==', '!=', '>=', '<='].includes(combinedOp)) block1.dataset.type = 'condition';
    else if (combinedOp === '**') block1.dataset.type = 'operator';
    else if (['<<', '>>'].includes(combinedOp)) block1.dataset.type = 'bit_operator';

    if (block2.parentNode) block2.parentNode.removeChild(block2);
    if (typeof blocks !== 'undefined') blocks = blocks.filter(b => b !== block2);

    return block1;
}

// ================================
// 右クリック: 取り出し/グループ解除
// ================================
field.addEventListener("contextmenu", e => {
    e.preventDefault();
    const clickedBlock = e.target.closest('.block');
    if (!clickedBlock) return;

    const parentSlot = clickedBlock.parentElement.closest('.slot');
    if (parentSlot) {
        extractSpecificSlot(parentSlot);
        return;
    }

    const group = blockGroups.get(clickedBlock);
    if (group && group.length > 1) {
        removeGroupBox(group);
        const centerX = clickedBlock.offsetLeft + clickedBlock.offsetWidth / 2;
        const leftG = group.filter(b => b !== clickedBlock && (b.offsetLeft + b.offsetWidth/2) < centerX);
        const rightG = group.filter(b => b !== clickedBlock && (b.offsetLeft + b.offsetWidth/2) >= centerX);
        [leftG, rightG].forEach(g => {
            if (g.length > 0) {
                g.forEach(b => blockGroups.set(b, g.length > 1 ? g : [b]));
                if (g.length > 1) drawGroupBox(g);
            }
        });
        blockGroups.set(clickedBlock, [clickedBlock]);
        drawGroupBox([clickedBlock]);
    }
});

function extractSpecificSlot(slot) {
    if (!slot || slot.children.length === 0) return;
    const slotRect = slot.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const children = Array.from(slot.children).filter(el => el.classList.contains('block'));
    
    let currentX = slotRect.left - fieldRect.left;
    const targetY = slotRect.bottom - fieldRect.top + 15;

    children.forEach(b => {
        field.appendChild(b);
        b.style.position = "absolute";
        b.style.left = `${currentX}px`;
        b.style.top = `${targetY}px`;
        b.style.zIndex = 1000;
        if (!blocks.includes(b)) blocks.push(b);
        currentX += b.offsetWidth + 5;
    });

    if (children.length > 1) {
        children.forEach(b => blockGroups.set(b, children));
        drawGroupBox(children);
    } else if (children.length === 1) {
        blockGroups.set(children[0], [children[0]]);
    }

    const rootBlock = slot.closest('.block');
    if (rootBlock && blockGroups.get(rootBlock)) {
        updateGroupBox(blockGroups.get(rootBlock));
    }
    if (typeof hideInsertIndicator === 'function') hideInsertIndicator();
}