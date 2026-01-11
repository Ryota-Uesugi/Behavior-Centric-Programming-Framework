/* ================= ドラッグ＆操作インタラクション ================= */

let insertIndicator = null;
let isDragging = false;
let dragX = 0;
let dragY = 0;

// キャッシュ
let cachedSlotData = [];
let cachedGroupData = [];
let cachedFieldRect = null;
let dragLoopId = null;

// Diffing用
let lastActiveSlot = null; 
let lastIndicatorState = { show: false, left: -1, top: -1, height: -1 };

// FPS
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS; 
let lastFrameTime = 0;

function startDrag(e, block) {
    if (dragInfo) return;

    // ルートブロック特定
    let rootBlock = block;
    let current = block;
    while (current && current !== field) {
        if (current.classList.contains('block')) {
            rootBlock = current;
        }
        current = current.parentElement;
    }
    block = rootBlock;

    e.stopPropagation();
    e.preventDefault();

    const group = blockGroups.get(block) || [block];
    group.forEach(b => {
        b.origLeft = b.offsetLeft;
        b.origTop  = b.offsetTop;
        b.classList.add("dragging");
    });
    
    const offsets = group.map(b => ({
        block: b,
        offsetX: e.clientX - b.offsetLeft,
        offsetY: e.clientY - b.offsetTop
    }));

    // グループボックス制御
    let activeBoxData = null;
    const boxEl = groupBoxes.get(group);
    if (boxEl) {
        activeBoxData = {
            el: boxEl,
            offsetX: e.clientX - boxEl.offsetLeft,
            offsetY: e.clientY - boxEl.offsetTop
        };
        boxEl.style.pointerEvents = 'none'; 
    }

    dragInfo = { group, offsets, activeBoxData, targetGroup: null, insertIndex: null };

    createInsertIndicator();

    // 座標キャッシュ作成
    cachedSlotData = Array.from(document.querySelectorAll('.slot')).map(slot => ({
        el: slot,
        rect: slot.getBoundingClientRect()
    }));
    cachedFieldRect = field.getBoundingClientRect();

    cachedGroupData = [];
    const seenGroups = new Set();
    const draggingBlockSet = new Set(group);

    blockGroups.forEach((g) => {
        if (seenGroups.has(g) || g.some(b => draggingBlockSet.has(b))) return;
        seenGroups.add(g);
        // 関数単体の場合は挿入ターゲットにしない
        if (g.length === 1 && (g[0].dataset.type === 'calc_func' || g[0].dataset.type === 'time_func')) return;

        const tops = g.map(b => b.offsetTop);
        const bottoms = g.map(b => b.offsetTop + b.offsetHeight);
        const gTop = Math.min(...tops);
        const gBottom = Math.max(...bottoms);
        const sorted = g.slice().sort((a, b) => a.offsetLeft - b.offsetLeft);
        const insertPoints = [];
        if (sorted.length > 0) insertPoints.push(sorted[0].offsetLeft);
        sorted.forEach(b => {
            insertPoints.push(b.offsetLeft + b.offsetWidth);
        });

        cachedGroupData.push({
            group: g,
            top: gTop,
            bottom: gBottom,
            targets: insertPoints
        });
    });

    lastActiveSlot = null;
    lastIndicatorState = { show: false, left: -1, top: -1, height: -1 };
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active-slot'));

    dragX = e.clientX;
    dragY = e.clientY;
    isDragging = true;
    lastFrameTime = performance.now();

    document.addEventListener("mousemove", onMouseMove, { passive: false });
    document.addEventListener("mouseup", onMouseUp);

    dragLoopId = requestAnimationFrame(updateDragLoop);
}

function onMouseMove(ev) {
    if (!isDragging) return;
    ev.preventDefault();
    dragX = ev.clientX;
    dragY = ev.clientY;
}

function updateDragLoop(timestamp) {
    if (!isDragging || !dragInfo) return;

    dragLoopId = requestAnimationFrame(updateDragLoop);

    const elapsed = timestamp - lastFrameTime;
    if (elapsed < FRAME_INTERVAL) return;
    lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

    // 移動
    dragInfo.offsets.forEach(info => {
        info.block.style.left = `${dragX - info.offsetX}px`;
        info.block.style.top  = `${dragY - info.offsetY}px`;
    });

    if (dragInfo.activeBoxData) {
        const bd = dragInfo.activeBoxData;
        bd.el.style.left = `${dragX - bd.offsetX}px`;
        bd.el.style.top  = `${dragY - bd.offsetY}px`;
    }
    
    // インジケータ計算
    updateInsertIndicator(dragX, dragY, dragInfo.group);
}

