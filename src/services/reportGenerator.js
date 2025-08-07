// services/reportGenerator.js - Professional PDF Report Generator
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class ReportGenerator {
    static async generateDetailedReport(estimation) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ 
                    size: 'A4', 
                    margins: { top: 50, bottom: 50, left: 50, right: 50 },
                    info: {
                        Title: `Steel Estimation Report - ${estimation.projectName}`,
                        Author: 'SteelConnect Professional',
                        Subject: 'Steel Structure Cost Estimation',
                        Keywords: 'steel, estimation, construction, engineering'
                    }
                });

                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Generate report content
                this.addHeader(doc, estimation);
                this.addProjectOverview(doc, estimation);
                this.addCostSummary(doc, estimation);
                this.addDetailedBreakdown(doc, estimation);
                this.addTimelineAndPhases(doc, estimation);
                this.addAssumptionsAndExclusions(doc, estimation);
                this.addFooter(doc, estimation);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    static addHeader(doc, estimation) {
        // Company header
        doc.fontSize(20)
           .fillColor('#2563eb')
           .text('STEELCONNECT PROFESSIONAL', { align: 'center' });
        
        doc.fontSize(14)
           .fillColor('#64748b')
           .text('Steel Structure Cost Estimation Report', { align: 'center' });

        // Project title
        doc.moveDown(2)
           .fontSize(18)
           .fillColor('#1e293b')
           .text(estimation.projectName.toUpperCase(), { align: 'center' });

        if (estimation.projectLocation) {
            doc.fontSize(12)
               .fillColor('#64748b')
               .text(estimation.projectLocation, { align: 'center' });
        }

        // Project number and date
        doc.moveDown(1)
           .fontSize(10)
           .text(`Project No: EST-${estimation._id.toString().slice(-8).toUpperCase()}`, { align: 'center' })
           .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' })
           .text(`Valid Until: ${estimation.validUntil.toLocaleDateString()}`, { align: 'center' });

        // Draw line
        doc.strokeColor('#e2e8f0')
           .lineWidth(1)
           .moveTo(50, doc.y + 20)
           .lineTo(545, doc.y + 20)
           .stroke();

        doc.moveDown(2);
    }

    static addProjectOverview(doc, estimation) {
        doc.fontSize(16)
           .fillColor('#1e293b')
           .text('PROJECT OVERVIEW', { underline: true });

        doc.moveDown(0.5);

        const overview = [
            ['Project Type:', this.formatProjectType(estimation.structureType)],
            ['Steel Grade:', estimation.steelGrade],
            ['Total Tonnage:', `${estimation.totalTonnage} MT`],
            ['Project Complexity:', this.formatComplexity(estimation.projectComplexity)],
            ['Region:', this.formatRegion(estimation.region)],
            ['Coating Requirement:', this.formatCoating(estimation.coatingRequirement)],
            ['Estimated Timeline:', `${estimation.estimatedWeeks} weeks`]
        ];

        overview.forEach(([label, value]) => {
            doc.fontSize(11)
               .fillColor('#374151')
               .text(label, 70, doc.y, { continued: true, width: 150 })
               .fillColor('#1f2937')
               .text(value, 220);
            doc.moveDown(0.3);
        });

        doc.moveDown(1);
    }

    static addCostSummary(doc, estimation) {
        doc.fontSize(16)
           .fillColor('#1e293b')
           .text('COST SUMMARY', { underline: true });

        doc.moveDown(1);

        // Total cost box
        const totalCostY = doc.y;
        doc.rect(70, totalCostY, 200, 60)
           .fillColor('#eff6ff')
           .fill()
           .strokeColor('#3b82f6')
           .stroke();

        doc.fillColor('#1e40af')
           .fontSize(12)
           .text('TOTAL ESTIMATED COST', 80, totalCostY + 10)
           .fontSize(24)
           .fillColor('#1e3a8a')
           .text(this.formatCurrency(estimation.totalProjectCost, estimation.currency), 80, totalCostY + 30);

        // Cost per tonne box
        doc.rect(300, totalCostY, 200, 60)
           .fillColor('#f0fdf4')
           .fill()
           .strokeColor('#22c55e')
           .stroke();

        doc.fillColor('#15803d')
           .fontSize(12)
           .text('COST PER TONNE', 310, totalCostY + 10)
           .fontSize(18)
           .text(this.formatCurrency(estimation.costPerTonne, estimation.currency), 310, totalCostY + 35);

        doc.y = totalCostY + 80;
        doc.moveDown(1);

        // Cost breakdown table
        this.addCostBreakdownTable(doc, estimation);
    }

    static addCostBreakdownTable(doc, estimation) {
        const tableTop = doc.y;
        const tableLeft = 70;
        const tableWidth = 450;
        const rowHeight = 25;
        const colWidths = [300, 150];

        // Table header
        doc.rect(tableLeft, tableTop, tableWidth, rowHeight)
           .fillColor('#f8fafc')
           .fill()
           .strokeColor('#e2e8f0')
           .stroke();

        doc.fillColor('#1e293b')
           .fontSize(12)
           .text('Cost Category', tableLeft + 10, tableTop + 8, { width: colWidths[0] - 20 })
           .text('Amount', tableLeft + colWidths[0] + 10, tableTop + 8, { 
               width: colWidths[1] - 20, 
               align: 'right' 
           });

        let currentY = tableTop + rowHeight;

        // Cost breakdown rows
        Object.entries(estimation.costBreakdown).forEach(([category, amount], index) => {
            const isSubtotal = category.toLowerCase().includes('subtotal');
            const isTotal = category.toLowerCase().includes('overhead') || 
                           category.toLowerCase().includes('contingency');

            // Row background
            if (isSubtotal) {
                doc.rect(tableLeft, currentY, tableWidth, rowHeight)
                   .fillColor('#f1f5f9')
                   .fill();
            }

            // Row border
            doc.rect(tableLeft, currentY, tableWidth, rowHeight)
               .strokeColor('#e2e8f0')
               .stroke();

            // Text styling
            const fontSize = isSubtotal ? 11 : 10;
            const textColor = isSubtotal ? '#0f172a' : '#374151';
            const fontWeight = isSubtotal ? 'bold' : 'normal';

            doc.fillColor(textColor)
               .fontSize(fontSize)
               .text(category, tableLeft + 10, currentY + 8, { width: colWidths[0] - 20 })
               .text(this.formatCurrency(amount, estimation.currency), 
                     tableLeft + colWidths[0] + 10, currentY + 8, { 
                         width: colWidths[1] - 20, 
                         align: 'right' 
                     });

            currentY += rowHeight;
        });

        doc.y = currentY + 20;
    }

    static addDetailedBreakdown(doc, estimation) {
        // Check if we need a new page
        if (doc.y > 600) {
            doc.addPage();
        }

        doc.fontSize(16)
           .fillColor('#1e293b')
           .text('DETAILED COST BREAKDOWN', { underline: true });

        doc.moveDown(1);

        const sections = [
            { title: 'FABRICATION COSTS', data: estimation.fabricationDetails },
            { title: 'INSTALLATION COSTS', data: estimation.installationDetails },
            { title: 'ENGINEERING & DESIGN COSTS', data: estimation.engineeringDetails },
            { title: 'PROJECT MANAGEMENT COSTS', data: estimation.projectManagementDetails }
        ];

        sections.forEach(section => {
            if (doc.y > 650) {
                doc.addPage();
            }

            doc.fontSize(14)
               .fillColor('#374151')
               .text(section.title);

            doc.moveDown(0.5);

            if (section.data && typeof section.data === 'object') {
                Object.entries(section.data).forEach(([item, cost]) => {
                    doc.fontSize(10)
                       .fillColor('#6b7280')
                       .text(this.formatBreakdownItem(item), 90, doc.y, { 
                           continued: true, 
                           width: 300 
                       })
                       .fillColor('#374151')
                       .text(this.formatCurrency(cost, estimation.currency), { 
                           align: 'right',
                           width: 100 
                       });
                    doc.moveDown(0.2);
                });
            }

            doc.moveDown(0.5);
        });
    }

    static addTimelineAndPhases(doc, estimation) {
        if (doc.y > 600) {
            doc.addPage();
        }

        doc.fontSize(16)
           .fillColor('#1e293b')
           .text('PROJECT TIMELINE & PHASES', { underline: true });

        doc.moveDown(1);

        // Timeline overview
        doc.fontSize(12)
           .fillColor('#374151')
           .text(`Total Project Duration: ${estimation.estimatedWeeks} weeks`);

        doc.moveDown(1);

        // Phase breakdown
        if (estimation.phaseBreakdown) {
            Object.entries(estimation.phaseBreakdown).forEach(([phase, weeks]) => {
                const percentage = (weeks / estimation.estimatedWeeks * 100).toFixed(1);
                
                doc.fontSize(11)
                   .fillColor('#6b7280')
                   .text(`${phase}:`, 90, doc.y, { continued: true, width: 200 })
                   .fillColor('#374151')
                   .text(`${weeks} weeks (${percentage}%)`, { align: 'right', width: 150 });
                
                doc.moveDown(0.3);
            });
        }

        doc.moveDown(1);
    }

    static addAssumptionsAndExclusions(doc, estimation) {
        if (doc.y > 500) {
            doc.addPage();
        }

        // Assumptions
        doc.fontSize(14)
           .fillColor('#1e293b')
           .text('ASSUMPTIONS', { underline: true });

        doc.moveDown(0.5);

        if (estimation.assumptions && estimation.assumptions.length > 0) {
            estimation.assumptions.forEach(assumption => {
                doc.fontSize(10)
                   .fillColor('#374151')
                   .text(`• ${assumption}`, 90);
                doc.moveDown(0.2);
            });
        }

        doc.moveDown(1);

        // Exclusions
        doc.fontSize(14)
           .fillColor('#1e293b')
           .text('EXCLUSIONS', { underline: true });

        doc.moveDown(0.5);

        if (estimation.exclusions && estimation.exclusions.length > 0) {
            estimation.exclusions.forEach(exclusion => {
                doc.fontSize(10)
                   .fillColor('#374151')
                   .text(`• ${exclusion}`, 90);
                doc.moveDown(0.2);
            });
        }

        doc.moveDown(1);

        // Risk factors
        if (estimation.riskFactors && estimation.riskFactors.length > 0) {
            doc.fontSize(14)
               .fillColor('#1e293b')
               .text('RISK FACTORS', { underline: true });

            doc.moveDown(0.5);

            estimation.riskFactors.forEach(risk => {
                doc.fontSize(10)
                   .fillColor('#374151')
                   .text(`• ${risk}`, 90);
                doc.moveDown(0.2);
            });
        }
    }

    static addFooter(doc, estimation) {
        // Add new page for footer if needed
        if (doc.y > 650) {
            doc.addPage();
        }

        doc.moveDown(2);

        // Important notes
        doc.fontSize(12)
           .fillColor('#dc2626')
           .text('IMPORTANT NOTES', { underline: true });

        doc.fontSize(10)
           .fillColor('#374151')
           .text('• This is a preliminary budget estimate for planning purposes only.');
        doc.text('• Final costs may vary based on detailed engineering, market conditions, and site factors.');
        doc.text('• All costs are exclusive of taxes unless otherwise stated.');
        doc.text('• This estimate is valid for 30 days from the date of issue.');

        doc.moveDown(2);

        // Footer information
        doc.fontSize(8)
           .fillColor('#6b7280')
           .text(`Generated by: ${estimation.generatedBy || 'SteelConnect Professional Estimator'}`, { align: 'center' })
           .text(`Report ID: EST-${estimation._id.toString().slice(-12).toUpperCase()}`, { align: 'center' })
           .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

        // Page numbers (if multiple pages)
        const pageCount = doc.bufferedPageRange().count;
        if (pageCount > 1) {
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(8)
                   .fillColor('#6b7280')
                   .text(`Page ${i + 1} of ${pageCount}`, 50, 750, { align: 'center', width: 495 });
            }
        }
    }

    // Helper formatting methods
    static formatCurrency(amount, currency) {
        const formatters = {
            USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
            CAD: new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }),
            GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
            AUD: new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }),
            EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
            INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
        };

        const formatter = formatters[currency] || formatters.USD;
        return formatter.format(Math.round(amount));
    }

    static formatProjectType(type) {
        const types = {
            'commercial-building': 'Commercial Building',
            'warehouse': 'Warehouse/Industrial',
            'bridge': 'Bridge Structure',
            'tower': 'Tower/Mast',
            'stadium': 'Stadium/Sports Complex',
            'residential': 'Residential Complex',
            'infrastructure': 'Infrastructure',
            'petrochemical': 'Petrochemical Plant',
            'power-plant': 'Power Plant',
            'miscellaneous': 'Miscellaneous Steel'
        };
        return types[type] || type;
    }

    static formatComplexity(complexity) {
        const complexities = {
            'simple': 'Simple - Standard structural work',
            'moderate': 'Moderate - Some complex connections',
            'complex': 'Complex - Complex geometry and connections',
            'architectural': 'Architectural - Exposed steel with high finish'
        };
        return complexities[complexity] || complexity;
    }

    static formatRegion(region) {
        const regions = {
            'us': 'United States',
            'canada': 'Canada',
            'uk': 'United Kingdom',
            'australia': 'Australia',
            'germany': 'Germany',
            'india': 'India',
            'china': 'China',
            'uae': 'United Arab Emirates',
            'saudi': 'Saudi Arabia',
            'south-africa': 'South Africa'
        };
        return regions[region] || region;
    }

    static formatCoating(coating) {
        const coatings = {
            'none': 'No special coating',
            'primer': 'Shop primer only',
            'intermediate': 'Intermediate coating system',
            'heavy-duty': 'Heavy-duty coating system',
            'marine': 'Marine environment coating',
            'fire-resistant': 'Fire resistant coating'
        };
        return coatings[coating] || coating;
    }

    static formatBreakdownItem(item) {
        return item
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    // Generate simple text report (fallback)
    static generateTextReport(estimation) {
        let report = `STEEL STRUCTURE COST ESTIMATION REPORT\n`;
        report += `==========================================\n\n`;
        report += `Project: ${estimation.projectName}\n`;
        if (estimation.projectLocation) {
            report += `Location: ${estimation.projectLocation}\n`;
        }
        report += `Date: ${new Date().toLocaleDateString()}\n`;
        report += `Project ID: EST-${estimation._id.toString().slice(-8).toUpperCase()}\n\n`;

        report += `PROJECT OVERVIEW\n`;
        report += `--------------------------------\n`;
        report += `- Project Type: ${this.formatProjectType(estimation.structureType)}\n`;
        report += `- Total Steel Tonnage: ${estimation.totalTonnage} MT\n`;
        report += `- Steel Grade: ${estimation.steelGrade}\n`;
        report += `- Project Complexity: ${this.formatComplexity(estimation.projectComplexity)}\n`;
        report += `- Region: ${this.formatRegion(estimation.region)}\n`;
        report += `- Estimated Timeline: ${estimation.estimatedWeeks} weeks\n`;
        report += `- Cost per MT: ${this.formatCurrency(estimation.costPerTonne, estimation.currency)}\n\n`;

        report += `COST BREAKDOWN (${estimation.currency})\n`;
        report += `--------------------------------\n`;
        Object.entries(estimation.costBreakdown).forEach(([category, amount]) => {
            report += `- ${category.padEnd(30)}: ${this.formatCurrency(amount, estimation.currency)}\n`;
        });

        report += `\n============================================\n`;
        report += `TOTAL ESTIMATED COST: ${this.formatCurrency(estimation.totalProjectCost, estimation.currency)}\n`;
        report += `============================================\n\n`;

        if (estimation.phaseBreakdown) {
            report += `PROJECT PHASES\n`;
            report += `--------------------------------\n`;
            Object.entries(estimation.phaseBreakdown).forEach(([phase, weeks]) => {
                report += `- ${phase}: ${weeks} weeks\n`;
            });
            report += `\n`;
        }

        if (estimation.assumptions && estimation.assumptions.length > 0) {
            report += `ASSUMPTIONS\n`;
            report += `--------------------------------\n`;
            estimation.assumptions.forEach(assumption => {
                report += `- ${assumption}\n`;
            });
            report += `\n`;
        }

        if (estimation.exclusions && estimation.exclusions.length > 0) {
            report += `EXCLUSIONS\n`;
            report += `--------------------------------\n`;
            estimation.exclusions.forEach(exclusion => {
                report += `- ${exclusion}\n`;
            });
            report += `\n`;
        }

        if (estimation.riskFactors && estimation.riskFactors.length > 0) {
            report += `RISK FACTORS\n`;
            report += `--------------------------------\n`;
            estimation.riskFactors.forEach(risk => {
                report += `- ${risk}\n`;
            });
            report += `\n`;
        }

        report += `NOTES & DISCLAIMERS\n`;
        report += `--------------------------------\n`;
        report += `- This is a preliminary budget estimate for planning purposes only.\n`;
        report += `- Final costs may vary based on detailed engineering, market fluctuations, and site conditions.\n`;
        report += `- All costs are exclusive of taxes unless otherwise stated.\n`;
        report += `- This estimate is valid for 30 days from the date of issue.\n`;
        report += `- Generated by SteelConnect Professional Estimator.\n\n`;

        report += `Generated on: ${new Date().toLocaleString()}\n`;
        report += `Report ID: EST-${estimation._id.toString().slice(-12).toUpperCase()}\n`;

        return report;
    }

    // Generate CSV export for detailed breakdown
    static generateCSVReport(estimation) {
        let csv = 'Category,Subcategory,Amount,Currency,Percentage\n';
        
        const total = estimation.totalProjectCost;
        
        // Main cost breakdown
        Object.entries(estimation.costBreakdown).forEach(([category, amount]) => {
            const percentage = ((amount / total) * 100).toFixed(2);
            csv += `"${category}","","${amount}","${estimation.currency}","${percentage}%"\n`;
        });

        // Detailed breakdowns
        const detailSections = [
            { name: 'Fabrication Details', data: estimation.fabricationDetails },
            { name: 'Installation Details', data: estimation.installationDetails },
            { name: 'Engineering Details', data: estimation.engineeringDetails },
            { name: 'Project Management Details', data: estimation.projectManagementDetails }
        ];

        detailSections.forEach(section => {
            if (section.data && typeof section.data === 'object') {
                Object.entries(section.data).forEach(([item, amount]) => {
                    const percentage = ((amount / total) * 100).toFixed(2);
                    csv += `"${section.name}","${this.formatBreakdownItem(item)}","${amount}","${estimation.currency}","${percentage}%"\n`;
                });
            }
        });

        return csv;
    }

    // Generate JSON export
    static generateJSONReport(estimation) {
        return JSON.stringify({
            reportInfo: {
                projectName: estimation.projectName,
                projectLocation: estimation.projectLocation,
                reportId: `EST-${estimation._id.toString().slice(-8).toUpperCase()}`,
                generatedAt: new Date().toISOString(),
                validUntil: estimation.validUntil,
                currency: estimation.currency
            },
            projectDetails: {
                structureType: estimation.structureType,
                totalTonnage: estimation.totalTonnage,
                steelGrade: estimation.steelGrade,
                projectComplexity: estimation.projectComplexity,
                region: estimation.region,
                coatingRequirement: estimation.coatingRequirement
            },
            costSummary: {
                totalProjectCost: estimation.totalProjectCost,
                costPerTonne: estimation.costPerTonne,
                estimatedWeeks: estimation.estimatedWeeks,
                costBreakdown: estimation.costBreakdown
            },
            detailedBreakdown: {
                fabrication: estimation.fabricationDetails,
                installation: estimation.installationDetails,
                engineering: estimation.engineeringDetails,
                projectManagement: estimation.projectManagementDetails,
                surfaceTreatment: estimation.surfaceTreatmentDetails,
                qualityControl: estimation.qualityControlDetails
            },
            timeline: {
                totalWeeks: estimation.estimatedWeeks,
                phases: estimation.phaseBreakdown
            },
            projectInfo: {
                assumptions: estimation.assumptions,
                exclusions: estimation.exclusions,
                riskFactors: estimation.riskFactors
            }
        }, null, 2);
    }
}

module.exports = ReportGenerator;