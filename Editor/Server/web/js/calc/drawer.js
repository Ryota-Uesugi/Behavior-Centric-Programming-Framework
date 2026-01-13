/* ================= Drawer (Palette) Operations ================= */

const drawer = document.getElementById('drawer');
const toggleBtn = document.getElementById('drawer-toggle');
let isOpen = true;

toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    drawer.classList.toggle('closed', !isOpen);
    toggleBtn.classList.toggle('closed', !isOpen);
    toggleBtn.textContent = isOpen ? '≪' : '≫';
});

/**
 * Block Generation Utility (for Drawer)
 */
function createDrawerBlock(text, type, dataAttr = {}, descText = "", parent = drawer) {
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
        if (dataAttr.func && typeof FUNC_CONFIG !== 'undefined') {
            descText = FUNC_CONFIG[dataAttr.func]?.desc || "";
        } else if (typeof GENERAL_DESC !== 'undefined') {
            // "Operator" refers to mathematical symbols like +, -, etc.
            descText = GENERAL_DESC[type] || (dataAttr.op ? `Operator: ${dataAttr.op}` : "");
        }
    }

    // Info icon ('i' mark)
    if (descText) {
        block.dataset.desc = descText;
        const infoIcon = document.createElement('div');
        infoIcon.className = 'info-icon';
        infoIcon.textContent = 'i';

        infoIcon.addEventListener('mouseenter', () => {
            if(typeof globalTooltip !== 'undefined') {
                const rect = infoIcon.getBoundingClientRect();
                globalTooltip.innerText = descText;
                globalTooltip.style.display = 'block';
                globalTooltip.style.top = `${rect.top}px`;
                globalTooltip.style.left = `${rect.right + 8}px`;
                globalTooltip.style.opacity = '1';
            }
        });

        infoIcon.addEventListener('mouseleave', () => {
            if(typeof globalTooltip !== 'undefined') {
                globalTooltip.style.display = 'none';
                globalTooltip.style.opacity = '0';
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
 * Drawer Generation
 */

// 1. Event for generating blocks from the drawer
drawer.addEventListener('mousedown', e => {
    // Ignore the info icon
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

    if(type === 'storage'){
        initialValue ='$'+target.dataset.id + ' expr' ||''
    }

    // Call function from block.js
    if (typeof createBlock === 'function') {
        const newBlock = createBlock(type, initialValue, true, op, expr);
        placeBlockAtMouse(e, newBlock);
        
        // Call function from drag.js
        if (typeof startDrag === 'function') {
            startDrag(e, newBlock);
        }
    }
});

function placeBlockAtMouse(e, block) {
    const fieldRect = field.getBoundingClientRect();
    const width = block.offsetWidth || 120; 
    const height = block.offsetHeight || 40;
    const x = e.clientX - fieldRect.left + field.scrollLeft - width / 2;
    const y = e.clientY - fieldRect.top + field.scrollTop - height / 2;
    block.style.left = `${x}px`;
    block.style.top  = `${y}px`;
}

// 2. Build Content
singleBlock.forEach(block => {
    createDrawerBlock(block.Name, block.type);
});

const storageContainer = document.createElement('div');
storageContainer.id = 'drawer-storage-container';
storageContainer.style.padding = "5px 0";
storageContainer.style.display = "none"; 
drawer.appendChild(storageContainer);

// Operators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
operators.forEach(group => {
    group.list.forEach(op => {
        createDrawerBlock(op, group.type, { op: op });
    });
});

// Function blocks (generated from FUNC_CONFIG in config.js)
if (typeof FUNC_CONFIG !== 'undefined') {
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

/* --- window.renderDrawerStorage part of js/calc/drawer.js --- */

window.renderDrawerStorage = function(list) {
    const storageContainer = document.getElementById('drawer-storage-container');
    if (!storageContainer) return;

    // 1. Clear contents
    storageContainer.innerHTML = '';

    if (!list || list.length === 0) {
        storageContainer.style.display = 'none';
        return;
    }

    storageContainer.style.display = 'block';

    // 2. Create Fragment (virtual container)
    const fragment = document.createDocumentFragment();

    // Generate list
    list.forEach(item => {
        const displayText = `$${item.id} expr`;

        createDrawerBlock(
            displayText,          
            'storage',            
            {id: item.id},  
            `${item.expr}`,     
            fragment 
        );
    });

    storageContainer.appendChild(fragment);
};