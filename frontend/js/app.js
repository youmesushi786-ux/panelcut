console.log('PanelPro frontend loaded');

const API_BASE = 'http://localhost:8000'; // change to your backend/ngrok URL if needed

// Global state
const AppState = {
    currentStep: 1,
    panels: [],
    board: {
        coreType: null,
        thickness: null,
        company: null,
        colorCode: null,
        colorName: null,
        colorHex: null,
    },
    supply: {
        mode: 'factory',      // 'factory' or 'client'
        clientQty: 1,
        clientEdgingMeters: 0 // meters of edging supplied by client
    },
    customer: {
        projectName: '',
        name: '',
        email: '',
        phone: '',
        notes: '',
    },
    stockSheets: [
        { length: 2440, width: 1220, qty: 10 },
    ],
    options: {
        kerf: 3,
        labelsOnPanels: false,
        useSingleSheet: false,
        considerMaterial: false,
        edgeBanding: true,
        considerGrain: false,
    },
    result: null,
};

let BoardCatalog = null;
let currentOrder = null;
let selectedPanelIndex = 0; // for edge preview

document.addEventListener('DOMContentLoaded', () => {
    initAPIStatus();
    loadBoardCatalog();
    initSteps();
    initPanels();
    initEdgePreview();
    initBoardAndOptions();
    initSupply();
    initNavButtons();
    console.log('PanelPro initialized');
});

// =============== API STATUS ==================
async function initAPIStatus() {
    const el = document.getElementById('api-status');
    try {
        const res = await fetch(API_BASE + '/health');
        const data = await res.json();
        el.textContent = `API: ${data.status}`;
        el.style.color = '#16a34a';
    } catch (e) {
        el.textContent = 'API: offline';
        el.style.color = '#dc2626';
    }
}

async function loadBoardCatalog() {
    try {
        const res = await fetch(`${API_BASE}/api/boards/catalog`);
        if (!res.ok) throw new Error('Failed to load board catalog');
        BoardCatalog = await res.json();
        console.log('Board catalog loaded', BoardCatalog);
    } catch (e) {
        console.error(e);
        showToast('Failed to load board catalog, using defaults', 'error');
    }
}

// =============== STEPS / NAVIGATION ==================
function initSteps() {
    document.querySelectorAll('.step').forEach(step => {
        step.addEventListener('click', () => {
            const stepNum = parseInt(step.dataset.step);
            if (stepNum < AppState.currentStep) {
                goToStep(stepNum);
            }
        });
    });
}

function initNavButtons() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    prevBtn.onclick = () => {
        if (AppState.currentStep > 1) goToStep(AppState.currentStep - 1);
    };
    nextBtn.onclick = () => {
        handleNext();
    };
}

async function handleNext() {
    if (AppState.currentStep === 1) {
        const hasValidPanel = AppState.panels.some(
            p => p.width > 0 && p.length > 0 && p.quantity > 0
        );
        if (!hasValidPanel) {
            showToast('Add at least one valid panel (width & length).', 'error');
            return;
        }
        goToStep(2);
        runOptimization();
        return;
    }
}

function goToStep(step) {
    AppState.currentStep = step;

    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById(`step-${step}`);
    if (sec) sec.classList.add('active');

    document.querySelectorAll('.step').forEach(s => {
        const num = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (num < step) s.classList.add('completed');
        if (num === step) s.classList.add('active');
    });

    const progress = document.getElementById('progress-fill');
    const pct = ((step - 1) / 1) * 100;
    progress.style.width = pct + '%';

    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    prevBtn.disabled = step === 1;

    if (step === 2) {
        nextBtn.style.display = 'none';
    } else {
        nextBtn.innerHTML = 'Optimize &amp; view results <i class="fas fa-arrow-right"></i>';
        nextBtn.style.display = 'inline-flex';
    }
}

// =============== PANELS AS TABLE ==================
function initPanels() {
    const addBtn = document.getElementById('add-panel-row');
    const resetBtn = document.getElementById('reset-panel-rows');

    addBtn.onclick = () => {
        AppState.panels.push(createEmptyPanel());
        renderPanelsTable();
    };

    resetBtn.onclick = () => {
        AppState.panels = [createEmptyPanel()];
        selectedPanelIndex = 0;
        renderPanelsTable();
    };

    if (!AppState.panels.length) {
        AppState.panels = [createEmptyPanel()];
    }
    renderPanelsTable();
}

function createEmptyPanel() {
    return {
        label: '',
        width: 0,
        length: 0,
        quantity: 1,
        alignment: 'none',
        notes: '',
        edging: { top: false, right: false, bottom: false, left: false },
    };
}

