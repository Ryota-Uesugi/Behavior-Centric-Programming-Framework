window.mermaid.initialize({ startOnLoad: true });

let mermaidNodeCounter = 0;
let storageCounter = 0;

function updateExpressionArea(group) {
    const sorted = group.slice().sort((a, b) => a.offsetLeft - b.offsetLeft);
    
    mermaidNodeCounter = 0; 
    storageCounter = 1; 
    
    let fullExprParts = [];
    let fullMermaidCode = 'flowchart TD\n';

    sorted.forEach(b => {
        const res = parseBlockData(b);
        if (res.expr) fullExprParts.push(res.expr);
        if (res.mermaid) fullMermaidCode += res.mermaid + '\n';
    });

    const expr = fullExprParts.join(' ').trim();
    
    if (!expr && typeof warningMsg !== 'undefined' && !warningMsg) return;

    if (window.openExpressionModal) {
        window.openExpressionModal(expr, "", fullMermaidCode);
    } else {
        console.log("Expression:", expr);
    }
}

/**
 * Parse DOM Block Data
 */

function parseBlockData(block) {
    const result = {
        expr: '',
        mermaid: '',
        id: null,
        label: ''
    };

    if (!block || !block.dataset) return result;

    const type = block.dataset.type;
    result.id = `node_${mermaidNodeCounter++}`;

    // --- 1. Storage ---
    if (type === 'storage') {
        const idx = storageCounter++;
        const name = block.textContent.trim() || block.dataset.value || '?';
        const rawExpr = block.dataset.expr || '?';
        
        result.label = `$${idx} ${name}`;
        result.expr = rawExpr; 
        
        let mermaidCode = `${result.id}[[ "${result.label}" ]]\n`;
        const innerParsed = parseStringExpression(rawExpr);
        
        if (innerParsed) {
            mermaidCode += innerParsed.mermaid + '\n';
            mermaidCode += `${result.id} -.-> ${innerParsed.id}\n`;
        }

        result.mermaid = mermaidCode;
        return result;
    }

    // --- 2. Simple Values ---
    if (type === 'number') {
        const val = block.querySelector('input')?.value || '0';
        result.expr = val;
        result.label = val;
        result.mermaid = `${result.id}(["${val}"])`;
        return result;
    }
    if (type === 'string') {
        const val = block.querySelector('input')?.value || '';
        result.expr = `'${val}'`;
        result.label = `'${val}'`;
        result.mermaid = `${result.id}(["'${val}'"])`;
        return result;
    }
    if (["condition", "operator", "bit_operator", "parenthesis"].includes(type)) {
        const val = block.dataset.op || block.dataset.value || block.textContent.trim();
        result.expr = val;
        result.label = val;
        result.mermaid = `${result.id}("${val}")`;
        return result;
    }

    // --- 3. Functions/Control (including special handling for 'if') ---
    const complexTypes = ["calc_func", "time_func", "export_func", "control_func", "flow_control"];
    
    if (complexTypes.includes(type)) {
        const funcName = block.dataset.func || block.dataset.value;
        const children = Array.from(block.childNodes);
        
        let argsExprs = [];
        let mermaidCode = '';
        let conditionLabel = ''; 

        let slotIndex = 0;
        children.forEach(node => {
            if (node.classList && node.classList.contains('slot')) {
                const currentSlotIndex = slotIndex++; 
                const argName = node.dataset.argName || ""; 
                const childBlocks = Array.from(node.children).filter(el => el.classList.contains('block'));

                let childExpr = "?";
                let childLabel = "?";
                let childMermaidParts = [];

                if (childBlocks.length > 0) {
                    const childResults = childBlocks.map(b => parseBlockData(b));
                    childExpr = childResults.map(r => r.expr).join(' ');
                    childLabel = childResults.map(r => r.label).join(' ');
                    
                    const hasComplex = childBlocks.some(b => complexTypes.includes(b.dataset.type));
                    
                    if (!hasComplex) {
                        if (!(funcName === 'if' && currentSlotIndex === 0)) {
                             const mergedId = `merged_${mermaidNodeCounter++}`;
                             childMermaidParts.push({ id: mergedId, def: `${mergedId}(["${childLabel}"])` });
                        }
                    } else {
                        childResults.forEach(r => {
                             childMermaidParts.push({ id: r.id, def: r.mermaid });
                        });
                    }
                } else {
                      if (!(funcName === 'if' && currentSlotIndex === 0)) {
                          const emptyId = `empty_${mermaidNodeCounter++}`;
                          childMermaidParts.push({ id: emptyId, def: `${emptyId}(("?"))` }); 
                          childLabel = "?";
                      }
                }
                argsExprs.push(childExpr);

                if (funcName === 'if' && currentSlotIndex === 0) {
                    conditionLabel = childLabel || "?"; 
                } else {
                    let linkLabel = argName ? `|${argName}|` : "";
                    if (funcName === 'if') {
                        if (currentSlotIndex === 1) linkLabel = "|True|";
                        if (currentSlotIndex === 2) linkLabel = "|False|";
                    }
                    childMermaidParts.forEach(part => {
                        mermaidCode += part.def + '\n';
                        const arrow = part.def.includes('((') ? '-.->' : '-->';
                        mermaidCode += `${result.id} ${arrow}${linkLabel} ${part.id}\n`;
                    });
                }
            }
        });

        let nodeLabel = funcName;
        let shapeStart = '('; 
        let shapeEnd = ')';

        // ★ Constructing the if( ... ) shape here
        if (funcName === 'if') {
            shapeStart = '{'; shapeEnd = '}';
            nodeLabel = `if( ${conditionLabel} )`; 
        }

        mermaidCode = `${result.id}${shapeStart}"${nodeLabel}"${shapeEnd}\n` + mermaidCode;

        result.expr = `${funcName}( ${argsExprs.join(', ')} )`;
        result.label = result.expr;
        result.mermaid = mermaidCode;
        return result;
    }

    const val = block.dataset.value || block.textContent.trim();
    result.expr = val;
    result.label = val;
    result.mermaid = `${result.id}("${val}")`;
    return result;
}

