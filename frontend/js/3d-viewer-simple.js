// 3D Viewer Implementation
class Simple3DViewer {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.boards = [];
        this.currentBoardIndex = 0;
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        console.log('Initializing 3D viewer...');
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        
        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 10000);
        this.camera.position.set(1500, 1500, 1500);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.innerHTML = ''; // Clear container
        this.container.appendChild(this.renderer.domElement);
        
        // Controls
        if (THREE.OrbitControls) {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
        }
        
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight.position.set(1000, 1000, 1000);
        this.scene.add(directionalLight);
        
        // Grid
        const gridHelper = new THREE.GridHelper(3000, 30, 0x444444, 0x222222);
        this.scene.add(gridHelper);
        
        // Start animation
        this.animate();
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
        
        console.log('3D viewer initialized!');
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    onResize() {
        if (!this.container) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    loadLayouts(layouts) {
        console.log('Loading layouts into 3D viewer:', layouts);
        this.boards = layouts;
        this.currentBoardIndex = 0;
        this.showBoard(0);
    }
    
    showBoard(index) {
        if (!this.boards || !this.boards[index]) return;
        
        // Clear previous board
        while(this.scene.children.length > 2) { // Keep lights and grid
            const child = this.scene.children[this.scene.children.length - 1];
            if (child.type === 'GridHelper' || child.type === 'Light') continue;
            this.scene.remove(child);
        }
        
        const layout = this.boards[index];
        const boardGroup = new THREE.Group();
        
        // Board dimensions (in mm)
        const boardWidth = 1220;
        const boardLength = 2440;
        const boardThickness = 18;
        
        // Create main board (base)
        const boardGeometry = new THREE.BoxGeometry(boardWidth, boardThickness, boardLength);
        const boardMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xf4e5d3,
            specular: 0x222222,
            shininess: 10
        });
        const board = new THREE.Mesh(boardGeometry, boardMaterial);
        board.position.y = -boardThickness / 2;
        boardGroup.add(board);
        
        // Add board edges
        const edgesGeometry = new THREE.EdgesGeometry(boardGeometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const boardEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        boardEdges.position.copy(board.position);
        boardGroup.add(boardEdges);
        
        // Panel colors
        const colors = [0x4CAF50, 0x2196F3, 0xFF9800, 0x9C27B0, 0xF44336, 
                       0x00BCD4, 0x8BC34A, 0xFF5722, 0x673AB7, 0x3F51B5];
        
        // Add panels
        layout.panels.forEach((panel, i) => {
            const panelHeight = 10;
            const panelGeometry = new THREE.BoxGeometry(
                panel.width,
                panelHeight,
                panel.length
            );
            
            const panelMaterial = new THREE.MeshPhongMaterial({
                color: colors[panel.panel_index % colors.length],
                specular: 0x111111,
                shininess: 30,
                opacity: 0.9,
                transparent: true
            });
            
            const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
            
            // Position panel on board
            panelMesh.position.set(
                panel.x + panel.width / 2 - boardWidth / 2,
                panelHeight / 2 + 1,
                panel.y + panel.length / 2 - boardLength / 2
            );
            
            boardGroup.add(panelMesh);
            
            // Add panel edges
            const panelEdgesGeometry = new THREE.EdgesGeometry(panelGeometry);
            const panelEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
            const panelEdges = new THREE.LineSegments(panelEdgesGeometry, panelEdgesMaterial);
            panelEdges.position.copy(panelMesh.position);
            boardGroup.add(panelEdges);
            
            // Add label sprite
            const label = this.createTextSprite(`P${panel.panel_index + 1}`, panel.label);
            label.position.set(
                panelMesh.position.x,
                panelMesh.position.y + panelHeight,
                panelMesh.position.z
            );
            boardGroup.add(label);
        });
        
        this.scene.add(boardGroup);
        
        // Update camera to look at board
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
        
        // Update board counter
        this.currentBoardIndex = index;
        const currentBoardEl = document.getElementById('current-board');
        const totalBoardsEl = document.getElementById('total-board-count');
        if (currentBoardEl) currentBoardEl.textContent = (index + 1).toString();
        if (totalBoardsEl) totalBoardsEl.textContent = this.boards.length.toString();
    }
    
    createTextSprite(text, label) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Background
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Text
        context.font = 'Bold 20px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label || text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(100, 25, 1);
        
        return sprite;
    }
    
    nextBoard() {
        if (this.currentBoardIndex < this.boards.length - 1) {
            this.showBoard(this.currentBoardIndex + 1);
        }
    }
    
    prevBoard() {
        if (this.currentBoardIndex > 0) {
            this.showBoard(this.currentBoardIndex - 1);
        }
    }
    
    reset() {
        this.camera.position.set(1500, 1500, 1500);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }
}