function renderPanelsTable() {
    const body = document.getElementById('panels-body');
    if (!body) return;

    if (!AppState.panels.length) {
        AppState.panels = [createEmptyPanel()];
    }

    body.innerHTML = AppState.panels.map((p, i) => `
        <tr>
            <td>
                <input type="text" value="${p.label || ''}"
                       oninput="updatePanel(${i}, 'label', this.value)">
            </td>
            <td>
                <input type="number" min="1" max="5000" value="${p.width || ''}"
                       oninput="updatePanelNumber(${i}, 'width', this.value)">
            </td>
            <td>
                <input type="number" min="1" max="5000" value="${p.length || ''}"
                       oninput="updatePanelNumber(${i}, 'length', this.value)">
            </td>
            <td>
                <input type="number" min="1" max="500" value="${p.quantity || 1}"
                       oninput="updatePanelInt(${i}, 'quantity', this.value)">
            </td>
            <td>
                <select onchange="updatePanel(${i}, 'alignment', this.value)">
                    <option value="none" ${p.alignment === 'none' ? 'selected' : ''}>None</option>
                    <option value="horizontal" ${p.alignment === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    <option value="vertical" ${p.alignment === 'vertical' ? 'selected' : ''}>Vertical</option>
                </select>
            </td>
            <td>
                <input type="text" value="${p.notes || ''}"
                       oninput="updatePanel(${i}, 'notes', this.value)">
            </td>
            <td style="text-align:right;">
                <button class="btn-secondary btn-small" onclick="removePanelRow(${i})" type="button">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');

    attachPanelRowEvents();

    if (AppState.panels.length) {
        if (selectedPanelIndex >= AppState.panels.length) {
            selectedPanelIndex = AppState.panels.length - 1;
        }
        setSelectedPanel(selectedPanelIndex);
    } else {
        selectedPanelIndex = 0;
        updateEdgePreviewFromSelected();
    }
}

function attachPanelRowEvents() {
    const rows = document.querySelectorAll('#panels-body tr');
    rows.forEach((row, idx) => {
        row.addEventListener('click', (e) => {
            const tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'select' || tag === 'button' || e.target.closest('button')) {
                return;
            }
            setSelectedPanel(idx);
        });
    });
}

function setSelectedPanel(idx) {
    selectedPanelIndex = idx;
    const rows = document.querySelectorAll('#panels-body tr');
    rows.forEach((row, i) => {
        row.classList.toggle('panel-row-selected', i === idx);
    });
    updateEdgePreviewFromSelected();
}

window.updatePanel = function (idx, field, value) {
    if (!AppState.panels[idx]) return;
    AppState.panels[idx][field] = value;
};

window.updatePanelNumber = function (idx, field, value) {
    if (!AppState.panels[idx]) return;
    const n = parseFloat(value);
    AppState.panels[idx][field] = isNaN(n) ? 0 : n;

    if (idx === selectedPanelIndex && (field === 'width' || field === 'length')) {
        updateEdgePreviewFromSelected();
    }
};

window.updatePanelInt = function (idx, field, value) {
    if (!AppState.panels[idx]) return;
    const n = parseInt(value);
    AppState.panels[idx][field] = isNaN(n) || n < 1 ? 1 : n;
};

window.updatePanelEdge = function (idx, edge, checked) {
    if (!AppState.panels[idx]) return;
    AppState.panels[idx].edging[edge] = checked;
    if (idx === selectedPanelIndex) {
        updateEdgePreviewFromSelected();
    }
};

window.removePanelRow = function (idx) {
    if (!AppState.panels[idx]) return;
    AppState.panels.splice(idx, 1);
    if (selectedPanelIndex >= AppState.panels.length) {
        selectedPanelIndex = Math.max(0, AppState.panels.length - 1);
    }
    renderPanelsTable();
};

// =============== EDGE PREVIEW ==================
function updateEdgePreviewFromSelected() {
    const p = AppState.panels[selectedPanelIndex] || createEmptyPanel();
    const dimsSpan = document.getElementById('edge-dims');
    if (dimsSpan) {
        const w = p.width || 0;
        const l = p.length || 0;
        dimsSpan.textContent = `${w} × ${l} mm`;
    }

    ['top', 'right', 'bottom', 'left'].forEach(edge => {
        const box = document.getElementById(`edge-${edge}-box`);
        const toggleEl = document.getElementById(`edge-toggle-${edge}`);
        const input = toggleEl ? toggleEl.querySelector('input') : null;
        const active = !!p.edging[edge];

        if (box) box.classList.toggle('active', active);
        if (toggleEl) toggleEl.classList.toggle('active', active);
        if (input) input.checked = active;
    });
}

function initEdgePreview() {
    ['top', 'right', 'bottom', 'left'].forEach(edge => {
        const toggleEl = document.getElementById(`edge-toggle-${edge}`);
        if (!toggleEl) return;
        const input = toggleEl.querySelector('input');
        if (!input) return;

        input.addEventListener('change', () => {
            const p = AppState.panels[selectedPanelIndex];
            if (!p) return;
            p.edging[edge] = input.checked;
            updateEdgePreviewFromSelected();
        });
    });

    const allBtn = document.getElementById('edge-select-all');
    if (allBtn) {
        allBtn.addEventListener('click', () => {
            const p = AppState.panels[selectedPanelIndex];
            if (!p) return;
            const allOn = !p.edging.top || !p.edging.right || !p.edging.bottom || !p.edging.left;
            ['top', 'right', 'bottom', 'left'].forEach(edge => {
                p.edging[edge] = allOn;
            });
            updateEdgePreviewFromSelected();
        });
    }

    updateEdgePreviewFromSelected();
}

// =============== BOARD / STOCK / OPTIONS ==================
function initBoardAndOptions() {
    initBoardSelector();
    initStockAndOptions();
}

function initBoardSelector() {
    const typeRow = document.getElementById('board-type-options');
    const thRow = document.getElementById('board-thickness-options');
    const compRow = document.getElementById('board-company-options');
    const colorRow = document.getElementById('board-color-options');

    const types = [
        { id: 'plywood', label: 'Plywood' },
        { id: 'mdf', label: 'MDF' },
        { id: 'chipboard', label: 'Chipboard' },
        { id: 'waterproof', label: 'Waterproof MDF' },
    ];

    typeRow.innerHTML = types.map(t => `
        <div class="chip" data-type="${t.id}">${t.label}</div>
    `).join('');

    typeRow.querySelectorAll('.chip').forEach(chip => {
        chip.onclick = () => {
            AppState.board.coreType = chip.dataset.type;
            AppState.board.thickness = null;
            AppState.board.company = null;
            AppState.board.colorCode = null;
            AppState.board.colorName = null;
            AppState.board.colorHex = null;

            typeRow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');

            renderThicknessOptions(thRow, compRow, colorRow);
        };
    });
}

function renderThicknessOptions(thRow, compRow, colorRow) {
    const core = AppState.board.coreType;
    thRow.innerHTML = '';
    compRow.innerHTML = '';
    colorRow.innerHTML = '';

    if (!core || !BoardCatalog || !BoardCatalog.catalog[core]) return;

    const thicknesses = BoardCatalog.catalog[core].thicknesses || [];
    thRow.innerHTML = thicknesses.map(t => `
        <div class="chip" data-th="${t}">${t} mm</div>
    `).join('');

    thRow.querySelectorAll('.chip').forEach(chip => {
        chip.onclick = () => {
            AppState.board.thickness = Number(chip.dataset.th);
            AppState.board.company = null;
            AppState.board.colorCode = null;
            AppState.board.colorName = null;
            AppState.board.colorHex = null;

            thRow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');

            renderCompanyOptions(compRow, colorRow);
        };
    });
}

function renderCompanyOptions(compRow, colorRow) {
    const core = AppState.board.coreType;
    const th = AppState.board.thickness;
    compRow.innerHTML = '';
    colorRow.innerHTML = '';

    if (!core || !th || !BoardCatalog) return;

    const allowedCompanies = BoardCatalog.catalog[core].companies || [];
    const pricesForCore = BoardCatalog.price_table[core] || {};
    const companies = allowedCompanies.filter(
        c => pricesForCore[th] && pricesForCore[th][c] != null
    );

    compRow.innerHTML = companies.map(c => `
        <div class="chip" data-comp="${c}">${c}</div>
    `).join('');

    compRow.querySelectorAll('.chip').forEach(chip => {
        chip.onclick = () => {
            AppState.board.company = chip.dataset.comp;
            AppState.board.colorCode = null;
            AppState.board.colorName = null;
            AppState.board.colorHex = null;

            compRow.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');

            renderColorOptions(colorRow);
        };
    });
}

function renderColorOptions(colorRow) {
    colorRow.innerHTML = '';
    if (!AppState.board.company || !BoardCatalog) return;

    const colors = BoardCatalog.colors[AppState.board.company] || [];
    colorRow.innerHTML = colors.map(col => `
        <div class="color-swatch" data-code="${col.code}">
            <div class="color-swatch-box" style="background:${col.hex || '#ffffff'}"></div>
            <span class="color-swatch-label">${col.code} - ${col.name}</span>
        </div>
    `).join('');

    colorRow.querySelectorAll('.color-swatch').forEach(sw => {
        sw.onclick = () => {
            const code = sw.dataset.code;
            const col = colors.find(c => c.code === code);
            AppState.board.colorCode = col.code;
            AppState.board.colorName = col.name;
            AppState.board.colorHex = col.hex || null;

            colorRow.querySelectorAll('.color-swatch').forEach(c => c.classList.remove('selected'));
            sw.classList.add('selected');
        };
    });
}

function initStockAndOptions() {
    document.getElementById('add-stock-row').onclick = () => {
        AppState.stockSheets.push({ length: 2440, width: 1220, qty: 1 });
        renderStockSheets();
    };
    document.getElementById('reset-stock-rows').onclick = () => {
        AppState.stockSheets = [{ length: 2440, width: 1220, qty: 10 }];
        renderStockSheets();
    };
    renderStockSheets();

    document.getElementById('opt-kerf').onchange = e => {
        AppState.options.kerf = parseFloat(e.target.value) || 0;
    };
    document.getElementById('opt-labels').onchange = e => {
        AppState.options.labelsOnPanels = e.target.checked;
    };
    document.getElementById('opt-single-sheet').onchange = e => {
        AppState.options.useSingleSheet = e.target.checked;
    };
    document.getElementById('opt-material').onchange = e => {
        AppState.options.considerMaterial = e.target.checked;
    };
    document.getElementById('opt-edgebanding').onchange = e => {
        AppState.options.edgeBanding = e.target.checked;
    };
    document.getElementById('opt-grain').onchange = e => {
        AppState.options.considerGrain = e.target.checked;
    };
}

function renderStockSheets() {
    const body = document.getElementById('stock-sheets-body');
    body.innerHTML = AppState.stockSheets.map((s, i) => `
        <tr>
            <td><input type="number" min="100" max="5000" value="${s.length}"
                oninput="updateStockSheet(${i}, 'length', this.value)"></td>
            <td><input type="number" min="100" max="5000" value="${s.width}"
                oninput="updateStockSheet(${i}, 'width', this.value)"></td>
            <td><input type="number" min="1" max="1000" value="${s.qty}"
                oninput="updateStockSheet(${i}, 'qty', this.value)"></td>
            <td style="text-align:right;">
                <button class="btn-secondary btn-small" onclick="removeStockSheet(${i})" type="button">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

window.updateStockSheet = function (idx, field, value) {
    if (!AppState.stockSheets[idx]) return;
    if (field === 'qty') {
        AppState.stockSheets[idx][field] = Math.max(1, parseInt(value) || 1);
    } else {
        AppState.stockSheets[idx][field] = Math.max(100, parseFloat(value) || 100);
    }
};

window.removeStockSheet = function (idx) {
    AppState.stockSheets.splice(idx, 1);
    if (!AppState.stockSheets.length) {
        AppState.stockSheets = [{ length: 2440, width: 1220, qty: 10 }];
    }
    renderStockSheets();
};

// =============== SUPPLY & CUSTOMER ==================
function initSupply() {
    document.querySelectorAll('.supply-card').forEach(card => {
        card.onclick = () => {
            document.querySelectorAll('.supply-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const mode = card.dataset.supply;
            AppState.supply.mode = mode;
            const cont = document.getElementById('client-qty-container');
            if (mode === 'client') cont.style.display = 'block';
            else cont.style.display = 'none';
        };
    });

    document.getElementById('client-board-qty').onchange = e => {
        AppState.supply.clientQty = parseInt(e.target.value) || 1;
    };

    const clientEdgingInput = document.getElementById('client-edging-meters');
    if (clientEdgingInput) {
        clientEdgingInput.onchange = e => {
            AppState.supply.clientEdgingMeters = parseFloat(e.target.value) || 0;
        };
    }

    document.getElementById('project-name').oninput = e => AppState.customer.projectName = e.target.value;
    document.getElementById('customer-name').oninput = e => AppState.customer.name = e.target.value;
    document.getElementById('customer-email').oninput = e => AppState.customer.email = e.target.value;
    document.getElementById('customer-phone').oninput = e => AppState.customer.phone = e.target.value;
    document.getElementById('project-notes').oninput = e => AppState.customer.notes = e.target.value;
}

// =============== OPTIMIZATION ==================
async function runOptimization() {
    const loading = document.getElementById('loading-state');
    const content = document.getElementById('results-content');
    loading.style.display = 'flex';
    content.style.display = 'none';

    const payload = buildCuttingRequestPayload();
    console.log('Optimization payload:', payload);

    currentOrder = null;
    AppState.result = null;

    try {
        const res = await fetch(API_BASE + '/api/optimize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        console.log('Raw response text:', text);

        if (!res.ok) {
            let detail = text;
            try {
                const errJson = JSON.parse(text);
                detail = errJson.detail || JSON.stringify(errJson);
            } catch (_) {}
            throw new Error(detail || `Error ${res.status}`);
        }

        const data = JSON.parse(text);
        console.log('Optimization response parsed:', data);
        AppState.result = data;
        displayResults(data);

    } catch (e) {
        console.error('Optimization error:', e);
        showToast(e.message, 'error');
        goToStep(1);
    } finally {
        loading.style.display = 'none';
        content.style.display = 'block';
    }
}

function displayResults(result) {
    document.getElementById('total-boards').textContent = result.optimization.total_boards;
    document.getElementById('total-panels').textContent = result.optimization.total_panels;
    document.getElementById('total-edging').textContent = result.optimization.total_edging_meters + 'm';
    document.getElementById('waste-percent').textContent =
        result.optimization.total_waste_percent.toFixed(1) + '%';

    // Render layout in memory, but keep it hidden until payment
    renderAdvancedLayout(result);

    // BOQ & pricing are visible immediately
    renderBOQ(result.boq);

    // Hide layout & summary before payment -> only BOQ + payment visible
    const summaryRow = document.getElementById('summary-row');
    const layoutSection = document.getElementById('layout-section');
    if (summaryRow) summaryRow.style.display = 'none';
    if (layoutSection) layoutSection.style.display = 'none';

    preparePaymentStep();

    showToast('Optimization completed. Review BOQ and proceed to payment.', 'success');
}

function buildCuttingRequestPayload() {
    return {
        panels: AppState.panels.map(p => ({
            width: p.width,
            length: p.length,
            quantity: p.quantity,
            edging: p.edging,
            alignment: p.alignment,
            label: p.label,
            notes: p.notes,
        })),
        board: {
            core_type: AppState.board.coreType,
            thickness_mm: AppState.board.thickness,
            company: AppState.board.company,
            color_code: AppState.board.colorCode,
            color_name: AppState.board.colorName,
            color_hex: AppState.board.colorHex,
        },
        supply: {
            client_supply: AppState.supply.mode === 'client',
            factory_supply: AppState.supply.mode === 'factory',
            client_board_qty: AppState.supply.mode === 'client' ? AppState.supply.clientQty : null,
            client_edging_meters: AppState.supply.mode === 'client'
                ? (AppState.supply.clientEdgingMeters || null)
                : null,
        },
        stock_sheets: AppState.stockSheets,
        options: {
            kerf: AppState.options.kerf,
            labels_on_panels: AppState.options.labelsOnPanels,
            use_single_sheet: AppState.options.useSingleSheet,
            consider_material: AppState.options.considerMaterial,
            edge_banding: AppState.options.edgeBanding,
            consider_grain: AppState.options.considerGrain,
        },
        project_name: AppState.customer.projectName,
        customer_name: AppState.customer.name,
        customer_phone: AppState.customer.phone,
        customer_email: AppState.customer.email,
        notes: AppState.customer.notes,
    };
}

// =============== ADVANCED 2D LAYOUT ==================
let layoutCurrentSheetIndex = 0;
let layoutShapes = [];
let layoutCuts = [];
let layoutActiveCutId = null;
let layoutScale = 1;
let layoutBoards = [];

function renderAdvancedLayout(result) {
    const boards =
        result.layouts ||
        (result.layout && result.layout.boards) ||
        [];

    if (!boards || !boards.length) {
        console.warn('No layouts/boards provided by backend, nothing to draw.');
        return;
    }

    layoutBoards = boards;
    layoutCurrentSheetIndex = 0;

    resizeLayoutCanvas();
    drawSheet(layoutBoards[layoutCurrentSheetIndex]);

    const tot = layoutBoards.length;
    document.getElementById('sheet-total').textContent = tot;
    document.getElementById('sheet-stat-total').textContent = tot;
    document.getElementById('sheet-index').textContent = 1;
    document.getElementById('sheet-stat-index').textContent = 1;

    document.getElementById('sheet-prev').onclick = () => {
        if (layoutCurrentSheetIndex > 0) {
            layoutCurrentSheetIndex--;
            drawSheet(layoutBoards[layoutCurrentSheetIndex]);
            document.getElementById('sheet-index').textContent = layoutCurrentSheetIndex + 1;
            document.getElementById('sheet-stat-index').textContent = layoutCurrentSheetIndex + 1;
        }
    };
    document.getElementById('sheet-next').onclick = () => {
        if (layoutCurrentSheetIndex < layoutBoards.length - 1) {
            layoutCurrentSheetIndex++;
            drawSheet(layoutBoards[layoutCurrentSheetIndex]);
            document.getElementById('sheet-index').textContent = layoutCurrentSheetIndex + 1;
            document.getElementById('sheet-stat-index').textContent = layoutCurrentSheetIndex + 1;
        }
    };

    document.getElementById('zoom-in').onclick = () => {
        layoutScale *= 1.2;
        drawSheet(layoutBoards[layoutCurrentSheetIndex]);
    };
    document.getElementById('zoom-out').onclick = () => {
        layoutScale /= 1.2;
        drawSheet(layoutBoards[layoutCurrentSheetIndex]);
    };
    document.getElementById('zoom-reset').onclick = () => {
        layoutScale = 1;
        drawSheet(layoutBoards[layoutCurrentSheetIndex]);
    };

    updateGlobalStats(result, layoutBoards);
    setupLayoutHover();
}

function resizeLayoutCanvas() {
    const canvas = document.getElementById('layout-canvas');
    if (!canvas) return;
    const cont = canvas.parentElement;
    const w = cont.clientWidth || 800;
    const h = cont.clientHeight || 400;
    canvas.width = w;
    canvas.height = h;
}

window.addEventListener('resize', () => {
    if (layoutBoards && layoutBoards.length) {
        resizeLayoutCanvas();
        drawSheet(layoutBoards[layoutCurrentSheetIndex]);
    }
});

function drawSheet(board) {
    const canvas = document.getElementById('layout-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bw = Number(board.board_width) || 1220;
    const bl = Number(board.board_length) || 2440;

    const margin = 40;
    const availW = Math.max(canvas.width - margin * 2, 50);
    const availH = Math.max(canvas.height - margin * 2, 50);

    const scaleX = availW / bw;
    const scaleY = availH / bl;
    const scale = Math.max(Math.min(scaleX, scaleY) * layoutScale, 0.01);

    const drawW = bw * scale;
    const drawH = bl * scale;
    const originX = (canvas.width - drawW) / 2;
    const originY = (canvas.height - drawH) / 2;

    layoutShapes = [];

    ctx.fillStyle = '#f3f4f6';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.fillRect(originX, originY, drawW, drawH);
    ctx.strokeRect(originX, originY, drawW, drawH);

    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Arial';
    const topText = bw.toString();
    const rightText = bl.toString();

    ctx.fillText(
        topText,
        originX + drawW / 2 - ctx.measureText(topText).width / 2,
        originY - 6
    );

    ctx.save();
    ctx.translate(originX + drawW + 6, originY + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(
        rightText,
        -ctx.measureText(rightText).width / 2,
        0
    );
    ctx.restore();

    const panels = board.panels || [];
    const colors = ['#fecaca','#bfdbfe','#bbf7d0','#fde68a','#ddd6fe','#fed7aa'];

    panels.forEach((p, i) => {
        const px = originX + p.x * scale;
        const py = originY + p.y * scale;
        const pw = p.width * scale;
        const ph = p.length * scale;
        const idx = (p.panel_index != null ? p.panel_index : i);
        const color = colors[idx % colors.length];

        layoutShapes.push({ x: px, y: py, w: pw, h: ph, data: p, color });

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(px, py, pw, ph);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, ph);

        if (Math.min(pw, ph) > 22) {
            ctx.fillStyle = '#111827';
            ctx.font = '11px Arial';
            const label = p.label || `P${idx + 1}`;
            ctx.fillText(label, px + 3, py + 12);

            const sizeText = `${p.width}×${p.length}`;
            const tw = ctx.measureText(sizeText).width;
            ctx.fillText(sizeText, px + pw / 2 - tw / 2, py + ph / 2);
        }
    });

    drawCuts(board, originX, originY, scale);
    updateSheetStats(board, bw, bl);
}

function drawCuts(board, originX, originY, scale) {
    const canvas = document.getElementById('layout-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const cuts = board.cuts || [];
    layoutCuts = cuts;

    cuts.forEach(cut => {
        const sx = originX + cut.x1 * scale;
        const sy = originY + cut.y1 * scale;
        const ex = originX + cut.x2 * scale;
        const ey = originY + cut.y2 * scale;

        ctx.save();
        if (cut.id === layoutActiveCutId) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1.5;
        }
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        const midX = (sx + ex) / 2;
        const midY = (sy + ey) / 2;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#374151';
        const lenText = cut.length.toString();

        if (cut.orientation === 'H') {
            ctx.fillText(lenText, midX - ctx.measureText(lenText).width / 2, midY - 4);
        } else {
            ctx.save();
            ctx.translate(midX + 8, midY);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(lenText, -ctx.measureText(lenText).width / 2, 0);
            ctx.restore();
        }

        ctx.restore();
    });

    const tbody = document.getElementById('cuts-body');
    if (!tbody) return;

    tbody.innerHTML = cuts.map(c => `
        <tr data-cut-id="${c.id}">
            <td>${c.id}</td>
            <td>${c.orientation}</td>
            <td>${c.orientation === 'H' ? 'y=' + c.y1 : 'x=' + c.x1}</td>
            <td>${c.length}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(row => {
        row.onmouseenter = () => {
            const id = Number(row.dataset.cutId);
            layoutActiveCutId = id;
            drawSheet(layoutBoards[layoutCurrentSheetIndex]);
        };
        row.onmouseleave = () => {
            layoutActiveCutId = null;
            drawSheet(layoutBoards[layoutCurrentSheetIndex]);
        };
    });
}

function updateGlobalStats(result, boards) {
    const usedSheets = boards.length;
    document.getElementById('stat-used-sheets').textContent = usedSheets;

    const bw = boards[0].board_width;
    const bl = boards[0].board_length;
    const boardArea = bw * bl;
    const totalBoardArea = usedSheets * boardArea;
    const used = boards.reduce((s, b) => s + b.used_area_mm2, 0);
    const waste = boards.reduce((s, b) => s + b.waste_area_mm2, 0);

    document.getElementById('stat-used-area').textContent =
        `${(used/1e4).toFixed(1)} dm² \\ ${(used/totalBoardArea*100 || 0).toFixed(0)}%`;
    document.getElementById('stat-waste-area').textContent =
        `${(waste/1e4).toFixed(1)} dm² \\ ${(waste/totalBoardArea*100 || 0).toFixed(0)}%`;
    document.getElementById('stat-total-cuts').textContent = result.optimization.total_cuts;
    document.getElementById('stat-total-cut-length').textContent = result.optimization.total_cut_length;
    document.getElementById('stat-kerf').textContent = (AppState.options.kerf || 0) + ' mm';
}

function updateSheetStats(board, bw, bl) {
    const used = board.used_area_mm2 || 0;
    const waste = board.waste_area_mm2 || 0;
    const boardArea = bw * bl || 1;
    const usedPct = (used / boardArea * 100) || 0;
    const wastePct = 100 - usedPct;

    document.getElementById('sheet-size').textContent = `${bw}×${bl}`;
    document.getElementById('sheet-used-area').textContent =
        `${(used/1e4).toFixed(1)} dm² \\ ${usedPct.toFixed(0)}%`;
    document.getElementById('sheet-waste-area').textContent =
        `${(waste/1e4).toFixed(1)} dm² \\ ${wastePct.toFixed(0)}%`;
    document.getElementById('sheet-panels').textContent =
        board.panel_count || (board.panels ? board.panels.length : 0);
}

function setupLayoutHover() {
    const canvas = document.getElementById('layout-canvas');
    const tooltip = document.getElementById('layout-tooltip');
    if (!canvas || !tooltip) return;

    canvas.onmousemove = e => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let hovered = null;
        for (const s of layoutShapes) {
            if (mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) {
                hovered = s;
                break;
            }
        }

        if (!hovered) {
            tooltip.style.display = 'none';
            return;
        }

        drawSheet(layoutBoards[layoutCurrentSheetIndex]);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(hovered.x, hovered.y, hovered.w, hovered.h);
        ctx.restore();

        const p = hovered.data;
        const idx = (p.panel_index != null ? p.panel_index : 0);
        const label = p.label || `Panel ${idx + 1}`;
        const size = `${p.width}×${p.length} mm`;
        const pos = `x=${p.x}, y=${p.y}`;

        tooltip.innerHTML = `<strong>${label}</strong><br>${size}<br>${pos}`;
        tooltip.style.left = (mx + 15) + 'px';
        tooltip.style.top = (my + 15) + 'px';
        tooltip.style.display = 'block';

        document.getElementById('panel-label').textContent = label;
        document.getElementById('panel-size').textContent = size;
        document.getElementById('panel-pos').textContent = pos;
        document.getElementById('panel-board').textContent = (layoutCurrentSheetIndex + 1);
    };

    canvas.onmouseleave = () => {
        tooltip.style.display = 'none';
    };

    canvas.onwheel = e => {
        e.preventDefault();
        const delta = e.deltaY;
        if (delta < 0) {
            layoutScale *= 1.1;
        } else {
            layoutScale /= 1.1;
        }
        drawSheet(layoutBoards[layoutCurrentSheetIndex]);
    };
}

// =============== BOQ RENDERING ==================
function renderBOQ(boq) {
    if (!boq) return;

    const body = document.getElementById('boq-panels-body');
    if (body) {
        body.innerHTML = (boq.items || []).map(item => `
            <tr>
                <td>${item.item_no}</td>
                <td>${item.description}</td>
                <td>${item.size}</td>
                <td>${item.quantity}</td>
                <td>${item.unit}</td>
                <td>${item.edges}</td>
            </tr>
        `).join('');
    }

    const m = boq.materials || {};
    const matDiv = document.getElementById('boq-materials');
    if (matDiv) {
        matDiv.innerHTML = `
            <div><strong>Board type:</strong> ${m.board_type || '-'}</div>
            <div><strong>Company:</strong> ${m.board_company || '-'}</div>
            <div><strong>Color:</strong> ${m.board_color || '-'}</div>
            <div><strong>Board size:</strong> ${m.board_size || '-'}</div>
            <div><strong>Boards required:</strong> ${m.boards_required || 0}</div>
            <div><strong>Supplied by:</strong> ${m.supplied_by || '-'}</div>
        `;
    }

    const s = boq.services || {};
    const svcDiv = document.getElementById('boq-services');
    if (svcDiv) {
        svcDiv.innerHTML = `
            <div><strong>Cutting:</strong> ${s.cutting?.boards || 0} boards × ${s.cutting?.price_per_board || 0} = ${s.cutting?.total || 0}</div>
            <div><strong>Edging:</strong> ${s.edging?.meters || 0} m × ${s.edging?.price_per_meter || 0} = ${s.edging?.total || 0}</div>
        `;
    }

    const p = boq.pricing;
    const pb = document.getElementById('boq-pricing-body');
    const pf = document.getElementById('boq-pricing-foot');
    if (pb && pf && p) {
        pb.innerHTML = (p.lines || []).map(line => `
            <tr>
                <td>${line.item}</td>
                <td>${line.description}</td>
                <td>${line.quantity} ${line.unit}</td>
                <td>${line.unit_price.toLocaleString()}</td>
                <td>${line.amount.toLocaleString()}</td>
            </tr>
        `).join('');

        pf.innerHTML = `
            <tr>
                <td colspan="4"><strong>Subtotal</strong></td>
                <td><strong>${p.subtotal.toLocaleString()} ${p.currency}</strong></td>
            </tr>
            <tr>
                <td colspan="4"><strong>${p.tax_name} (${p.tax_rate}%)</strong></td>
                <td><strong>${p.tax_amount.toLocaleString()} ${p.currency}</strong></td>
            </tr>
            <tr>
                <td colspan="4"><strong>Total</strong></td>
                <td><strong style="font-size:16px;">${p.total.toLocaleString()} ${p.currency}</strong></td>
            </tr>
        `;
    }
}

// =============== PAYMENT (STEP 2) ==================

async function ensureOrderCreated() {
    if (currentOrder) return;
    const payload = buildCuttingRequestPayload();
    const res = await fetch(API_BASE + '/api/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error('Order create failed: ' + text);
    }
    currentOrder = await res.json();
    console.log('Order created:', currentOrder);
}

function preparePaymentStep() {
    const res = AppState.result;
    if (!res) return;

    const pricing = res.boq.pricing;
    const payOrderIdEl = document.getElementById('pay-order-id');
    const payAmountEl = document.getElementById('pay-order-amount');
    const payStatusEl = document.getElementById('pay-order-status');
    const receiptRow = document.getElementById('pay-order-receipt');
    const statusDiv = document.getElementById('mpesa-status');

    const nameInput = document.getElementById('pay-customer-name');
    const waInput = document.getElementById('pay-customer-whatsapp');
    const emailInput = document.getElementById('pay-customer-email');

    if (nameInput) nameInput.value = AppState.customer.name || '';
    if (waInput) waInput.value = AppState.customer.phone || '';
    if (emailInput) emailInput.value = AppState.customer.email || '';

    if (nameInput) nameInput.oninput = e => AppState.customer.name = e.target.value;
    if (waInput) waInput.oninput = e => AppState.customer.phone = e.target.value;
    if (emailInput) emailInput.oninput = e => AppState.customer.email = e.target.value;

    if (currentOrder) {
        payOrderIdEl.textContent = currentOrder.order_id;
        payAmountEl.textContent = `${currentOrder.amount} ${currentOrder.currency}`;
        payStatusEl.textContent = 'Pending';
    } else {
        payOrderIdEl.textContent = '-';
        payAmountEl.textContent = `${pricing.total.toLocaleString()} ${pricing.currency}`;
        payStatusEl.textContent = 'Not created';
    }

    receiptRow.style.display = 'none';
    statusDiv.textContent = 'Waiting for payment...';
    statusDiv.style.color = '#6b7280';

    const mpesaInput = document.getElementById('mpesa-phone');
    if (mpesaInput && AppState.customer.phone) {
        let p = AppState.customer.phone.replace(/\s+/g, '');
        if (p.startsWith('+')) p = p.substring(1);
        if (p.startsWith('0')) p = '254' + p.substring(1);
        mpesaInput.value = p;
    }

    const payBtn = document.getElementById('mpesa-pay-btn');
    payBtn.onclick = () => {
        startMpesaPayment();
    };
}

async function startMpesaPayment() {
    const mpesaPhone = document.getElementById('mpesa-phone').value.trim();
    const statusDiv = document.getElementById('mpesa-status');
    const payStatusEl = document.getElementById('pay-order-status');

    if (!AppState.customer.name) {
        showToast('Please enter your name', 'error');
        return;
    }
    if (!AppState.customer.phone) {
        showToast('Please enter your WhatsApp/contact number', 'error');
        return;
    }
    if (!AppState.customer.email) {
        showToast('Please enter your email', 'error');
        return;
    }

    if (!mpesaPhone || !/^2547\d{8}$/.test(mpesaPhone)) {
        showToast('Enter valid Mpesa phone (2547XXXXXXXX)', 'error');
        return;
    }

    try {
        statusDiv.textContent = 'Creating order...';
        statusDiv.style.color = '#6b7280';

        await ensureOrderCreated();

        document.getElementById('pay-order-id').textContent = currentOrder.order_id;
        document.getElementById('pay-order-amount').textContent =
            `${currentOrder.amount} ${currentOrder.currency}`;
        payStatusEl.textContent = 'Pending';

        statusDiv.textContent = 'Sending M‑Pesa STK push...';
        const mpesaRes = await fetch(API_BASE + '/api/mpesa/initiate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                order_id: currentOrder.order_id,
                phone_number: mpesaPhone,
            }),
        });
        if (!mpesaRes.ok) {
            const text = await mpesaRes.text();
            throw new Error('Mpesa initiate failed: ' + text);
        }
        const mpesaData = await mpesaRes.json();
        console.log('Mpesa initiate:', mpesaData);

        statusDiv.textContent = mpesaData.message || 'STK push sent. Check your phone and enter PIN.';

        pollPaymentStatus(currentOrder.order_id, statusDiv);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
        statusDiv.textContent = 'Payment error: ' + e.message;
        statusDiv.style.color = '#dc2626';
        payStatusEl.textContent = 'Failed';
    }
}

async function pollPaymentStatus(orderId, statusDiv) {
    let attempts = 0;
    const maxAttempts = 20;

    const payStatusEl = document.getElementById('pay-order-status');
    const receiptRow = document.getElementById('pay-order-receipt');
    const receiptValue = document.getElementById('pay-receipt-value');

    const interval = setInterval(async () => {
        attempts++;
        try {
            const res = await fetch(API_BASE + `/api/payment/status?order_id=${encodeURIComponent(orderId)}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text);
            }
            const data = await res.json();
            console.log('Payment status:', data);

            if (data.status === 'paid') {
                clearInterval(interval);
                statusDiv.textContent = `Payment successful! Receipt: ${data.mpesa_receipt || '-'}`;
                statusDiv.style.color = '#16a34a';
                showToast('Payment approved, order confirmed', 'success');

                payStatusEl.textContent = 'Paid';
                receiptRow.style.display = 'block';
                receiptValue.textContent = data.mpesa_receipt || '-';

                // Show layout & summary now that payment is done
                const summaryRow = document.getElementById('summary-row');
                const layoutSection = document.getElementById('layout-section');
                if (summaryRow) summaryRow.style.display = 'grid';
                if (layoutSection) layoutSection.style.display = 'grid';

                // Notify backend to send email/WhatsApp
                sendNotificationsAfterPayment(orderId);

                return;
            } else if (data.status === 'failed') {
                clearInterval(interval);
                const reason = data.status_reason || 'Payment failed.';
                statusDiv.textContent = reason;
                statusDiv.style.color = '#dc2626';
                showToast('Payment failed', 'error');

                payStatusEl.textContent = 'Failed';
                return;
            } else {
                statusDiv.textContent = `Waiting for payment... (status=${data.status})`;
                statusDiv.style.color = '#6b7280';
            }
        } catch (e) {
            console.error(e);
            clearInterval(interval);
            statusDiv.textContent = 'Error checking payment status: ' + e.message;
            statusDiv.style.color = '#dc2626';
            showToast('Payment status check failed', 'error');
        }

        if (attempts >= maxAttempts) {
            clearInterval(interval);
            statusDiv.textContent = 'Payment timeout. Please try again.';
            statusDiv.style.color = '#d97706';
            showToast('Payment timeout', 'error');
            payStatusEl.textContent = 'Timeout';
        }
    }, 3000);
}

async function sendNotificationsAfterPayment(orderId) {
    try {
        const payload = {
            order_id: orderId,
            project_name: AppState.customer.projectName,
            customer_name: AppState.customer.name,
            customer_email: AppState.customer.email,
            customer_phone: AppState.customer.phone,
        };

        const res = await fetch(API_BASE + '/api/notify/after-payment', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('Notification error:', text);
            showToast('Payment done, but failed to send email/WhatsApp automatically.', 'error');
            return;
        }

        const data = await res.json();
        console.log('Notifications sent:', data);
    } catch (e) {
        console.error('Notification error:', e);
        showToast('Payment done, but failed to send email/WhatsApp automatically.', 'error');
    }
}

// =============== TOASTS ==================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    div.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}