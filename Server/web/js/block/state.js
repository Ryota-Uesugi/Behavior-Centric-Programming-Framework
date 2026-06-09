/* ==========================================================================
   GLOBAL STATE & DOM ELEMENTS
   ========================================================================== */

// --- DOM References ---
export const DOM = {
    field:          document.getElementById('field'),
    trash:          document.getElementById('trash'),
    drawer:         document.getElementById('drawer'),
    toggleBtn:      document.getElementById('drawer-toggle'),
    expressionArea: document.getElementById('expression-area'),
    compomentArea:  document.getElementById('compoment-area') 
};

// --- Application State ---
// Mutable state container
export const State = {
    blocks: [],
    blockGroups: new Map(),
    groupBoxes: new Map(),
    
    // Drag & Interaction State
    dragInfo: null,
    isDragging: false,
    dragX: 0,
    dragY: 0,
    lastMousePos: { x: 0, y: 0 },
    pendingExpression: '',
    
    // UI / Rendering State
    insertIndicator: null,
    isOpen: true, // Drawer state
    
    // Caches & Performance
    cachedSlotData: [],
    cachedGroupData: [],
    cachedFieldRect: null,
    dragLoopId: null,
    lastFrameTime: 0,
    
    // Diffing / Optimization
    lastActiveSlot: null,
    lastIndicatorState: { show: false, left: -1, top: -1, height: -1 },

    // Panning
    isPanning: false,
    fieldBgX: 0,
    fieldBgY: 0,
    
    // Tooltip
    globalTooltip: null
};

// Tooltip Initialization
if (!State.globalTooltip) {
    const tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    Object.assign(tooltip.style, {
        position: 'absolute',
        zIndex: '9999',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        pointerEvents: 'none',
        display: 'none'
    });
    document.body.appendChild(tooltip);
    State.globalTooltip = tooltip;
}

// Global Input Listeners (Sync mouse position)
window.addEventListener('mousemove', e => {
    State.lastMousePos.x = e.clientX;
    State.lastMousePos.y = e.clientY;
}, true);