// Initialize 3D viewer globally
window.viewer3D = null;

// Update the displayResults function to use 3D viewer
function displayResults(result) {
    const loadingState = document.getElementById('loading-state');
    const resultsContent = document.getElementById('results-content');
    
    if (loadingState) loadingState.style.display = 'none';
    if (resultsContent) resultsContent.style.display = 'block';
    
    // Update summary cards
    document.getElementById('total-boards').textContent = result.optimization.total_boards;
    document.getElementById('total-panels').textContent = result.optimization.total_panels;
    document.getElementById('total-edging').textContent = result.optimization.total_edging_meters + 'm';
    document.getElementById('waste-percent').textContent = result.optimization.total_waste_percent.toFixed(1) + '%';
    
    // Initialize 3D viewer if not already done
    if (!window.viewer3D) {
        window.viewer3D = new Simple3DViewer('viewer-container');
    }
    
    // Load layouts into 3D viewer
    if (result.layouts && window.viewer3D) {
        window.viewer3D.loadLayouts(result.layouts);
    } else {
        // Fallback to SVG if 3D viewer fails
        const viewerContainer = document.getElementById('viewer-container');
        if (viewerContainer && result.diagrams && result.diagrams.length > 0) {
            viewerContainer.innerHTML = '';
            const diagramDiv = document.createElement('div');
            diagramDiv.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #fff; padding: 20px;';
            diagramDiv.innerHTML = result.diagrams[0];
            viewerContainer.appendChild(diagramDiv);
        }
    }
    
    // Setup navigation buttons for 3D viewer
    const prevBtn = document.getElementById('prev-board');
    const nextBtn = document.getElementById('next-board');
    const resetBtn = document.getElementById('reset-view');
    
    if (prevBtn) {
        prevBtn.onclick = function() {
            if (window.viewer3D) {
                window.viewer3D.prevBoard();
            }
        };
    }
    
    if (nextBtn) {
        nextBtn.onclick = function() {
            if (window.viewer3D) {
                window.viewer3D.nextBoard();
            }
        };
    }
    
    if (resetBtn) {
        resetBtn.onclick = function() {
            if (window.viewer3D) {
                window.viewer3D.reset();
            }
        };
    }
    
    // Display pricing
    if (result.boq && result.boq.pricing) {
        displayPricing(result.boq.pricing);
    }
    
    // Display BOQ
    if (result.boq) {
        displayBOQ(result.boq);
    }
    
    // Display all layouts in grid
    const layoutsGrid = document.getElementById('layouts-grid');
    if (layoutsGrid && result.diagrams) {
        layoutsGrid.innerHTML = result.layouts.map((layout, i) => {
            const efficiency = layout.efficiency_percent || 0;
            const effClass = efficiency >= 80 ? 'good' : efficiency >= 60 ? 'medium' : 'poor';
            
            return `
                <div class="layout-card" onclick="window.viewer3D && window.viewer3D.showBoard(${i})">
                    <div class="layout-card-header">
                        <h4>Board ${layout.board_number || i + 1}</h4>
                        <span class="efficiency ${effClass}">${efficiency.toFixed(1)}%</span>
                    </div>
                    <div class="layout-card-preview" style="background: white; padding: 10px; cursor: pointer;">
                        ${result.diagrams[i] || '<p>Click to view in 3D</p>'}
                    </div>
                    <div class="layout-card-footer">
                        <span><i class="fas fa-vector-square"></i> ${layout.panel_count || layout.panels.length} panels</span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    showToast('Optimization completed! Use mouse to rotate 3D view.', 'success');
}

console.log('3D Viewer code loaded!');