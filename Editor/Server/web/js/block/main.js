import { DOM, State } from './state.js';
import { removeBlock, duplicateBlock, clearAllBlocks, drawGroupBox, updateAllGroupBoxes, updateGroupBox, removeGroupBox } from './block.js';
// 修正: 不要なインポート (extractSpecificSlot) を削除
import { BlockEditorApp } from './modal.js';
import { fetchSavedcomponents, deleteSavedComponent } from './api.js';
import { COMPONENT_CONFIG, SEND_CONFIG } from './config.js';
import { hideInsertIndicator } from './drag.js';
import './drawer.js'; // Import to run drawer initialization

/* ================= イベントハンドラ (Keydown) ================= */

window.addEventListener('keydown', e => {
    // --- ドラッグ中の操作 ---
    if (State.dragInfo) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const groupToDelete = [...State.dragInfo.group];
            State.dragInfo = null;
            
            groupToDelete.forEach(removeBlock);
            hideInsertIndicator();
            return;
        }

        if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            const oldGroup = State.dragInfo.group;
            
            oldGroup.forEach(b => b.classList.remove("dragging"));

            const offsetDist = 5;
            const newGroup = oldGroup.map(ob => {
                const nx = ob.offsetLeft + offsetDist;
                const ny = ob.offsetTop + offsetDist;
                return duplicateBlock(ob, nx, ny);
            });
            
            newGroup.forEach(nb => nb.classList.add("dragging"));
            
            State.dragInfo.group = newGroup;
            State.dragInfo.offsets = newGroup.map(nb => ({
                block: nb,
                offsetX: State.lastMousePos.x - nb.offsetLeft,
                offsetY: State.lastMousePos.y - nb.offsetTop
            }));
            
            if (State.dragInfo.activeBoxData && State.dragInfo.activeBoxData.el) {
                State.dragInfo.activeBoxData.el.style.pointerEvents = '';
            }

            if (newGroup.length > 1) {
                newGroup.forEach(nb => State.blockGroups.set(nb, newGroup));
                drawGroupBox(newGroup);

                const newBox = State.groupBoxes.get(newGroup);
                if (newBox) {
                    newBox.style.pointerEvents = 'none';
                    State.dragInfo.activeBoxData = {
                        el: newBox,
                        offsetX: State.lastMousePos.x - newBox.offsetLeft,
                        offsetY: State.lastMousePos.y - newBox.offsetTop
                    };
                }
            } else {
                State.dragInfo.activeBoxData = null;
            }

            updateAllGroupBoxes();
        }
    } 
    // --- ドラッグしていない時の操作 ---
    else {
        // 全消去 (Shift + Delete)
        if (e.key === 'Delete' && e.shiftKey) {
            e.preventDefault();
            clearAllBlocks();
        }

        // ★追加: 視点リセット (Homeキー)
        if (e.key === 'Home') {
            e.preventDefault();
            resetFieldPosition();
        }
    }
});

/**
 * 視点移動をリセットして初期位置(0,0)に戻す関数
 */
function resetFieldPosition() {
    // すでに初期位置なら何もしない
    if (State.fieldBgX === 0 && State.fieldBgY === 0) return;

    // 現在のズレ分を逆算して戻す量
    const reverseX = -State.fieldBgX;
    const reverseY = -State.fieldBgY;

    // 1. 背景変数のリセット
    State.fieldBgX = 0;
    State.fieldBgY = 0;
    DOM.field.style.backgroundPosition = '0px 0px';

    // 2. 全ブロックの位置を戻す
    State.blocks.forEach(block => {
        const currentLeft = parseFloat(block.style.left) || 0;
        const currentTop = parseFloat(block.style.top) || 0;
        block.style.left = `${currentLeft + reverseX}px`;
        block.style.top = `${currentTop + reverseY}px`;
    });

    // 3. グループ枠の位置を戻す
    State.groupBoxes.forEach(boxEl => {
        const currentLeft = parseFloat(boxEl.style.left) || 0;
        const currentTop = parseFloat(boxEl.style.top) || 0;
        boxEl.style.left = `${currentLeft + reverseX}px`;
        boxEl.style.top = `${currentTop + reverseY}px`;
    });
}

/* ================= FIELD PANNING (視点移動機能) ================= */

// マウスホイール(中央ボタン)押下でパン開始
DOM.field.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // 1 = Middle Mouse Button
        e.preventDefault();  
        e.stopPropagation(); 
        State.isPanning = true;
        DOM.field.style.cursor = 'grabbing';
    }
});