function onMouseUp(ev) {
    isDragging = false;

    if (dragLoopId) {
        cancelAnimationFrame(dragLoopId);
        dragLoopId = null;
    }

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    if (!dragInfo) return;
    const currentGroup = dragInfo.group;

    if (dragInfo.activeBoxData) {
        dragInfo.activeBoxData.el.style.pointerEvents = ''; 
    }

    // クリーンアップ
    cachedSlotData = [];
    cachedGroupData = [];
    cachedFieldRect = null;
    
    if (lastActiveSlot) {
        lastActiveSlot.classList.remove('active-slot');
        lastActiveSlot = null;
    }
    
    currentGroup.forEach(b => b.classList.remove("dragging"));

    // ★ ここで drop.js の handleDrop を呼ぶ
    handleDrop(ev, currentGroup);

    if (typeof updateAllGroupBoxes === 'function') updateAllGroupBoxes();

    // MAVLink設定が必要なら開く
    if (currentGroup[0].dataset.type === 'mavlink' && currentGroup[0].dataset.configured === 'false') {
        if(typeof openMavlinkConfigForm === 'function') openMavlinkConfigForm(currentGroup[0]);
    }

    if (currentGroup[0].dataset.type === 'setting' && currentGroup[0].dataset.configured === 'false') {
        if(typeof openLoadSettingForm === 'function') openLoadSettingForm(currentGroup[0]);
    }

    hideInsertIndicator();
    dragInfo = null;
}

// ================================
// インジケータ (DOM操作)
// ================================
function createInsertIndicator(){
    if(!insertIndicator){
        insertIndicator = document.createElement('div');
        insertIndicator.className = 'insert-indicator';
        insertIndicator.style.cssText = 'position:absolute; background:red; pointer-events:none; z-index:1001; width:4px; display:none;';
        field.appendChild(insertIndicator);
    }
}

function hideInsertIndicator(){ 
    if(insertIndicator) {
        insertIndicator.style.display = 'none'; 
        lastIndicatorState.show = false;
    }
}

function hasTimeFuncDeep(el) { 
    return el.classList.contains('time-func-block') || !!el.querySelector('.time-func-block'); 
}

function isInsideTimeFunc(el) { 
    let p = el.parentElement; 
    while (p && p !== document.body) { 
        if (p.classList?.contains('time-func-block')) return true; 
        p = p.parentElement; 
    } 
    return false; 
}

function updateInsertIndicator(x, y, draggedGroup) {
    if (!dragInfo) return;
    
    // 1. スロットへの埋め込み判定
    let newActiveSlot = null;
    for (const data of cachedSlotData) {
        const slot = data.el;
        const rect = data.rect;

        if (draggedGroup.some(b => b.contains(slot))) continue;

        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            const parent = slot.closest('.block');
            if (!parent || draggedGroup.includes(parent)) continue;
            
            if (slot.children.length === 0) {
                const movingHasTime = draggedGroup.some(b => hasTimeFuncDeep(b));
                if (movingHasTime && (parent.classList.contains('time-func-block') || isInsideTimeFunc(parent))) continue;
                
                newActiveSlot = slot;
                break;
            }
        }
    }

    if (newActiveSlot !== lastActiveSlot) {
        if (lastActiveSlot) lastActiveSlot.classList.remove('active-slot');
        if (newActiveSlot) newActiveSlot.classList.add('active-slot');
        lastActiveSlot = newActiveSlot;
    }

    if (newActiveSlot) {
        if (lastIndicatorState.show) {
            insertIndicator.style.display = 'none';
            lastIndicatorState.show = false;
        }
        return;
    }

    // 2. グループ間の挿入判定
    if (!cachedFieldRect) return;
    
    const relX = x - cachedFieldRect.left;
    const relY = y - cachedFieldRect.top;
    
    let closestData = null;
    let closestIndex = null;
    let minDist = 50;
    
    for (const gData of cachedGroupData) {
        if(relY < gData.top - 50 || relY > gData.bottom + 50) continue;

        const targets = gData.targets;
        for (let i = 0; i < targets.length; i++) {
            const dist = Math.abs(relX - targets[i]);
            if (dist < minDist) {
                minDist = dist;
                closestData = gData;
                closestIndex = i;
            }
        }
    }

    if (closestData) {
        const left = closestData.targets[closestIndex];
        const top = closestData.top;
        const height = closestData.bottom - closestData.top;

        if (!lastIndicatorState.show || 
            lastIndicatorState.left !== left || 
            lastIndicatorState.top !== top || 
            lastIndicatorState.height !== height) {
            
            insertIndicator.style.cssText = `position:absolute; background:red; pointer-events:none; z-index:1001; width:4px; display:block; left:${left}px; top:${top}px; height:${height}px;`;
            lastIndicatorState.show = true;
            lastIndicatorState.left = left;
            lastIndicatorState.top = top;
            lastIndicatorState.height = height;
        }

        dragInfo.targetGroup = closestData.group;
        dragInfo.insertIndex = closestIndex;
    } else {
        if (lastIndicatorState.show) {
            insertIndicator.style.display = 'none';
            lastIndicatorState.show = false;
        }
        dragInfo.targetGroup = null;
    }
}