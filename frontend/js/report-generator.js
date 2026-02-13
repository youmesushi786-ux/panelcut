/**
 * Report Generator Module
 * Generates PDF reports and handles printing
 */

const ReportGenerator = {
    /**
     * Generate HTML report content
     */
    generateHTMLReport(data) {
        const { request_summary, optimization, edging, boq, layouts, diagrams, report_id, generated_at } = data;
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Panel Cutting Report - ${report_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #333; line-height: 1.5; }
        .report { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #00d4ff; padding-bottom: 15px; margin-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #00d4ff; }
        .report-info { text-align: right; font-size: 11px; color: #666; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 14px; font-weight: bold; color: #00d4ff; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .summary-item { background: #f8f9fa; padding: 10px; border-radius: 5px; text-align: center; }
        .summary-value { font-size: 24px; font-weight: bold; color: #00d4ff; }
        .summary-label { font-size: 10px; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; }
        .text-right { text-align: right; }
        .total-row { font-weight: bold; background: #e8f4fd; }
        .grand-total { font-size: 16px; color: #00d4ff; }
        .diagram { margin: 10px 0; page-break-inside: avoid; }
        .diagram-title { font-weight: bold; margin-bottom: 5px; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #666; }
        @media print {
            body { font-size: 11px; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="report">
        <div class="header">
            <div class="logo">PANEL PRO</div>
            <div class="report-info">
                <div><strong>Report ID:</strong> ${report_id}</div>
                <div><strong>Date:</strong> ${new Date(generated_at).toLocaleDateString()}</div>
                <div><strong>Project:</strong> ${boq.project_name || 'N/A'}</div>
                <div><strong>Customer:</strong> ${boq.customer_name || 'N/A'}</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">OPTIMIZATION SUMMARY</div>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-value">${optimization.total_boards}</div>
                    <div class="summary-label">Boards Needed</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${optimization.total_panels}</div>
                    <div class="summary-label">Total Panels</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${optimization.total_edging_meters}m</div>
                    <div class="summary-label">Edge Banding</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${optimization.total_waste_percent}%</div>
                    <div class="summary-label">Waste</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">BILL OF QUANTITIES</div>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Size (mm)</th>
                        <th>Qty</th>
                        <th>Edges</th>
                    </tr>
                </thead>
                <tbody>
                    ${boq.items.map((item, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${item.description}</td>
                            <td>${item.size}</td>
                            <td>${item.quantity}</td>
                            <td>${item.edges}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="section">
            <div class="section-title">PRICING BREAKDOWN</div>
            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th class="text-right">Qty</th>
                        <th class="text-right">Unit Price</th>
                        <th class="text-right">Amount (KES)</th>
                    </tr>
                </thead>
                <tbody>
                    ${boq.pricing.lines.map(line => `
                        <tr>
                            <td>${line.item}</td>
                            <td>${line.description}</td>
                            <td class="text-right">${line.quantity} ${line.unit}</td>
                            <td class="text-right">${UI.formatNumber(line.unit_price)}</td>
                            <td class="text-right">${UI.formatNumber(line.amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="4">Subtotal</td>
                        <td class="text-right">${UI.formatNumber(boq.pricing.subtotal)}</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="4">${boq.pricing.tax_name} (${boq.pricing.tax_rate}%)</td>
                        <td class="text-right">${UI.formatNumber(boq.pricing.tax_amount)}</td>
                    </tr>
                    <tr class="total-row grand-total">
                        <td colspan="4">TOTAL</td>
                        <td class="text-right">KES ${UI.formatNumber(boq.pricing.total)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        
        <div class="section">
            <div class="section-title">CUTTING LAYOUTS</div>
            ${diagrams.map((svg, i) => `
                <div class="diagram">
                    <div class="diagram-title">Board ${i + 1} - Efficiency: ${layouts[i].efficiency_percent.toFixed(1)}%</div>
                    ${svg}
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            <p><strong>Panel Pro Cutters Ltd</strong></p>
            <p>Industrial Area, Nairobi | +254 700 123 456 | info@panelpro.co.ke</p>
            <p>This is a computer-generated document. Prices are valid for 7 days.</p>
        </div>
    </div>
</body>
</html>
        `;
    },
    
    /**
     * Print report
     */
    printReport(data) {
        const html = this.generateHTMLReport(data);
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(html);
        printWindow.document.close();
        
        printWindow.onload = function() {
            printWindow.focus();
            printWindow.print();
        };
    },
    
    /**
     * Download as PDF (using browser print)
     */
    downloadPDF(data) {
        const html = this.generateHTMLReport(data);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `cutting-report-${data.report_id}.html`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        UI.toast('Report downloaded! Open in browser and use Print to save as PDF.', 'info');
    },
    
    /**
     * Share report
     */
    async shareReport(data) {
        const text = `Panel Cutting Report - ${data.report_id}
Project: ${data.boq.project_name || 'N/A'}
Boards: ${data.optimization.total_boards}
Total: KES ${UI.formatNumber(data.boq.pricing.total)}`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Panel Cutting Report',
                    text: text,
                });
                UI.success('Report shared successfully!');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    this.copyToClipboard(text);
                }
            }
        } else {
            this.copyToClipboard(text);
        }
    },
    
    /**
     * Copy to clipboard
     */
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            UI.success('Report summary copied to clipboard!');
        }).catch(() => {
            UI.error('Failed to copy to clipboard');
        });
    },
};

// Export
window.ReportGenerator = ReportGenerator;