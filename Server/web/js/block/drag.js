import { State, DOM } from './state.js';
import { FRAME_INTERVAL } from './config.js';
import { handleDrop } from './drop.js';
import { updateAllGroupBoxes } from './block.js'; // 修正: ここから openTelemetryConfigForm, openLoadcomponentForm を削除
import { openTelemetryConfigForm as openTelemetry, openLoadcomponentForm as openComponent } from './ui_dialogs.js';
import { updateGroupBox } from './block.js'; // 必要であれば追加、あるいは updateAllGroupBoxes に含まれるなら不要

export function startDrag(e, block) {
    if (State.dragInfo) return;

    // ルートブロック特定
    let rootBlock = block;
    let current = block;
    while (current && current !== DOM.field) {
        if (current.classList.contains('block')) {
            rootBlock = current;
        }
        current = current.parentElement;
    }
    block = rootBlock;

    e.stopPropagation();
    e.preventDefault();

    const group = State.blockGroups.get(block) || [block];
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
    const boxEl = State.groupBoxes.get(group);
    if (boxEl) {
        activeBoxData = {
            el: boxEl,
            offsetX: e.clientX - boxEl.offsetLeft,
            offsetY: e.clientY - boxEl.offsetTop
        };
        boxEl.style.pointerEvents = 'none'; 
    }

    State.dragInfo = { group, offsets, activeBoxData, targetGroup: null, insertIndex: null };

    createInsertIndicator();

    // 座標キャッシュ作成
    State.cachedSlotData = Array.from(document.querySelectorAll('.slot')).map(slot => ({
        el: slot,
        rect: slot.getBoundingClientRect()
    }));
    State.cachedFieldRect = DOM.field.getBoundingClientRect();

    State.cachedGroupData = [];
    const seenGroups = new Set();
    const draggingBlockSet = new Set(group);

    State.blockGroups.forEach((g) => {
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

        State.cachedGroupData.push({
            group: g,
            top: gTop,
            bottom: gBottom,
            targets: insertPoints
        });
    });

    State.lastActiveSlot = null;
    State.lastIndicatorState = { show: false, left: -1, top: -1, height: -1 };
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active-slot'));

    State.dragX = e.clientX;
    State.dragY = e.clientY;
    State.isDragging = true;
    State.lastFrameTime = performance.now();

    document.addEventListener("mousemove", onMouseMove, { passive: false });
    document.addEventListener("mouseup", onMouseUp);

    State.dragLoopId = requestAnimationFrame(updateDragLoop);
}

function onMouseMove(ev) {
    if (!State.isDragging) return;
    ev.preventDefault();
    State.dragX = ev.clientX;
    State.dragY = ev.clientY;
}

export function updateDragLoop(timestamp) {
    if (!State.isDragging || !State.dragInfo) return;

    State.dragLoopId = requestAnimationFrame(updateDragLoop);

    const elapsed = timestamp - State.lastFrameTime;
    if (elapsed < FRAME_INTERVAL) return;
    State.lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

    // 移動
    State.dragInfo.offsets.forEach(info => {
        info.block.style.left = `${State.dragX - info.offsetX}px`;
        info.block.style.top  = `${State.dragY - info.offsetY}px`;
    });

    if (State.dragInfo.activeBoxData) {
        const bd = State.dragInfo.activeBoxData;
        bd.el.style.left = `${State.dragX - bd.offsetX}px`;
        bd.el.style.top  = `${State.dragY - bd.offsetY}px`;
    }
    
    // インジケータ計算
    updateInsertIndicator(State.dragX, State.dragY, State.dragInfo.group);
}

function onMouseUp(ev) {
    State.isDragging = false;

    if (State.dragLoopId) {
        cancelAnimationFrame(State.dragLoopId);
        State.dragLoopId = null;
    }

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    if (!State.dragInfo) return;
    const currentGroup = State.dragInfo.group;

    if (State.dragInfo.activeBoxData) {
        State.dragInfo.activeBoxData.el.style.pointerEvents = ''; 
    }

    // クリーンアップ
    State.cachedSlotData = [];
    State.cachedGroupData = [];
    State.cachedFieldRect = null;
    
    if (State.lastActiveSlot) {
        State.lastActiveSlot.classList.remove('active-slot');
        State.lastActiveSlot = null;
    }
    
    currentGroup.forEach(b => b.classList.remove("dragging"));

    // Drop処理呼び出し
    handleDrop(ev, currentGroup);

    if (typeof updateAllGroupBoxes === 'function') updateAllGroupBoxes();

    // Telemetry設定が必要なら開く
    if (currentGroup[0].dataset.type === 'Telemetry' && currentGroup[0].dataset.configured === 'false') {
        openTelemetry(currentGroup[0]);
    }

    if (currentGroup[0].dataset.type === 'component' && currentGroup[0].dataset.configured === 'false') {
        openComponent(currentGroup[0]);
    }

    hideInsertIndicator();
    State.dragInfo = null;
}

// ================================
// インジケータ (DOM操作)
// ================================
function createInsertIndicator(){
    if(!State.insertIndicator){
        State.insertIndicator = document.createElement('div');
        State.insertIndicator.className = 'insert-indicator';
        State.insertIndicator.style.cssText = 'position:absolute; background:red; pointer-events:none; z-index:1001; width:4px; display:none;';
        DOM.field.appendChild(State.insertIndicator);
    }
}

export function hideInsertIndicator(){ 
    if(State.insertIndicator) {
        State.insertIndicator.style.display = 'none'; 
        State.lastIndicatorState.show = false;
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
    if (!State.dragInfo) return;
    
    // 1. スロットへの埋め込み判定
    let newActiveSlot = null;
    for (const data of State.cachedSlotData) {
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

    if (newActiveSlot !== State.lastActiveSlot) {
        if (State.lastActiveSlot) State.lastActiveSlot.classList.remove('active-slot');
        if (newActiveSlot) newActiveSlot.classList.add('active-slot');
        State.lastActiveSlot = newActiveSlot;
    }

    if (newActiveSlot) {
        if (State.lastIndicatorState.show) {
            State.insertIndicator.style.display = 'none';
            State.lastIndicatorState.show = false;
        }
        return;
    }

    // 2. グループ間の挿入判定
    if (!State.cachedFieldRect) return;
    
    const relX = x - State.cachedFieldRect.left;
    const relY = y - State.cachedFieldRect.top;
    
    let closestData = null;
    let closestIndex = null;
    let minDist = 50;
    
    for (const gData of State.cachedGroupData) {
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

        if (!State.lastIndicatorState.show || 
            State.lastIndicatorState.left !== left || 
            State.lastIndicatorState.top !== top || 
            State.lastIndicatorState.height !== height) {
            
            State.insertIndicator.style.cssText = `position:absolute; background:red; pointer-events:none; z-index:1001; width:4px; display:block; left:${left}px; top:${top}px; height:${height}px;`;
            State.lastIndicatorState.show = true;
            State.lastIndicatorState.left = left;
            State.lastIndicatorState.top = top;
            State.lastIndicatorState.height = height;
        }

        State.dragInfo.targetGroup = closestData.group;
        State.dragInfo.insertIndex = closestIndex;
    } else {
        if (State.lastIndicatorState.show) {
            State.insertIndicator.style.display = 'none';
            State.lastIndicatorState.show = false;
        }
        State.dragInfo.targetGroup = null;
    }
}