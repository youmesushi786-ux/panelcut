/**
 * 3D Viewer Module using Three.js
 * Renders cutting layouts in interactive 3D
 */

class ThreeViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = document.getElementById('three-canvas');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.boardGroup = null;
        this.currentBoardIndex = 0;
        this.layouts = [];
        this.is3D = true;
        this.isFullscreen = false;
        
        // Panel colors palette
        this.colors = [
            0x4CAF50, 0x2196F3, 0xFF9800, 0x9C27B0, 0xF44336,
            0x00BCD4, 0x8BC34A, 0xFF5722, 0x673AB7, 0x3F51B5,
            0x009688, 0xFFC107, 0xE91E63, 0x795548, 0x607D8B
        ];
        
        this.init();
    }
    
    init() {
        if (!this.container || !this.canvas) return;
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);
        
        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
        this.camera.position.set(800, 1200, 1500);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Controls
        if (THREE.OrbitControls) {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.minDistance = 500;
            this.controls.maxDistance = 3000;
            this.controls.target.set(610, 0, 1220);
        }
        
        // Lighting
        this.setupLighting();
        
        // Grid helper
        this.addGrid();
        
        // Handle resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Start animation loop
        this.animate();
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Main directional light
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(1000, 2000, 1500);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 100;
        mainLight.shadow.camera.far = 5000;
        mainLight.shadow.camera.left = -2000;
        mainLight.shadow.camera.right = 2000;
        mainLight.shadow.camera.top = 2000;
        mainLight.shadow.camera.bottom = -2000;
        this.scene.add(mainLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0x00d4ff, 0.3);
        fillLight.position.set(-1000, 500, -1000);
        this.scene.add(fillLight);
        
        // Rim light
        const rimLight = new THREE.DirectionalLight(0x7c3aed, 0.2);
        rimLight.position.set(0, -500, 0);
        this.scene.add(rimLight);
    }
    
    addGrid() {
        const gridHelper = new THREE.GridHelper(4000, 40, 0x333333, 0x222222);
        gridHelper.position.y = -10;
        this.scene.add(gridHelper);
    }
    
    handleResize() {
        if (!this.container) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Load layouts from API response
     */
    loadLayouts(layouts, boardWidth = 1220, boardLength = 2440) {
        this.layouts = layouts;
        this.boardWidth = boardWidth;
        this.boardLength = boardLength;
        this.currentBoardIndex = 0;
        
        this.renderBoard(0);
        this.updateLegend();
    }
    
    /**
     * Render a specific board
     */
    renderBoard(index) {
        if (!this.layouts || !this.layouts[index]) return;
        
        // Clear previous board
        if (this.boardGroup) {
            this.scene.remove(this.boardGroup);
            this.boardGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        this.boardGroup = new THREE.Group();
        
        const layout = this.layouts[index];
        const boardThickness = 18;
        
        // Create board base
        this.createBoard(boardThickness);
        
        // Create panels
        layout.panels.forEach((panel, panelIndex) => {
            this.createPanel(panel, panelIndex, boardThickness);
        });
        
        this.scene.add(this.boardGroup);
        this.currentBoardIndex = index;
        
        // Reset camera
        this.resetCamera();
    }
    
    createBoard(thickness) {
        const geometry = new THREE.BoxGeometry(this.boardWidth, thickness, this.boardLength);
        const material = new THREE.MeshStandardMaterial({
            color: 0xfff8e1,
            roughness: 0.8,
            metalness: 0.1,
        });
        
        const board = new THREE.Mesh(geometry, material);
        board.position.set(this.boardWidth / 2, -thickness / 2, this.boardLength / 2);
        board.receiveShadow = true;
        
        // Board outline
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        wireframe.position.copy(board.position);
        
        this.boardGroup.add(board);
        this.boardGroup.add(wireframe);
    }
    
    createPanel(panelData, index, boardThickness) {
        const { x, y, width, length, panel_index, label, rotated } = panelData;
        
        const panelHeight = 10;
        const color = this.colors[panel_index % this.colors.length];
        
        // Panel geometry
        const geometry = new THREE.BoxGeometry(width, panelHeight, length);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.2,
        });
        
        const panel = new THREE.Mesh(geometry, material);
        panel.position.set(
            x + width / 2,
            panelHeight / 2,
            y + length / 2
        );
        panel.castShadow = true;
        panel.receiveShadow = true;
        
        // Panel edges
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        wireframe.position.copy(panel.position);
        
        // Store data for interaction
        panel.userData = {
            label: label || `Panel ${panel_index + 1}`,
            width: width,
            length: length,
            rotated: rotated,
        };
        
        this.boardGroup.add(panel);
        this.boardGroup.add(wireframe);
        
        // Add label sprite if 3D
        if (this.is3D) {
            this.addLabelSprite(panel.position, label || `P${panel_index + 1}`, panelHeight);
        }
    }
    
    addLabelSprite(position, text, height) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = 'bold 20px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        
        sprite.position.set(position.x, position.y + height + 20, position.z);
        sprite.scale.set(60, 30, 1);
        
        this.boardGroup.add(sprite);
    }
    
    /**
     * Update the legend
     */
    updateLegend() {
        const legendContainer = document.getElementById('viewer-legend');
        if (!legendContainer || !this.layouts.length) return;
        
        const layout = this.layouts[this.currentBoardIndex];
        const uniquePanels = new Map();
        
        layout.panels.forEach(panel => {
            const key = panel.panel_index;
            if (!uniquePanels.has(key)) {
                uniquePanels.set(key, {
                    label: panel.label || `Panel ${key + 1}`,
                    width: panel.width,
                    length: panel.length,
                    color: this.colors[key % this.colors.length],
                    count: 1,
                });
            } else {
                uniquePanels.get(key).count++;
            }
        });
        
        let html = '<div class="legend-title">Panel Legend</div>';
        
        uniquePanels.forEach((data, key) => {
            const colorHex = '#' + data.color.toString(16).padStart(6, '0');
            html += `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${colorHex}"></div>
                    <span class="legend-label">${data.label}</span>
                    <span class="legend-size">${data.width}×${data.length} (${data.count})</span>
                </div>
            `;
        });
        
        legendContainer.innerHTML = html;
    }
    
    /**
     * Navigate to next board
     */
    nextBoard() {
        if (this.currentBoardIndex < this.layouts.length - 1) {
            this.renderBoard(this.currentBoardIndex + 1);
            this.updateLegend();
            return this.currentBoardIndex;
        }
        return this.currentBoardIndex;
    }
    
    /**
     * Navigate to previous board
     */
    prevBoard() {
        if (this.currentBoardIndex > 0) {
            this.renderBoard(this.currentBoardIndex - 1);
            this.updateLegend();
            return this.currentBoardIndex;
        }
        return this.currentBoardIndex;
    }
    
    /**
     * Reset camera to default position
     */
    resetCamera() {
        this.camera.position.set(800, 1200, 1500);
        if (this.controls) {
            this.controls.target.set(this.boardWidth / 2, 0, this.boardLength / 2);
            this.controls.update();
        }
    }
    
    /**
     * Toggle between 2D and 3D views
     */
    toggle2D3D() {
        this.is3D = !this.is3D;
        
        if (this.is3D) {
            // 3D perspective view
            this.camera.position.set(800, 1200, 1500);
        } else {
            // Top-down 2D view
            this.camera.position.set(this.boardWidth / 2, 2000, this.boardLength / 2);
            this.camera.lookAt(this.boardWidth / 2, 0, this.boardLength / 2);
        }
        
        if (this.controls) {
            this.controls.target.set(this.boardWidth / 2, 0, this.boardLength / 2);
            this.controls.update();
        }
        
        return this.is3D;
    }
    
    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        this.isFullscreen = !this.isFullscreen;
        this.container.classList.toggle('fullscreen', this.isFullscreen);
        
        setTimeout(() => this.handleResize(), 100);
        
        return this.isFullscreen;
    }
    
    /**
     * Generate 2D SVG for a layout
     */
    generateSVG(layout, scale = 0.25) {
        const { board_width, board_length } = layout;
        const w = this.boardWidth * scale;
        const h = this.boardLength * scale;
        const margin = 10;
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w + margin * 2} ${h + margin * 2}" width="${w + margin * 2}" height="${h + margin * 2}">`;
        
        // Background
        svg += `<rect x="${margin}" y="${margin}" width="${w}" height="${h}" fill="#fff8e1" stroke="#333" stroke-width="2"/>`;
        
        // Panels
        layout.panels.forEach(panel => {
            const color = '#' + this.colors[panel.panel_index % this.colors.length].toString(16).padStart(6, '0');
            const x = margin + panel.x * scale;
            const y = margin + panel.y * scale;
            const pw = panel.width * scale;
            const ph = panel.length * scale;
            
            svg += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="${color}" fill-opacity="0.8" stroke="#333" stroke-width="1"/>`;
            
            // Label
            if (pw > 30 && ph > 20) {
                const label = panel.label || `P${panel.panel_index + 1}`;
                svg += `<text x="${x + pw/2}" y="${y + ph/2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="10" fill="#000">${label}</text>`;
            }
        });
        
        svg += '</svg>';
        return svg;
    }
    
    /**
     * Cleanup
     */
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.controls) {
            this.controls.dispose();
        }
        window.removeEventListener('resize', this.handleResize);
    }
}

// Export
window.ThreeViewer = ThreeViewer;