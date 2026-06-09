/* ============================================================
   0. 定数・デフォルト設定
   ============================================================ */
const DEFAULT_DOM_SELECTORS = {
    expressionModalId: 'expression-modal',
    expressionTitleSelector: '.modal-title',
    expressionTextareaId: 'expression-textarea',
    expressionNameInputId: 'expression-name',
    expressionSendBtnSelector: '.btn-send',
    expressionWarningId: 'modal-warning',
    flowchartWrapperPlaceholderId: 'flowchart-wrapper-placeholder',
    listModalId: 'compoment-modal',
    listTitleSelector: '.modal-title',
    listContainerId: 'compoment-list-container',
    listItemRowClass: 'compoment-row',
    listItemTextClass: 'compoment-text-item',
    listItemDeleteBtnClass: 'compoment-delete-btn'
};

/* ============================================================
   1. BlockParser: 解析ロジック
   ============================================================ */
class BlockParser {
    static parseGroup(group) {
        this.mermaidNodeCounter = 0;
        const sorted = group.slice().sort((a, b) => a.offsetLeft - b.offsetLeft);
        
        let fullExprParts = [];
        let fullMermaidCode = 'flowchart TD\n';

        sorted.forEach(b => {
            const res = this.parseBlockData(b);
            if (res.expr) fullExprParts.push(res.expr);
            if (res.mermaid) fullMermaidCode += res.mermaid + '\n';
        });

        return {
            expression: fullExprParts.join(' ').trim(),
            mermaidCode: fullMermaidCode
        };
    }

    static parseBlockData(block) {
        const result = { expr: '', mermaid: '', id: null, label: '' };
        if (!block || !block.dataset) return result;
        
        result.id = `node_${this.mermaidNodeCounter++}`;
        const type = block.dataset.type;

        // --- シンプルな値 ---
        if (['number', 'string', 'bool'].includes(type)) {
            let val = '0';
            const input = block.querySelector('input');
            if (type === 'number') val = input?.value || '0';
            if (type === 'string') val = `'${input?.value || ''}'`;
            if (type === 'bool') val = input ? (input.type === 'checkbox' ? input.checked.toString() : input.value) : 'false';
            
            result.expr = val;
            result.mermaid = `${result.id}(["${val}"])`;
            return result;
        }

        // --- 演算子ブロック (condition, operator等) ---
        if (["condition", "operator", "bit_operator", "parenthesis"].includes(type)) {
            const op = block.dataset.value || block.textContent.trim();
            const slots = Array.from(block.querySelectorAll('.slot')).filter(s => s.closest('.block') === block);
            let leftStr = "", rightStr = "";

            if (slots[0]) {
                const child = slots[0].querySelector('.block');
                if (child) {
                    leftStr = this.parseBlockData(child).expr;
                }
            }
            
            if (slots[1]) {
                const child = slots[1].querySelector('.block');
                if (child) rightStr = this.parseBlockData(child).expr;
            }

            if (leftStr === "") {
                const isSwitchCase = this._isSwitchCaseCondition(block);
                if (isSwitchCase) {
                    leftStr = "_";
                }
            }

            if (type === 'parenthesis') result.expr = `${leftStr}${op}${rightStr}`;
            else result.expr = `${leftStr} ${op} ${rightStr}`;

            result.mermaid = `${result.id}(["${result.expr}"])`;
            return result;
        }

        // --- 関数・制御系 ---
        const complexTypes = ["calc_func", "time_func", "export_func", "control_func", "flow_control"];
        if (complexTypes.includes(type)) {
            return this._parseComplexBlock(block, type, result.id);
        }

        // デフォルト
        const val = block.dataset.value || block.textContent.trim();
        result.expr = val;
        result.mermaid = `${result.id}("${val}")`;
        return result;
    }

    static _isSwitchCaseCondition(block) {
        const parentSlot = block.closest('.slot');
        if (!parentSlot) return false;
        const parentBlock = parentSlot.closest('.block');
        if (!parentBlock) return false;
        const funcName = parentBlock.dataset.func || parentBlock.dataset.value;
        if (funcName !== 'switch') return false;
        const allSlots = Array.from(parentBlock.querySelectorAll('.slot'));
        const parentSlots = allSlots.filter(s => s.closest('.block') === parentBlock);
        const idx = parentSlots.indexOf(parentSlot);
        return (idx > 0 && idx % 2 !== 0);
    }