/**
 * Parse String Expression (for Storage)
 */
function parseStringExpression(exprStr) {
    if (!exprStr) return null;
    exprStr = exprStr.trim();

    const currentId = `str_${mermaidNodeCounter++}`;
    let mermaid = '';

    // Regex: Capture up to the trailing ')'
    const match = exprStr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/);

    if (match) {
        const funcName = match[1];
        const argsBody = match[2];
        const args = splitArgs(argsBody);

        let nodeLabel = funcName;
        let shapeStart = '('; 
        let shapeEnd = ')';
        let conditionText = '';

        // ★ Constructing the if( ... ) shape here
        if (funcName === 'if') {
            shapeStart = '{'; shapeEnd = '}';
            conditionText = args.length > 0 ? args[0] : '?';
            nodeLabel = `if( ${conditionText} )`;
        }

        mermaid += `${currentId}${shapeStart}"${nodeLabel}"${shapeEnd}\n`;

        args.forEach((arg, index) => {
            if (funcName === 'if' && index === 0) return;

            const childResult = parseStringExpression(arg);
            if (childResult) {
                mermaid += childResult.mermaid + '\n';
                
                let linkText = '';
                if (funcName === 'if') {
                    if (index === 1) linkText = '|True|';
                    else if (index === 2) linkText = '|False|';
                }
                
                mermaid += `${currentId} -->${linkText} ${childResult.id}\n`;
            }
        });

    } else {
        mermaid += `${currentId}(["${exprStr} "])\n`;
    }

    return { id: currentId, mermaid: mermaid };
}

function splitArgs(str) {
    let args = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        
        if (char === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

// -------------------------------------------------------------
// Modal Functionality (with Zoom Button)
// -------------------------------------------------------------
window.openExpressionModal = function(expression, warningText = "", mermaidCode = null){
    if(typeof pendingExpression !== 'undefined') pendingExpression = expression;
    
    const modal = document.getElementById('expression-modal');
    const modalBody = modal.querySelector('.modal-body');
    const tx = modal.querySelector('textarea');
    const nameInput = document.getElementById('expression-name'); 
    const sendBtn = modal.querySelector('.btn-send');

    if (tx) tx.value = expression;
    if (nameInput) nameInput.value = ""; 

    // --- Change: Create a wrapper div to group the button and chart ---
    let chartWrapper = document.getElementById('flowchart-wrapper');
    if (!chartWrapper) {
        chartWrapper = document.createElement('div');
        chartWrapper.id = 'flowchart-wrapper';
        chartWrapper.style.position = 'relative'; // Reference for button positioning
        
        if (tx && tx.parentNode) {
            tx.parentNode.insertBefore(chartWrapper, tx.nextSibling);
        } else {
            modalBody.appendChild(chartWrapper);
        }
    }

    // Chart container
    let chartContainer = document.getElementById('flowchart-preview');
    if (!chartContainer) {
        chartContainer = document.createElement('div');
        chartContainer.id = 'flowchart-preview';
        Object.assign(chartContainer.style, {
            border: '1px solid #ddd',
            marginTop: '10px',
            marginBottom: '10px',
            padding: '10px',
            minHeight: '120px',
            maxHeight: '300px', // Restrict height for scrolling in normal view
            backgroundColor: '#ffffff',
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'auto'
        });
        chartWrapper.appendChild(chartContainer);
    }

    // Create and place zoom button
    let expandBtn = document.getElementById('flowchart-expand-btn');
    if (!expandBtn) {
        expandBtn = document.createElement('button');
        expandBtn.id = 'flowchart-expand-btn';
        expandBtn.innerHTML = '🔍 Zoom';
        Object.assign(expandBtn.style, {
            position: 'absolute',
            top: '5px',
            right: '20px', 
            zIndex: '5',
            padding: '2px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '3px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
        });
        
        expandBtn.onclick = function(e) {
            e.preventDefault();
            // Get current SVG content and show in full screen
            const svgContent = chartContainer.innerHTML;
            if(svgContent) showFullscreenOverlay(svgContent);
        };
        
        chartWrapper.appendChild(expandBtn);
    }

    // Render flowchart
    if (mermaidCode) {
        chartContainer.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;
        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.run({
                    nodes: chartContainer.querySelectorAll('.mermaid')
                });
            } catch(e) { console.error("Mermaid error:", e); }
        }
        expandBtn.style.display = 'block';
    } else {
        chartContainer.innerHTML = '';
        expandBtn.style.display = 'none';
    }

    // Warning area
    let warningDiv = document.getElementById('modal-warning');
    if (!warningDiv) {
        warningDiv = document.createElement('div');
        warningDiv.id = 'modal-warning';
        Object.assign(warningDiv.style, {
            backgroundColor: '#fff2f2',
            border: '1px solid #d9534f',
            color: '#d9534f',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '15px',
            fontSize: '13px',
            fontWeight: 'bold'
        });
        modalBody.insertBefore(warningDiv, modalBody.firstChild);
    }

    if (warningText) {
        warningDiv.textContent = warningText;
        warningDiv.style.display = 'block';
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
            sendBtn.style.pointerEvents = 'none';
        }
    } else {
        warningDiv.style.display = 'none';
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.pointerEvents = 'auto';
        }
    }

    modal.classList.remove('hidden');
};

