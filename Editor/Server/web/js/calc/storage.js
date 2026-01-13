// ▼▼▼ Config: Max Limit ▼▼▼
const STORAGE_LIMIT = 20;

window.storageList = [];

function updateStorageArea(group) {
    if (window.storageList.length >= STORAGE_LIMIT) {
        return; 
    }

    const sorted = group.slice().sort((a, b) => a.offsetLeft - b.offsetLeft);
    const exprParts = sorted.map(b => getBlockExpression(b));
    const expr = exprParts.join(' ').trim();
    
    if (!expr) return;

    const existingIds = window.storageList.map(item => item.id);
    let newId = 1;
    while (existingIds.includes(newId)) {
        newId++;
    }

    // 3. Save entry
    window.storageList.push({ id: newId, expr: expr });
    window.storageList.sort((a, b) => a.id - b.id);
    group.forEach(removeBlock);

    updateStorageCounter();

    // Update drawer
    if (window.renderDrawerStorage) {
        window.renderDrawerStorage(window.storageList);
    }
}

function updateStorageCounter() {
    const storageArea = document.getElementById('storage-area');
    if (!storageArea) return;

    const count = window.storageList.length;

    // 1. Update text
    if (count === 0) {
        storageArea.textContent = 'Bank';
    } else {
        storageArea.textContent = `Bank \n ${count}/${STORAGE_LIMIT}`;
    }

    // 2. Add class if limit reached (color managed via CSS)
    if (count >= STORAGE_LIMIT) {
        storageArea.classList.add('limit-reached');
    } else {
        storageArea.classList.remove('limit-reached');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const storageArea = document.getElementById('storage-area');
    if (storageArea) {
        updateStorageCounter();

        storageArea.addEventListener('click', function() {
            if (window.openStorageModal) window.openStorageModal();
        });
    }
});

window.closeStorageModal = function(){
    const modal = document.getElementById('storage-modal');
    modal.classList.add('hidden');
};

// Open modal
window.openStorageModal = function(){
    const modal = document.getElementById('storage-modal');
    const modalBody = modal.querySelector('.modal-body');
    let listContainer = document.getElementById('storage-list-container');

    if (!listContainer) {
        listContainer = document.createElement('div');
        listContainer.id = 'storage-list-container'; 
        Object.assign(listContainer.style, {
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #ccc',
            backgroundColor: '#fff', 
            borderRadius: '4px',
            marginTop: '10px',
            padding: '0'
        });
        
        modalBody.appendChild(listContainer);
    }

    modal.classList.remove('hidden');
    renderStorageList(listContainer);
};

// Render list
function renderStorageList(container) {
    container.innerHTML = '';

    if (window.storageList.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = "No Banked expressions.";
        Object.assign(emptyMsg.style, { padding: '20px', color: '#999', textAlign: 'center', fontSize: '12px' });
        container.appendChild(emptyMsg);
        return;
    }

    window.storageList.forEach((item, index) => {
        const row = document.createElement('div');
        row.id = `storage-row-${item.id}`; 
        row.className = 'storage-row';

        const textDiv = document.createElement('div');
        textDiv.textContent = `$${item.id} : ${item.expr}`; 
        textDiv.className = 'storage-text-item';

        const updateFade = () => {
            const hasOverflow = textDiv.scrollWidth > textDiv.clientWidth;
            const isScrolledToEnd = Math.abs(textDiv.scrollWidth - textDiv.clientWidth - textDiv.scrollLeft) < 10;

            if (hasOverflow && !isScrolledToEnd) {
                textDiv.classList.add('masked-fade'); 
            } else {
                textDiv.classList.remove('masked-fade'); 
            }
        };

        // Execute check on scroll
        textDiv.addEventListener('scroll', updateFade);
        
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = 'storage-delete-btn';
        delBtn.onclick = function() {
            window.storageList.splice(index, 1);
            renderStorageList(container); 
            updateStorageCounter();
            if (window.renderDrawerStorage) window.renderDrawerStorage(window.storageList);
        };

        row.appendChild(textDiv);
        row.appendChild(delBtn);
        container.appendChild(row);

        setTimeout(updateFade, 0);
    });
}