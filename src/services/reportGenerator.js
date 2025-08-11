// services/reportGenerator.js
const fs = require('fs').promises;
const path = require('path');

class ReportGenerator {
    constructor() {
        this.outputDir = "reports";
        this.gstRate = 0.10;
    }

    /**
     * Generate report in specified format
     */
    async generateReport(estimationData, format, projectId) {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });

            switch (format.toLowerCase()) {
                case "html":
                    // This now directly returns the content object
                    return await this._generateHtmlReport(estimationData, projectId);
                case "json":
                    // This would need to be updated to return content as well
                    const jsonPath = await this._generateJsonReport(estimationData, projectId);
                    const jsonContent = await fs.readFile(jsonPath, 'utf8');
                    return { content: jsonContent, type: 'application/json' };
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
        } catch (error) {
            console.error(`Report generation error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate comprehensive HTML report
     * FIX: This function now returns the HTML content directly.
     */
    async _generateHtmlReport(data, projectId) {
        const reportDate = new Date().toLocaleDateString('en-AU', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // The full HTML content is assembled here.
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Structural Cost Estimation Report - ${projectId}</title>
    <style>
        /* Styles remain the same, they are correct */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #2c3e50; background: #f8f9fa; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; }
        .header h1 { font-size: 2.5rem; }
        .report-meta { background: #e8f4f8; padding: 30px; border-bottom: 3px solid #667eea; }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .meta-item { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .meta-label { font-weight: 600; color: #495057; text-transform: uppercase; font-size: 0.9rem; }
        .meta-value { font-size: 1.1rem; }
        .meta-value.total { font-size: 1.8rem; font-weight: 700; color: #27ae60; }
        .content { padding: 40px; }
        .section { margin-bottom: 50px; }
        .section-header { display: flex; align-items: center; margin-bottom: 25px; padding-bottom: 10px; border-bottom: 2px solid #667eea; }
        .section-title { font-size: 1.8rem; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        th, td { padding: 15px 12px; text-align: left; border-bottom: 1px solid #eee; }
        tbody tr:hover { background-color: #f8f9fa; }
        .currency { text-align: right; }
        .print-button { position: fixed; bottom: 30px; right: 30px; background: #667eea; color: white; border: none; border-radius: 50px; padding: 15px 25px; cursor: pointer; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>📊 Structural Cost Estimation</h1></div>
        <div class="report-meta">
            <div class="meta-grid">
                <div class="meta-item"><div class="meta-label">Project ID</div><div class="meta-value">${projectId}</div></div>
                <div class="meta-item"><div class="meta-label">Location</div><div class="meta-value">${data.location || 'N/A'}</div></div>
                <div class="meta-item"><div class="meta-label">Generated</div><div class="meta-value">${reportDate}</div></div>
                <div class="meta-item"><div class="meta-label">Total Cost</div><div class="meta-value total">$${this._formatCurrency(data.cost_summary?.total_inc_gst || 0)}</div></div>
            </div>
        </div>
        <div class="content">
            <div class="section">
                <div class="section-header"><div class="section-title">Cost Breakdown</div></div>
                <table>
                    <thead><tr><th>Description</th><th class="currency">Amount (AUD)</th></tr></thead>
                    <tbody>
                        <tr><td>Base Cost</td><td class="currency">$${this._formatCurrency(data.cost_summary?.base_cost || 0)}</td></tr>
                        <tr><td>Contingencies</td><td class="currency">$${this._formatCurrency((data.cost_summary?.site_access_contingency || 0) + (data.cost_summary?.unforeseen_contingency || 0))}</td></tr>
                        <tr style="font-weight: bold;"><td>Subtotal (ex GST)</td><td class="currency">$${this._formatCurrency(data.cost_summary?.subtotal_ex_gst || 0)}</td></tr>
                        <tr><td>GST (${(this.gstRate * 100)}%)</td><td class="currency">$${this._formatCurrency(data.cost_summary?.gst || 0)}</td></tr>
                        <tr style="font-weight: bold; background: #d4edda; font-size: 1.1em;"><td>TOTAL (inc GST)</td><td class="currency">$${this._formatCurrency(data.cost_summary?.total_inc_gst || 0)}</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="section">
                <div class="section-header"><div class="section-title">Detailed Line Items</div></div>
                <table>
                    <thead><tr><th>Code</th><th>Description</th><th>Qty</th><th>Unit</th><th class="currency">Rate</th><th class="currency">Total</th><th>Category</th></tr></thead>
                    <tbody>
                        ${(data.items || []).slice(0, 100).map(item => `
                            <tr>
                                <td>${item.code || 'N/A'}</td><td>${item.description || 'N/A'}</td><td>${this._formatNumber(item.quantity || 0)}</td><td>${item.unit || ''}</td>
                                <td class="currency">${this._formatCurrency(item.unitRate || 0)}</td><td class="currency">${this._formatCurrency(item.totalCost || 0)}</td>
                                <td>${item.category || 'General'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
             <div class="section">
                <div class="section-header"><div class="section-title">Assumptions & Exclusions</div></div>
                 <p>Key Assumptions: ${(data.assumptions || []).join(', ')}</p>
                 <p>Exclusions: ${(data.exclusions || []).join(', ')}</p>
            </div>
        </div>
    </div>
    <button class="print-button" onclick="window.print()">🖨️ Print</button>
    <a href="/api/v1/projects/${projectId}/report/download" download="report-${projectId}.html" style="position: fixed; bottom: 30px; left: 30px; background: #28a745; color: white; text-decoration: none; border-radius: 50px; padding: 15px 25px; font-size: 1rem; font-weight: 600; box-shadow: 0 5px 15px rgba(0,0,0,0.2);">💾 Download</a>
</body>
</html>`;

        const filename = `estimation_report_${projectId}.html`;
        const filePath = path.join(this.outputDir, filename);
        
        // Still write the file to disk for archival purposes
        await fs.writeFile(filePath, html, 'utf8');
        
        // Return the HTML content directly for the API response
        return { content: html, type: 'text/html' };
    }

    // ... All other helper methods (_formatCurrency, _generateJsonReport, etc.) remain unchanged ...
    _generateCategoryBreakdown(categories) {
        return Object.entries(categories).map(([categoryName, categoryData]) => `
            <div class="category-section">
                <div class="category-header">
                    <div class="category-title">${categoryName}</div>
                    <div class="category-cost">${this._formatCurrency(categoryData.total_cost || 0)} • ${categoryData.item_count || 0} items</div>
                </div>
            </div>
        `).join('');
    }

    async _generateJsonReport(data, projectId) {
        const filename = `estimation_${projectId}.json`;
        const filePath = path.join(this.outputDir, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        return filePath;
    }
    
    _formatCurrency(amount) {
        return new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
    }

    _formatNumber(number, decimals = 2) {
        return new Intl.NumberFormat('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number || 0);
    }
    
    _getConfidenceClass(score) {
        if (score >= 0.8) return 'confidence-high';
        if (score >= 0.6) return 'confidence-medium';
        return 'confidence-low';
    }
}

module.exports = ReportGenerator;