    static _parseComplexBlock(block, type, nodeId) {
        const funcName = block.dataset.func || block.dataset.value;
        const slots = Array.from(block.querySelectorAll('.slot')).filter(s => s.closest('.block') === block);
        
        let argsExprs = [];
        let mermaidCode = '';
        let conditionLabel = '', tempCaseLabel = '';

        slots.forEach((node, idx) => {
            const argName = node.dataset.argName || "";
            const childBlocks = Array.from(node.children).filter(el => el.classList.contains('block'));
            
            let childExpr = "?", childLabel = "?", childMermaidParts = [];

            if (childBlocks.length > 0) {
                const childResults = childBlocks.map(b => this.parseBlockData(b));
                childExpr = childResults.map(r => r.expr).join(' ');
                childLabel = childResults.map(r => r.label).join(' ');

                const shouldSkip = (funcName === 'switch' && (idx === 0 || (idx !== slots.length - 1 && idx % 2 !== 0))) ||
                                 (funcName === 'if' && idx === 0);

                if (!shouldSkip) {
                    childResults.forEach(r => childMermaidParts.push({ id: r.id, def: r.mermaid }));
                }
            } else {
                const isSwitchDefault = (funcName === 'switch' && idx % 2 !== 0);
                if (isSwitchDefault) childExpr = "_";
                
                const shouldSkipEmpty = (funcName === 'if' && idx === 0) ||
                                      (funcName === 'switch' && (idx === 0 || (idx !== slots.length - 1 && idx % 2 !== 0)));

                if (!shouldSkipEmpty) {
                     const emptyId = `empty_${this.mermaidNodeCounter++}`;
                     childMermaidParts.push({ id: emptyId, def: `${emptyId}(("?"))` });
                }
            }
            argsExprs.push(childExpr);

            if (funcName === 'if' && idx === 0) conditionLabel = childLabel;
            if (funcName === 'switch') {
                if (idx === 0) conditionLabel = childLabel || "Target";
                else if (idx % 2 !== 0 && idx !== slots.length - 1) tempCaseLabel = childLabel || "?";
            }

            let linkLabel = argName ? `|${argName}|` : "";
            let shouldDrawLink = true;

            if (funcName === 'if') {
                if (idx === 0) shouldDrawLink = false;
                else if (idx === 1) linkLabel = "|True|";
                else if (idx === 2) linkLabel = "|False|";
            } else if (funcName === 'switch') {
                if (idx === 0 || (idx % 2 !== 0 && idx !== slots.length - 1)) shouldDrawLink = false;
                else if (idx === slots.length - 1) linkLabel = "|Default|";
                else linkLabel = `|${tempCaseLabel}|`;
            }

            if (shouldDrawLink) {
                childMermaidParts.forEach(part => {
                    mermaidCode += part.def + '\n';
                    const arrow = part.def.includes('((') ? '-.->' : '-->';
                    mermaidCode += `${nodeId} ${arrow}${linkLabel} ${part.id}\n`;
                });
            }
        });

        let nodeLabel = funcName, shapeS = '(', shapeE = ')';
        if (funcName === 'if') { shapeS = '{'; shapeE = '}'; nodeLabel = `if ${conditionLabel}`; }
        else if (funcName === 'switch') { shapeS = '{'; shapeE = '}'; nodeLabel = `switch( ${conditionLabel} )`; }
        else if (funcName === 'wait') { shapeS = '[['; shapeE = ']]'; nodeLabel = `wait ${argsExprs[0] || '?'}`; }

        return {
            expr: `${funcName}( ${argsExprs.join(', ')} )`,
            mermaid: `${nodeId}${shapeS}"${nodeLabel}"${shapeE}\n` + mermaidCode,
            id: nodeId
        };
    }
}
BlockParser.mermaidNodeCounter = 0;

/* ============================================================
   2. ListRenderer
   ============================================================ */
class ListRenderer {
    constructor(containerId, selectors) {
        this.containerId = containerId;
        this.selectors = selectors;
    }

