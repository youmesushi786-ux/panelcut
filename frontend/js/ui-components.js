/**
 * UI Components Module
 * Reusable UI components and utilities
 */

const UI = {
    /**
     * Show toast notification
     */
    toast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    /**
     * Show success toast
     */
    success(message) {
        this.toast(message, 'success');
    },
    
    /**
     * Show error toast
     */
    error(message) {
        this.toast(message, 'error', 6000);
    },
    
    /**
     * Show warning toast
     */
    warning(message) {
        this.toast(message, 'warning');
    },
    
    /**
     * Format number with commas
     */
    formatNumber(num, decimals = 0) {
        return Number(num).toLocaleString('en-KE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    },
    
    /**
     * Format currency
     */
    formatCurrency(amount, currency = 'KES') {
        return `${currency} ${this.formatNumber(amount, 2)}`;
    },
    
    /**
     * Animate counter
     */
    animateCounter(element, target, duration = 1000) {
        const start = 0;
        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeOut = 1 - Math.pow(1 - progress, 3);
            
            const current = Math.floor(start + (target - start) * easeOut);
            element.textContent = this.formatNumber(current);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = this.formatNumber(target);
            }
        };
        
        requestAnimationFrame(update);
    },
    
    /**
     * Create loading skeleton
     */
    skeleton(type = 'text') {
        const div = document.createElement('div');
        div.className = `skeleton skeleton-${type}`;
        return div;
    },
    
    /**
     * Show confirmation dialog
     */
    async confirm(message, title = 'Confirm') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.innerHTML = `
                <div class="modal-content glass-card" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-question-circle"></i> ${title}</h3>
                    </div>
                    <div class="modal-body">
                        <p style="text-align: center; font-size: 16px;">${message}</p>
                    </div>
                    <div class="modal-footer" style="justify-content: center;">
                        <button class="btn-secondary" id="confirm-cancel">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button class="btn-primary" id="confirm-ok">
                            <i class="fas fa-check"></i> Confirm
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            overlay.querySelector('#confirm-ok').onclick = () => {
                overlay.remove();
                resolve(true);
            };
            
            overlay.querySelector('#confirm-cancel').onclick = () => {
                overlay.remove();
                resolve(false);
            };
        });
    },
    
    /**
     * Create panel preview element
     */
    createPanelPreview(width, length, maxSize = 80) {
        const aspectRatio = width / length;
        let previewWidth, previewHeight;
        
        if (aspectRatio > 1) {
            previewWidth = maxSize * 0.8;
            previewHeight = previewWidth / aspectRatio;
        } else {
            previewHeight = maxSize * 0.8;
            previewWidth = previewHeight * aspectRatio;
        }
        
        return `
            <div class="preview-rect" style="
                width: ${previewWidth}px;
                height: ${previewHeight}px;
            "></div>
        `;
    },
    
    /**
     * Validate panel dimensions
     */
    validatePanelDimensions(width, length, maxWidth = 1220, maxLength = 2440) {
        const errors = [];
        
        if (!width || width <= 0) {
            errors.push('Width must be greater than 0');
        }
        if (!length || length <= 0) {
            errors.push('Length must be greater than 0');
        }
        if (width > maxWidth && length > maxWidth) {
            errors.push(`Panel is too wide. Maximum width is ${maxWidth}mm`);
        }
        if (length > maxLength && width > maxLength) {
            errors.push(`Panel is too long. Maximum length is ${maxLength}mm`);
        }
        
        return errors;
    },
    
    /**
     * Generate unique ID
     */
    generateId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    },
    
    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    /**
     * Add ripple effect to element
     */
    addRipple(element) {
        element.classList.add('ripple');
        
        element.addEventListener('click', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    },
};

// Export
window.UI = UI;