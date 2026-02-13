/**
 * API Communication Module
 * Handles all communication with the backend API
 */

const API = {
    // Base URL - change this for production
    baseURL: 'http://localhost:8000',
    
    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            },
        };
        
        try {
            const response = await fetch(url, mergedOptions);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(
                    errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    errorData
                );
            }
            
            return await response.json();
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(
                error.message || 'Network error. Please check your connection.',
                0,
                null
            );
        }
    },
    
    /**
     * Health check
     */
    async healthCheck() {
        return this.request('/health');
    },
    
    /**
     * Get pricing configuration
     */
    async getPricing() {
        return this.request('/api/pricing');
    },
    
    /**
     * Optimize cutting layout
     */
    async optimize(data) {
        return this.request('/api/optimize', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    /**
     * Format request data for API
     */
    formatRequest(appData) {
        const { panels, board, supply, customer } = appData;
        
        return {
            panels: panels.map(panel => ({
                width: parseFloat(panel.width),
                length: parseFloat(panel.length),
                quantity: parseInt(panel.quantity),
                edging: {
                    left: panel.edging.left || false,
                    right: panel.edging.right || false,
                    top: panel.edging.top || false,
                    bottom: panel.edging.bottom || false,
                },
                alignment: panel.alignment || 'none',
                label: panel.label || null,
                notes: panel.notes || null,
            })),
            board: {
                board_type: board.type,
                color: board.color,
            },
            supply: {
                client_supply: supply.mode === 'client',
                factory_supply: supply.mode === 'factory',
                client_board_qty: supply.mode === 'client' ? parseInt(supply.clientQty) : null,
            },
            project_name: customer.projectName || null,
            customer_name: customer.name || null,
            customer_phone: customer.phone || null,
            notes: customer.notes || null,
        };
    },
};

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

// Export for use in other modules
window.API = API;
window.APIError = APIError;