    render(dataList, onDelete) {
        let container = document.getElementById(this.containerId);
        if (!container) return;

        if (!dataList || dataList.length === 0) {
            container.innerHTML = '';
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = "No items available.";
            Object.assign(emptyMsg.style, { padding: '20px', color: '#999', textAlign: 'center', fontSize: '12px' });
            container.appendChild(emptyMsg);
            return;
        }

        const seenKeys = new Set();

        dataList.forEach((item, index) => {
            const key = item.id !== undefined ? String(item.id) : `idx_${index}`;
            seenKeys.add(key);

            let node = this._findNodeByKey(container, key);

            if (!node) {
                node = this._createItemNode(item, index, onDelete, key);
                if (index < container.children.length) {
                    container.insertBefore(node, container.children[index]);
                } else {
                    container.appendChild(node);
                }
            } else {
                this._updateItemNode(node, item);
                if (container.children[index] !== node) {
                    container.insertBefore(node, container.children[index]);
                }
            }
        });

        Array.from(container.children).forEach(node => {
            if (node.dataset.key && !seenKeys.has(node.dataset.key)) {
                node.remove();
            }
            if (!node.dataset.key && dataList.length > 0) node.remove();
        });
    }

    _findNodeByKey(container, key) {
        return container.querySelector(`.${this.selectors.listItemRowClass}[data-key="${key}"]`);
    }

    _createItemNode(item, index, onDelete, key) {
        const row = document.createElement('div');
        row.className = this.selectors.listItemRowClass;
        row.dataset.key = key;

        const textDiv = document.createElement('div');
        textDiv.className = this.selectors.listItemTextClass;
        this._setTextContent(textDiv, item);
        textDiv.addEventListener('scroll', () => this._updateFade(textDiv));
        
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = this.selectors.listItemDeleteBtnClass;
        
        // ★修正点: referenceがリストになったため、配列の長さを取得して判定する
        const refCount = Array.isArray(item.reference) ? item.reference.length : 0;
        
        if (refCount !== 0) {
            delBtn.disabled = true;
            delBtn.style.opacity = '0.5';
            delBtn.style.cursor = 'not-allowed';
            delBtn.title = 'Reference count must be 0 to delete.';
        }

        delBtn.onclick = () => { 
            // クリック時も最新のreferenceを確認（念のため）
            const currentRefCount = Array.isArray(item.reference) ? item.reference.length : 0;
            if (currentRefCount !== 0) return;
            if (onDelete) onDelete(index); 
        };

        row.appendChild(textDiv);
        row.appendChild(delBtn);

        setTimeout(() => this._updateFade(textDiv), 0);
        return row;
    }

    _updateItemNode(row, item) {
        const textDiv = row.querySelector(`.${this.selectors.listItemTextClass}`);
        
        // ★修正点: referenceリストの長さを取得
        const refCount = Array.isArray(item.reference) ? item.reference.length : 0;

        if (textDiv) {
            const name = item.name || '(No Name)';
            // テキスト表示を個数に変更
            const newText = `Name: ${name}, Reference: ${refCount}`;
            if (textDiv.textContent !== newText) {
                textDiv.textContent = newText;
                this._updateFade(textDiv);
            }
        }

        const delBtn = row.querySelector(`.${this.selectors.listItemDeleteBtnClass}`);
        if (delBtn) {
            if (refCount !== 0) {
                delBtn.disabled = true;
                delBtn.style.opacity = '0.5';
                delBtn.style.cursor = 'not-allowed';
                delBtn.title = 'Reference count must be 0 to delete.';
            } else {
                delBtn.disabled = false;
                delBtn.style.opacity = '1';
                delBtn.style.cursor = 'pointer';
                delBtn.title = '';
            }
        }
    }

    _setTextContent(div, item) {
        const name = item.name || '(No Name)';
        // ★修正点: リストの長さを表示
        const refCount = Array.isArray(item.reference) ? item.reference.length : 0;
        div.textContent = `Name: ${name}, Reference: ${refCount}`;
    }

    _updateFade(el) {
        const hasOverflow = el.scrollWidth > el.clientWidth;
        const isScrolledToEnd = Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) < 10;
        if (hasOverflow && !isScrolledToEnd) el.classList.add('masked-fade');
        else el.classList.remove('masked-fade');
    }
}

/* ============================================================
   3. ModalUI
   ============================================================ */