// 移動処理
window.addEventListener('mousemove', (e) => {
    if (!State.isPanning) return;
    
    e.preventDefault();
    
    // マウスの移動量 (Delta)
    const dx = e.movementX;
    const dy = e.movementY;

    // 1. 背景の移動 (background-positionを更新)
    State.fieldBgX += dx;
    State.fieldBgY += dy;
    DOM.field.style.backgroundPosition = `${State.fieldBgX}px ${State.fieldBgY}px`;

    // 2. ブロックの移動
    State.blocks.forEach(block => {
        const currentLeft = parseFloat(block.style.left) || 0;
        const currentTop = parseFloat(block.style.top) || 0;
        
        block.style.left = `${currentLeft + dx}px`;
        block.style.top = `${currentTop + dy}px`;
    });

    // 3. グループボックス(枠線)の移動
    State.groupBoxes.forEach(boxEl => {
        const currentLeft = parseFloat(boxEl.style.left) || 0;
        const currentTop = parseFloat(boxEl.style.top) || 0;
        
        boxEl.style.left = `${currentLeft + dx}px`;
        boxEl.style.top = `${currentTop + dy}px`;
    });
});

// マウスボタンを離したらパン終了
window.addEventListener('mouseup', (e) => {
    if (e.button === 1) { // Middle Mouse Button
        State.isPanning = false;
        DOM.field.style.cursor = ''; 
    }
});

/* ================= 右クリック: 取り出し/グループ解除 ================= */
DOM.field.addEventListener("contextmenu", e => {
    e.preventDefault();
    const clickedBlock = e.target.closest('.block');
    if (!clickedBlock) return;

    const parentSlot = clickedBlock.parentElement.closest('.slot');
    if (parentSlot) {
        _extractSpecificSlot(parentSlot);
        return;
    }

    const group = State.blockGroups.get(clickedBlock);
    if (group && group.length > 1) {
        removeGroupBox(group);
        const centerX = clickedBlock.offsetLeft + clickedBlock.offsetWidth / 2;
        const leftG = group.filter(b => b !== clickedBlock && (b.offsetLeft + b.offsetWidth/2) < centerX);
        const rightG = group.filter(b => b !== clickedBlock && (b.offsetLeft + b.offsetWidth/2) >= centerX);
        [leftG, rightG].forEach(g => {
            if (g.length > 0) {
                g.forEach(b => State.blockGroups.set(b, g.length > 1 ? g : [b]));
                if (g.length > 1) drawGroupBox(g);
            }
        });
        State.blockGroups.set(clickedBlock, [clickedBlock]);
        drawGroupBox([clickedBlock]);
    }
});

function _extractSpecificSlot(slot) {
    if (!slot || slot.children.length === 0) return;
    const slotRect = slot.getBoundingClientRect();
    const fieldRect = DOM.field.getBoundingClientRect();
    const children = Array.from(slot.children).filter(el => el.classList.contains('block'));
    
    let currentX = slotRect.left - fieldRect.left;
    const targetY = slotRect.bottom - fieldRect.top + 15;

    children.forEach(b => {
        DOM.field.appendChild(b);
        b.style.position = "absolute";
        b.style.left = `${currentX}px`;
        b.style.top = `${targetY}px`;
        b.style.zIndex = 1000;
        if (!State.blocks.includes(b)) State.blocks.push(b);
        currentX += b.offsetWidth + 5;
    });

    if (children.length > 1) {
        children.forEach(b => State.blockGroups.set(b, children));
        drawGroupBox(children);
    } else if (children.length === 1) {
        State.blockGroups.set(children[0], [children[0]]);
    }

    const rootBlock = slot.closest('.block');
    if (rootBlock && State.blockGroups.get(rootBlock)) {
        updateGroupBox(State.blockGroups.get(rootBlock));
    }
    hideInsertIndicator();
}


/* ================= クリック時の処理 (Expression / Component Areas) ================= */

function setupGenericClickEvent(elementId, onClickHandler) {
    const area = document.getElementById(elementId);
    if (area) {
        area.addEventListener('click', (e) => {
            if (onClickHandler) onClickHandler();
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    
    // Component Area
    setupGenericClickEvent('compoment-area', async function() {
        const mode = COMPONENT_CONFIG.mode; 
        let currentList = await fetchSavedcomponents(mode);

        const showModal = () => {
            BlockEditorApp.openListModal({
                ...COMPONENT_CONFIG,
                dataList: currentList,
                onDelete: async function(index) {
                    if (!confirm("本当に削除しますか？")) return;
                    const success = await deleteSavedComponent(mode, index);
                    if (success) {
                        currentList.splice(index, 1);
                        showModal();
                    }
                }
            });
        };
        showModal();
    });

    // Send Area
    setupGenericClickEvent('expression-area', async function() {
        const mode = SEND_CONFIG.mode;
        let currentList = await fetchSavedcomponents(mode);

        const showModal = () => {
            BlockEditorApp.openListModal({
                ...SEND_CONFIG,
                dataList: currentList,
                onDelete: async function(index) {
                    if (!confirm("本当に削除しますか？")) return;
                    const success = await deleteSavedComponent(mode, index);
                    if (success) {
                        currentList.splice(index, 1);
                        showModal();
                    }
                }
            });
        };
        showModal();
    });
});