/**
 * Function to show fullscreen overlay
 */
function showFullscreenOverlay(content) {
    let overlay = document.getElementById('fs-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fs-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(255,255,255,0.98)',
            zIndex: '10000', // In front of modal
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
        });
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '× Close';
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '20px', right: '30px',
            fontSize: '16px', padding: '8px 16px', 
            cursor: 'pointer',
            backgroundColor: '#eee', border: 'none', borderRadius: '4px'
        });
        closeBtn.onclick = () => overlay.style.display = 'none';
        overlay.appendChild(closeBtn);
        
        // Content area
        const contentBox = document.createElement('div');
        contentBox.id = 'fs-content';
        Object.assign(contentBox.style, {
            width: '100%', height: '90%',
            overflow: 'auto', // Scrollable
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center'
        });
        overlay.appendChild(contentBox);
        
        document.body.appendChild(overlay);
    }
    
    const contentBox = document.getElementById('fs-content');
    contentBox.innerHTML = content;
    
    // Adjust SVG style (for better visibility in full screen)
    const svg = contentBox.querySelector('svg');
    if(svg) {
        svg.style.maxWidth = 'none'; // Remove size limit
        svg.style.height = 'auto';
        // Ensure minimum width while fitting parent, as small charts are hard to read
        svg.style.minWidth = '50%'; 
    }
    
    overlay.style.display = 'flex';
}

window.closeModal = function(){
    const modal = document.getElementById('expression-modal');
    modal.classList.add('hidden');
    if(typeof pendingExpression !== 'undefined') pendingExpression = '';
    
    const warningDiv = document.getElementById('modal-warning');
    if (warningDiv) warningDiv.style.display = 'none';
};

window.sendExpression = async function(){
    const modal = document.getElementById('expression-modal');
    const tx = modal.querySelector('textarea');
    const nameInput = document.getElementById('expression-name');
    
    const finalExpr = tx ? tx.value.trim() : (typeof pendingExpression !== 'undefined' ? pendingExpression : "");
    let finalName = nameInput ? nameInput.value.trim() : "";
    
    if (!finalName) {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        finalName = `test${randomNum}`;
    }
    if (!finalExpr) return;
    
    await postExpression(finalExpr, finalName);
};

async function postExpression(expression, name = "") {
    const warningDiv = document.getElementById('modal-warning');
    if (warningDiv) warningDiv.style.display = 'none';

    try {
        const res = await fetch('http://localhost:5000/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expression, name })
        });

        const json = await res.json();

        if (res.ok) {
            if (window.closeModal) window.closeModal();
            alert('Saved successfully.');
        } else {
            const errorMsg = json.message || json.error || 'An unknown error occurred.';
            console.error("Server Error:", errorMsg);

            if (window.openExpressionModal) {
                window.openExpressionModal(expression, errorMsg);
            } else {
                alert('Error: ' + errorMsg);
            }
            
            const nameInput = document.getElementById('expression-name');
            if (nameInput) nameInput.value = name;
        }
    } catch (e) {
        console.error("Connection Error:", e);
        alert('Connection failed. Please check if the server is running.');
    }
}