class ModalUI {
    constructor() {
        if (window.mermaid) {
            window.mermaid.initialize({ startOnLoad: true });
        }
    }

    closeModal(modalId) {
        const el = document.getElementById(modalId);
        if (el) el.classList.add('hidden');
    }

    processDropAndOpenUI(group, config = {}) {
        const defaultConfig = { sourceName: "Detail", apiUrl: null };
        const selectors = { ...DEFAULT_DOM_SELECTORS, ...(config.domSelectors || {}) };
        const uiConfig = { ...defaultConfig, ...config, domSelectors: selectors };

        const parsed = BlockParser.parseGroup(group);

        if (!parsed.expression) return;

        this.openExpressionModal(parsed.expression, "", parsed.mermaidCode, uiConfig);
    }

    openExpressionModal(expression, warningText = "", mermaidCode = null, uiConfig = {}) {
        const sel = uiConfig.domSelectors;
        const modal = document.getElementById(sel.expressionModalId);
        if (!modal) { console.error(`Modal '${sel.expressionModalId}' not found.`); return; }

        const modalTitle = modal.querySelector(sel.expressionTitleSelector);
        const modalBody = modal.querySelector('.modal-body');
        const tx = document.getElementById(sel.expressionTextareaId);
        const nameInput = document.getElementById(sel.expressionNameInputId);
        const sendBtn = modal.querySelector(sel.expressionSendBtnSelector);

        if (modalTitle) modalTitle.textContent = `${uiConfig.sourceName || "Detail"} - Detail`;
        if (tx) tx.value = expression;
        if (nameInput) nameInput.value = "";

        if (sendBtn) {
            sendBtn.style.display = uiConfig.apiUrl ? 'inline-block' : 'none';
            sendBtn.onclick = () => this._handleSendClick(uiConfig);
        }

        this._setupChartArea(modalBody, tx, sel, mermaidCode);
        this._setupWarningArea(modalBody, warningText, sendBtn, sel);

        modal.classList.remove('hidden');
        modal.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.closeModal(sel.expressionModalId));
    }

    openListModal(listConfig = {}) {
        const defaultConfig = { sourceName: "List", dataList: [], onDelete: null };
        const sel = { ...DEFAULT_DOM_SELECTORS, ...(listConfig.domSelectors || {}) };
        const config = { ...defaultConfig, ...listConfig };

        const modal = document.getElementById(sel.listModalId);
        if (!modal) { console.error(`List Modal '${sel.listModalId}' not found.`); return; }

        const modalTitle = modal.querySelector(sel.listTitleSelector);
        const modalBody = modal.querySelector('.modal-body');

        if (modalTitle) modalTitle.textContent = `${config.sourceName} - List`;

        let listContainer = document.getElementById(sel.listContainerId);
        if (!listContainer) {
            listContainer = document.createElement('div');
            listContainer.id = sel.listContainerId;
            Object.assign(listContainer.style, {
                maxHeight: '300px', overflowY: 'auto', border: '1px solid #ccc',
                backgroundColor: '#fff', borderRadius: '4px', marginTop: '10px', padding: '0'
            });
            modalBody.appendChild(listContainer);
        }

        const renderer = new ListRenderer(sel.listContainerId, sel);
        renderer.render(config.dataList, config.onDelete);

        modal.classList.remove('hidden');
        modal.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.closeModal(sel.listModalId));
    }

    async _handleSendClick(uiConfig) {
        const sel = uiConfig.domSelectors;
        const tx = document.getElementById(sel.expressionTextareaId);
        const nameInput = document.getElementById(sel.expressionNameInputId);
        const expression = tx ? tx.value.trim() : "";
        let name = nameInput ? nameInput.value.trim() : "";
        const mode = uiConfig.mode || "evaluation"; 

        if (!expression) return;
        if (!name) name = `test${Math.floor(1000 + Math.random() * 9000)}`;

        await this._executePost(uiConfig.apiUrl, { expression, name, mode }, uiConfig.sourceName, sel);
    }

    async _executePost(url, payload, sourceName, selectors) {
        const warningDiv = document.getElementById(selectors.expressionWarningId);
        if (warningDiv) warningDiv.style.display = 'none';

        if (!url) { alert("API URL unset."); return; }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();

            if (res.ok) {
                this.closeModal(selectors.expressionModalId);
                alert(`[${sourceName}] Saved successfully.`);
            } else {
                const msg = json.message || json.error || 'Unknown error';
                if (warningDiv) {
                    warningDiv.textContent = `Error: ${msg}`;
                    warningDiv.style.display = 'block';
                } else {
                    alert(`Error: ${msg}`);
                }
            }
        } catch (e) {
            console.error(e);
            alert('Connection failed.');
        }
    }

    _setupChartArea(modalBody, tx, selectors, mermaidCode) {
        let wrapper = document.getElementById('flowchart-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'flowchart-wrapper';
            wrapper.style.position = 'relative';
            const ph = document.getElementById(selectors.flowchartWrapperPlaceholderId);
            if (ph) ph.parentNode.replaceChild(wrapper, ph);
            else if (tx && tx.parentNode) tx.parentNode.insertBefore(wrapper, tx.nextSibling);
            else modalBody.appendChild(wrapper);
        }

        let container = document.getElementById('flowchart-preview');
        if (!container) {
            container = document.createElement('div');
            container.id = 'flowchart-preview';
            Object.assign(container.style, {
                border: '1px solid #ddd', marginTop: '10px', marginBottom: '10px', padding: '10px',
                minHeight: '120px', maxHeight: '300px', backgroundColor: '#ffffff', borderRadius: '4px',
                display: 'flex', justifyContent: 'center', overflow: 'auto'
            });
            wrapper.appendChild(container);
        }

        const expandBtn = document.getElementById('flowchart-expand-btn') || this._createExpandBtn(wrapper);
        
        if (mermaidCode) {
            container.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;
            if (window.mermaid) {
                try { window.mermaid.run({ nodes: container.querySelectorAll('.mermaid') }); } catch(e) { console.error(e); }
            }
            expandBtn.style.display = 'block';
        } else {
            container.innerHTML = '';
            expandBtn.style.display = 'none';
        }
    }

    _setupWarningArea(modalBody, text, sendBtn, selectors) {
        let div = document.getElementById(selectors.expressionWarningId);
        if (!div) {
            div = document.createElement('div');
            div.id = selectors.expressionWarningId;
            Object.assign(div.style, {
                backgroundColor: '#fff2f2', border: '1px solid #d9534f', color: '#d9534f',
                padding: '10px', borderRadius: '4px', marginBottom: '15px', display: 'none'
            });
            modalBody.insertBefore(div, modalBody.firstChild);
        }
        if (text) {
            div.textContent = text;
            div.style.display = 'block';
            if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }
        } else {
            div.style.display = 'none';
            if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
        }
    }

    _createExpandBtn(wrapper) {
        const btn = document.createElement('button');
        btn.id = 'flowchart-expand-btn';
        btn.innerHTML = '🔍 Zoom';
        Object.assign(btn.style, {
            position: 'absolute', top: '5px', right: '20px', zIndex: '5', padding: '2px 8px',
            fontSize: '12px', cursor: 'pointer', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '3px'
        });
        btn.onclick = (e) => {
            e.preventDefault();
            const c = document.getElementById('flowchart-preview');
            if (c && c.innerHTML) this._showFullscreenOverlay(c.innerHTML);
        };
        wrapper.appendChild(btn);
        return btn;
    }

    _showFullscreenOverlay(content) {
        let overlay = document.getElementById('fs-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'fs-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                backgroundColor: 'rgba(255,255,255,0.98)', zIndex: '10000',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px'
            });
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '× Close';
            Object.assign(closeBtn.style, { position: 'absolute', top: '20px', right: '30px', padding: '10px', cursor:'pointer' });
            closeBtn.onclick = () => overlay.style.display = 'none';
            overlay.appendChild(closeBtn);
            
            const box = document.createElement('div');
            box.id = 'fs-content';
            Object.assign(box.style, { width: '100%', height: '90%', overflow: 'auto', display:'flex', justifyContent:'center', alignItems:'center' });
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }
        const box = document.getElementById('fs-content');
        box.innerHTML = content;
        const svg = box.querySelector('svg');
        if(svg) { svg.style.maxWidth='none'; svg.style.height='auto'; svg.style.minWidth='50%'; }
        overlay.style.display = 'flex';
    }
}

export const BlockEditorApp = new ModalUI();