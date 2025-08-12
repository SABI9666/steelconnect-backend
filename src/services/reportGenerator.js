// services/reportGenerator.js
import fs from 'fs/promises';
import path from 'path';

export default class ReportGenerator {
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
                    return await this._generateHtmlReport(estimationData, projectId);
                case "json":
                    const jsonPath = await this._generateJsonReport(estimationData, projectId);
                    const jsonContent = await fs.readFile(jsonPath, 'utf8');
                    return { content: jsonContent, type: 'application/json' };
                case "csv":
                    return await this._generateCsvReport(estimationData, projectId);
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
     */
    async _generateHtmlReport(data, projectId) {
        const reportDate = new Date().toLocaleDateString('en-AU', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Structural Cost Estimation Report - ${projectId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #2c3e50; 
            background: #f8f9fa; 
            padding: 20px; 
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 10px; 
            box-shadow: 0 0 20px rgba(0,0,0,0.1); 
            overflow: hidden; 
        }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px; 
            text-align: center; 
        }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { font-size: 1.1rem; opacity: 0.9; }
        
        .report-meta { 
            background: #e8f4f8; 
            padding: 30px; 
            border-bottom: 3px solid #667eea; 
        }
        .meta-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
        }
        .meta-item { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.1); 
        }
        .meta-label { 
            font-weight: 600; 
            color: #495057; 
            text-transform: uppercase; 
            font-size: 0.9rem; 
            margin-bottom: 5px; 
        }
        .meta-value { 
            font-size: 1.1rem; 
            color: #2c3e50; 
        }
        .meta-value.total { 
            font-size: 1.8rem; 
            font-weight: 700; 
            color: #27ae60; 
        }
        .meta-value.confidence { 
            font-weight: 600; 
            color: #e74c3c; 
        }
        
        .content { padding: 40px; }
        .section { margin-bottom: 50px; }
        .section-header { 
            display: flex; 
            align-items: center; 
            margin-bottom: 25px; 
            padding-bottom: 10px; 
            border-bottom: 2px solid #667eea; 
        }
        .section-title { 
            font-size: 1.8rem; 
            font-weight: 600; 
            color: #2c3e50; 
        }
        .section-icon { 
            font-size: 1.5rem; 
            margin-right: 10px; 
        }
        
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            border-radius: 8px; 
            overflow: hidden; 
        }
        thead { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
        }
        th, td { 
            padding: 15px 12px; 
            text-align: left; 
            border-bottom: 1px solid #eee; 
        }
        th { font-weight: 600; }
        tbody tr:hover { background-color: #f8f9fa; transition: background-color 0.2s; }
        tbody tr:nth-child(even) { background-color: #fbfbfb; }
        .currency { text-align: right; font-weight: 500; }
        .total-row { 
            background: #d4edda !important; 
            font-weight: bold; 
            font-size: 1.1em; 
        }
        
        .summary-cards { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            margin: 20px 0; 
        }
        .summary-card { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            border-left: 4px solid #667eea; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .summary-card h3 { 
            color: #667eea; 
            margin-bottom: 10px; 
        }
        .summary-card .value { 
            font-size: 1.5rem; 
            font-weight: bold; 
            color: #2c3e50; 
        }
        
        .assumptions-list, .exclusions-list { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 15px 0; 
        }
        .assumptions-list ul, .exclusions-list ul { 
            list-style-type: none; 
            padding: 0; 
        }
        .assumptions-list li, .exclusions-list li { 
            padding: 8px 0; 
            border-bottom: 1px solid #dee2e6; 
            position: relative; 
            padding-left: 25px; 
        }
        .assumptions-list li:before { 
            content: "✓"; 
            color: #28a745; 
            font-weight: bold; 
            position: absolute; 
            left: 0; 
        }
        .exclusions-list li:before { 
            content: "✗"; 
            color: #dc3545; 
            font-weight: bold; 
            position: absolute; 
            left: 0; 
        }
        
        .category-section { 
            margin-bottom: 30px; 
            border: 1px solid #dee2e6; 
            border-radius: 8px; 
            overflow: hidden; 
        }
        .category-header { 
            background: #f8f9fa; 
            padding: 15px 20px; 
            border-bottom: 1px solid #dee2e6; 
        }
        .category-title { 
            font-size: 1.3rem; 
            font-weight: 600; 
            color: #495057; 
        }
        .category-total { 
            float: right; 
            font-size: 1.2rem; 
            font-weight: bold; 
            color: #28a745; 
        }
        
        .print-controls { 
            position: fixed; 
            bottom: 30px; 
            right: 30px; 
            display: flex; 
            gap: 10px; 
        }
        .btn { 
            background: #667eea; 
            color: white; 
            border: none; 
            border-radius: 50px; 
            padding: 15px 25px; 
            cursor: pointer; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.2); 
            text-decoration: none; 
            display: inline-flex; 
            align-items: center; 
            gap: 8px; 
            font-weight: 500; 
            transition: transform 0.2s; 
        }
        .btn:hover { transform: translateY(-2px); }
        .btn.download { background: #28a745; }
        
        @media print {
            .print-controls { display: none; }
            .container { box-shadow: none; }
            body { padding: 0; background: white; }
        }
        
        @media (max-width: 768px) {
            .container { margin: 10px; }
            .content { padding: 20px; }
            .meta-grid { grid-template-columns: 1fr; }
            .summary-cards { grid-template-columns: 1fr; }
            table { font-size: 0.9rem; }
            th, td { padding: 10px 8px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Structural Cost Estimation</h1>
            <p>Professional Engineering Cost Analysis</p>
        </div>
        
        <div class="report-meta">
            <div class="meta-grid">
                <div class="meta-item">
                    <div class="meta-label">Project ID</div>
                    <div class="meta-value">${projectId}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Location</div>
                    <div class="meta-value">${data.location || 'N/A'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Generated</div>
                    <div class="meta-value">${reportDate}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Total Cost</div>
                    <div class="meta-value total">${this._formatCurrency(data.cost_summary?.total_inc_gst || 0)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Confidence Score</div>
                    <div class="meta-value confidence">${Math.round((data.confidence_score || 0) * 100)}%</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Line Items</div>
                    <div class="meta-value">${(data.items || []).length}</div>
                </div>
            </div>
        </div>
        
        <div class="content">
            <!-- Cost Summary Section -->
            <div class="section">
                <div class="section-header">
                    <span class="section-icon">💰</span>
                    <div class="section-title">Cost Breakdown</div>
                </div>
                
                <div class="summary-cards">
                    <div class="summary-card">
                        <h3>Base Cost</h3>
                        <div class="value">${this._formatCurrency(data.cost_summary?.base_cost || 0)}</div>
                    </div>
                    <div class="summary-card">
                        <h3>Location Factor</h3>
                        <div class="value">${(data.cost_summary?.location_factor || 1.0).toFixed(2)}x</div>
                    </div>
                    <div class="summary-card">
                        <h3>Contingencies</h3>
                        <div class="value">${this._formatCurrency((data.cost_summary?.site_access_contingency || 0) + (data.cost_summary?.unforeseen_contingency || 0))}</div>
                    </div>
                    <div class="summary-card">
                        <h3>GST (${(this.gstRate * 100)}%)</h3>
                        <div class="value">${this._formatCurrency(data.cost_summary?.gst || 0)}</div>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="currency">Amount (AUD)</th>
                            <th class="currency">Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this._generateCostBreakdownRows(data.cost_summary)}
                    </tbody>
                </table>
            </div>

            <!-- Categories Overview -->
            <div class="section">
                <div class="section-header">
                    <span class="section-icon">📋</span>
                    <div class="section-title">Categories Overview</div>
                </div>
                ${this._generateCategoryOverview(data.categories)}
            </div>

            <!-- Detailed Line Items -->
            <div class="section">
                <div class="section-header">
                    <span class="section-icon">📊</span>
                    <div class="section-title">Detailed Line Items</div>
                </div>
                ${this._generateDetailedItems(data.items, data.categories)}
            </div>

            <!-- Assumptions & Exclusions -->
            <div class="section">
                <div class="section-header">
                    <span class="section-icon">📝</span>
                    <div class="section-title">Assumptions & Exclusions</div>
                </div>
                
                <h3>Key Assumptions</h3>
                <div class="assumptions-list">
                    <ul>
                        ${(data.assumptions || []).map(assumption => `<li>${assumption}</li>`).join('')}
                    </ul>
                </div>
                
                <h3>Exclusions</h3>
                <div class="exclusions-list">
                    <ul>
                        ${(data.exclusions || []).map(exclusion => `<li>${exclusion}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <!-- Footer -->
            <div class="section">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; color: #6c757d;">
                    <p><strong>Disclaimer:</strong> This estimate is based on the information provided and current market rates. 
                    Final costs may vary based on site conditions, material availability, and project specifications. 
                    Valid for ${data.estimationData?.validityPeriodDays || 30} days from generation date.</p>
                </div>
            </div>
        </div>
    </div>
    
    <div class="print-controls">
        <button class="btn" onclick="window.print()">🖨️ Print</button>
        <a href="/api/estimation/reports/${projectId}/download" class="btn download" download="report-${projectId}.html">
            📥 Download
        </a>
    </div>
</body>
</html>`;

        return { content: html, type: 'text/html' };
    }

    /**
     * Generate JSON report
     */
    async _generateJsonReport(data, projectId) {
        const filePath = path.join(this.outputDir, `estimation-${projectId}-${Date.now()}.json`);
        const jsonData = {
            ...data,
            generated_at: new Date().toISOString(),
            format: 'json',
            version: '1.0'
        };
        
        await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
        return filePath;
    }

    /**
     * Generate CSV report
     */
    async _generateCsvReport(data, projectId) {
        const csvHeader = 'Code,Description,Quantity,Unit,Unit Rate,Total Cost,Category,Subcategory\n';
        const csvRows = (data.items || []).map(item => {
            return [
                item.code || '',
                `"${(item.description || '').replace(/"/g, '""')}"`,
                item.quantity || 0,
                item.unit || '',
                item.unitRate || 0,
                item.totalCost || 0,
                item.category || '',
                item.subcategory || ''
            ].join(',');
        }).join('\n');

        const csvContent = csvHeader + csvRows;
        return { content: csvContent, type: 'text/csv' };
    }

    /**
     * Helper method to generate cost breakdown rows
     */
    _generateCostBreakdownRows(costSummary) {
        if (!costSummary) return '';
        
        const total = costSummary.total_inc_gst || 0;
        const rows = [
            { desc: 'Base Cost', amount: costSummary.base_cost || 0 },
            { desc: 'Location Adjustment', amount: (costSummary.location_adjusted || 0) - (costSummary.base_cost || 0) },
            { desc: 'Risk Adjustment', amount: (costSummary.risk_adjusted || 0) - (costSummary.location_adjusted || 0) },
            { desc: 'Site Access Contingency', amount: costSummary.site_access_contingency || 0 },
            { desc: 'Unforeseen Contingency', amount: costSummary.unforeseen_contingency || 0 },
            { desc: 'Subtotal (ex GST)', amount: costSummary.subtotal_ex_gst || 0, subtotal: true },
            { desc: `GST (${(this.gstRate * 100)}%)`, amount: costSummary.gst || 0 },
            { desc: 'TOTAL (inc GST)', amount: costSummary.total_inc_gst || 0, total: true }
        ];

        return rows.map(row => {
            const percentage = total > 0 ? ((row.amount / total) * 100).toFixed(1) : '0.0';
            const cssClass = row.total ? 'total-row' : (row.subtotal ? 'subtotal-row' : '');
            
            return `<tr class="${cssClass}">
                <td>${row.desc}</td>
                <td class="currency">${this._formatCurrency(row.amount)}</td>
                <td class="currency">${percentage}%</td>
            </tr>`;
        }).join('');
    }

    /**
     * Generate category overview
     */
    _generateCategoryOverview(categories) {
        if (!categories) return '<p>No categories available</p>';
        
        return Object.entries(categories).map(([category, data]) => {
            return `<div class="category-section">
                <div class="category-header">
                    <div class="category-title">${category}</div>
                    <div class="category-total">${this._formatCurrency(data.total || 0)}</div>
                    <div style="clear: both;"></div>
                </div>
            </div>`;
        }).join('');
    }

    /**
     * Generate detailed items by category
     */
    _generateDetailedItems(items, categories) {
        if (!items || items.length === 0) {
            return '<p>No detailed items available</p>';
        }

        if (!categories) {
            // If no categories, show all items in one table
            return this._generateItemsTable(items);
        }

        // Group items by category
        return Object.entries(categories).map(([category, data]) => {
            const categoryItems = items.filter(item => item.category === category);
            
            return `<div class="category-section">
                <div class="category-header">
                    <div class="category-title">${category}</div>
                    <div class="category-total">${this._formatCurrency(data.total || 0)}</div>
                    <div style="clear: both;"></div>
                </div>
                ${this._generateItemsTable(categoryItems)}
            </div>`;
        }).join('');
    }

    /**
     * Generate items table
     */
    _generateItemsTable(items) {
        if (!items || items.length === 0) return '';

        const rows = items.map(item => `
            <tr>
                <td>${item.code || 'N/A'}</td>
                <td>${item.description || 'N/A'}</td>
                <td>${this._formatNumber(item.quantity || 0)}</td>
                <td>${item.unit || ''}</td>
                <td class="currency">${this._formatCurrency(item.unitRate || 0)}</td>
                <td class="currency">${this._formatCurrency(item.totalCost || 0)}</td>
                <td>${item.subcategory || ''}</td>
            </tr>
        `).join('');

        return `<table>
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th class="currency">Rate</th>
                    <th class="currency">Total</th>
                    <th>Subcategory</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>`;
    }

    /**
     * Format currency values
     */
    _formatCurrency(value) {
        if (typeof value !== 'number' || isNaN(value)) return '0.00';
        return value.toLocaleString('en-AU', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
    }

    /**
     * Format number values
     */
    _formatNumber(value) {
        if (typeof value !== 'number' || isNaN(value)) return '0';
        return value.toLocaleString('en-AU', { 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 2 
        });
    }
}
