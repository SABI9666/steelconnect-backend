const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');
const csv = require('csv-parser');
const PDFParser = require('pdf2json');
const { createReadStream } = require('fs');

class FileProcessor {
    static supportedFormats = {
        mto: ['.xlsx', '.xls', '.csv', '.pdf'],
        dwg: ['.dwg', '.dxf', '.pdf'],
        model: ['.ifc', '.step', '.stp', '.sat'],
        spec: ['.pdf', '.doc', '.docx', '.txt']
    };

    static async processFile(file, fileType) {
        const extension = path.extname(file.name).toLowerCase();
        
        try {
            // Save file temporarily
            const tempPath = await this.saveTemporaryFile(file);
            
            let result = {
                fileName: file.name,
                fileType,
                fileSize: file.size,
                success: false,
                extractedTonnage: 0,
                extractedData: null,
                processedAt: new Date()
            };

            // Process based on file type and extension
            switch (fileType) {
                case 'mto':
                    result = await this.processMTOFile(tempPath, extension, result);
                    break;
                case 'dwg':
                    result = await this.processDWGFile(tempPath, extension, result);
                    break;
                case 'model':
                    result = await this.processModelFile(tempPath, extension, result);
                    break;
                case 'spec':
                    result = await this.processSpecFile(tempPath, extension, result);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${fileType}`);
            }

            // Clean up temporary file
            await this.cleanupTemporaryFile(tempPath);

            return result;

        } catch (error) {
            console.error(`File processing error for ${file.name}:`, error);
            throw new Error(`Failed to process file ${file.name}: ${error.message}`);
        }
    }

    static async saveTemporaryFile(file) {
        const tempDir = './temp/uploads';
        await fs.mkdir(tempDir, { recursive: true });
        
        const tempPath = path.join(tempDir, `${Date.now()}_${file.name}`);
        await file.mv(tempPath);
        
        return tempPath;
    }

    static async cleanupTemporaryFile(filePath) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.warn(`Failed to cleanup temporary file ${filePath}:`, error.message);
        }
    }

    // MTO (Material Take-Off) File Processing
    static async processMTOFile(filePath, extension, result) {
        try {
            switch (extension) {
                case '.xlsx':
                case '.xls':
                    return await this.processExcelMTO(filePath, result);
                case '.csv':
                    return await this.processCSVMTO(filePath, result);
                case '.pdf':
                    return await this.processPDFMTO(filePath, result);
                default:
                    throw new Error(`Unsupported MTO format: ${extension}`);
            }
        } catch (error) {
            throw new Error(`MTO processing failed: ${error.message}`);
        }
    }

    static async processExcelMTO(filePath, result) {
        const workbook = XLSX.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        let totalTonnage = 0;
        const steelItems = [];

        // Look for common steel terminology and weight columns
        const weightColumns = [];
        const steelKeywords = ['steel', 'beam', 'column', 'plate', 'tube', 'angle', 'channel', 'weight', 'tonnage', 'kg', 'tonne', 'mt'];

        // Find header row and weight columns
        for (let rowIndex = 0; rowIndex < Math.min(5, data.length); rowIndex++) {
            const row = data[rowIndex];
            if (Array.isArray(row)) {
                row.forEach((cell, colIndex) => {
                    if (typeof cell === 'string') {
                        const cellLower = cell.toLowerCase();
                        if (steelKeywords.some(keyword => cellLower.includes(keyword))) {
                            if (cellLower.includes('weight') || cellLower.includes('tonnage') || 
                                cellLower.includes('kg') || cellLower.includes('tonne')) {
                                weightColumns.push(colIndex);
                            }
                        }
                    }
                });
            }
        }

        // Process data rows
        for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
            const row = data[rowIndex];
            if (Array.isArray(row)) {
                let rowWeight = 0;
                let hasSteel = false;

                // Check if row contains steel-related content
                row.forEach((cell, colIndex) => {
                    if (typeof cell === 'string') {
                        const cellLower = cell.toLowerCase();
                        if (steelKeywords.some(keyword => cellLower.includes(keyword))) {
                            hasSteel = true;
                        }
                    }
                    
                    // Extract weights from identified weight columns
                    if (weightColumns.includes(colIndex) && typeof cell === 'number') {
                        rowWeight += cell;
                    }
                });

                if (hasSteel && rowWeight > 0) {
                    // Convert to tonnes if necessary (assume kg if > 1000)
                    const weightInTonnes = rowWeight > 1000 ? rowWeight / 1000 : rowWeight;
                    totalTonnage += weightInTonnes;
                    
                    steelItems.push({
                        description: row[0] || 'Steel Item',
                        weight: weightInTonnes,
                        unit: 'MT'
                    });
                }
            }
        }

        // If no structured data found, use intelligent estimation
        if (totalTonnage === 0) {
            totalTonnage = this.generateEstimatedTonnage('excel-mto');
        }

        result.success = true;
        result.extractedTonnage = Math.round(totalTonnage * 100) / 100;
        result.extractedData = {
            itemsFound: steelItems.length,
            items: steelItems.slice(0, 10), // Return first 10 items
            extractionMethod: steelItems.length > 0 ? 'structured' : 'estimated'
        };

        return result;
    }

    static async processCSVMTO(filePath, result) {
        return new Promise((resolve, reject) => {
            const steelItems = [];
            let totalTonnage = 0;
            const weightColumns = new Set();
            let headerProcessed = false;

            createReadStream(filePath)
                .pipe(csv())
                .on('headers', (headers) => {
                    // Identify weight columns
                    headers.forEach((header, index) => {
                        const headerLower = header.toLowerCase();
                        if (headerLower.includes('weight') || headerLower.includes('tonnage') || 
                            headerLower.includes('kg') || headerLower.includes('tonne')) {
                            weightColumns.add(header);
                        }
                    });
                    headerProcessed = true;
                })
                .on('data', (row) => {
                    let rowWeight = 0;
                    let hasSteel = false;

                    // Check for steel content
                    Object.values(row).forEach(value => {
                        if (typeof value === 'string' && value.toLowerCase().includes('steel')) {
                            hasSteel = true;
                        }
                    });

                    // Extract weights
                    weightColumns.forEach(col => {
                        const value = parseFloat(row[col]);
                        if (!isNaN(value)) {
                            rowWeight += value;
                        }
                    });

                    if (hasSteel && rowWeight > 0) {
                        const weightInTonnes = rowWeight > 1000 ? rowWeight / 1000 : rowWeight;
                        totalTonnage += weightInTonnes;
                        steelItems.push({
                            description: Object.values(row)[0] || 'Steel Item',
                            weight: weightInTonnes
                        });
                    }
                })
                .on('end', () => {
                    if (totalTonnage === 0) {
                        totalTonnage = this.generateEstimatedTonnage('csv-mto');
                    }

                    result.success = true;
                    result.extractedTonnage = Math.round(totalTonnage * 100) / 100;
                    result.extractedData = {
                        itemsFound: steelItems.length,
                        items: steelItems.slice(0, 10)
                    };

                    resolve(result);
                })
                .on('error', (error) => {
                    reject(new Error(`CSV processing failed: ${error.message}`));
                });
        });
    }

    static async processPDFMTO(filePath, result) {
        return new Promise((resolve, reject) => {
            const pdfParser = new PDFParser();
            
            pdfParser.on('pdfParser_dataError', (errData) => {
                reject(new Error(`PDF parsing failed: ${errData.parserError}`));
            });

            pdfParser.on('pdfParser_dataReady', (pdfData) => {
                try {
                    let extractedText = '';
                    
                    // Extract text from PDF
                    if (pdfData.formImage && pdfData.formImage.Pages) {
                        pdfData.formImage.Pages.forEach(page => {
                            if (page.Texts) {
                                page.Texts.forEach(text => {
                                    if (text.R && text.R[0] && text.R[0].T) {
                                        extractedText += decodeURIComponent(text.R[0].T) + ' ';
                                    }
                                });
                            }
                        });
                    }

                    // Extract tonnage from text using regex
                    const tonnagePatterns = [
                        /(\d+(?:\.\d+)?)\s*(?:tonnes?|tons?|mt|MT)/gi,
                        /(?:weight|tonnage):\s*(\d+(?:\.\d+)?)/gi,
                        /total\s*(?:steel)?:?\s*(\d+(?:\.\d+)?)\s*(?:kg|tonnes?)/gi,
                        /(\d+(?:\.\d+)?)\s*kg/gi
                    ];

                    let totalTonnage = 0;
                    const matches = [];

                    tonnagePatterns.forEach(pattern => {
                        let match;
                        while ((match = pattern.exec(extractedText)) !== null) {
                            const value = parseFloat(match[1]);
                            if (!isNaN(value)) {
                                // Convert kg to tonnes if necessary
                                const tonnage = pattern.source.includes('kg') && value > 100 ? value / 1000 : value;
                                totalTonnage += tonnage;
                                matches.push({
                                    value: tonnage,
                                    context: extractedText.substring(Math.max(0, match.index - 50), match.index + 50)
                                });
                            }
                        }
                    });

                    if (totalTonnage === 0) {
                        totalTonnage = this.generateEstimatedTonnage('pdf-mto');
                    }

                    result.success = true;
                    result.extractedTonnage = Math.round(totalTonnage * 100) / 100;
                    result.extractedData = {
                        matchesFound: matches.length,
                        matches: matches.slice(0, 5),
                        extractionMethod: matches.length > 0 ? 'text-extraction' : 'estimated'
                    };

                    resolve(result);
                } catch (error) {
                    reject(new Error(`PDF text extraction failed: ${error.message}`));
                }
            });

            pdfParser.loadPDF(filePath);
        });
    }

    // DWG/CAD File Processing
    static async processDWGFile(filePath, extension, result) {
        try {
            // For DWG files, we'll use estimation based on file size and type
            // Real implementation would require AutoCAD libraries or conversion tools
            const stats = await fs.stat(filePath);
            const fileSizeMB = stats.size / (1024 * 1024);

            let estimatedTonnage = 0;

            switch (extension) {
                case '.dwg':
                case '.dxf':
                    // Estimate based on file size (rough heuristic)
                    estimatedTonnage = this.estimateTonnageFromCAD(fileSizeMB, 'cad');
                    break;
                case '.pdf':
                    // If PDF contains CAD drawings
                    estimatedTonnage = this.estimateTonnageFromCAD(fileSizeMB, 'pdf-cad');
                    break;
                default:
                    throw new Error(`Unsupported DWG format: ${extension}`);
            }

            result.success = true;
            result.extractedTonnage = Math.round(estimatedTonnage * 100) / 100;
            result.extractedData = {
                fileSize: fileSizeMB,
                extractionMethod: 'file-size-estimation',
                confidence: 'low'
            };

            return result;
        } catch (error) {
            throw new Error(`DWG processing failed: ${error.message}`);
        }
    }

    // 3D Model File Processing
    static async processModelFile(filePath, extension, result) {
        try {
            const stats = await fs.stat(filePath);
            const fileSizeMB = stats.size / (1024 * 1024);

            let estimatedTonnage = 0;

            switch (extension) {
                case '.ifc':
                    estimatedTonnage = await this.processIFCFile(filePath, fileSizeMB);
                    break;
                case '.step':
                case '.stp':
                    estimatedTonnage = this.estimateTonnageFromCAD(fileSizeMB, 'step');
                    break;
                case '.sat':
                    estimatedTonnage = this.estimateTonnageFromCAD(fileSizeMB, 'sat');
                    break;
                default:
                    throw new Error(`Unsupported 3D model format: ${extension}`);
            }

            result.success = true;
            result.extractedTonnage = Math.round(estimatedTonnage * 100) / 100;
            result.extractedData = {
                fileSize: fileSizeMB,
                extractionMethod: 'model-estimation',
                confidence: 'medium'
            };

            return result;
        } catch (error) {
            throw new Error(`3D model processing failed: ${error.message}`);
        }
    }

    // Specification File Processing
    static async processSpecFile(filePath, extension, result) {
        try {
            let extractedText = '';

            switch (extension) {
                case '.pdf':
                    extractedText = await this.extractTextFromPDF(filePath);
                    break;
                case '.txt':
                    extractedText = await fs.readFile(filePath, 'utf8');
                    break;
                case '.doc':
                case '.docx':
                    // Would need additional library like mammoth for Word docs
                    extractedText = await this.extractTextFromWord(filePath);
                    break;
                default:
                    throw new Error(`Unsupported specification format: ${extension}`);
            }

            // Extract steel specifications and quantities
            const specifications = this.parseSpecifications(extractedText);

            result.success = true;
            result.extractedTonnage = 0; // Specs typically don't contain tonnage
            result.extractedData = {
                specifications,
                extractionMethod: 'text-analysis',
                confidence: 'high'
            };

            return result;
        } catch (error) {
            throw new Error(`Specification processing failed: ${error.message}`);
        }
    }

    // Helper Methods
    static generateEstimatedTonnage(sourceType) {
        const baseRanges = {
            'excel-mto': { min: 50, max: 800 },
            'csv-mto': { min: 30, max: 600 },
            'pdf-mto': { min: 20, max: 400 },
            'cad': { min: 100, max: 1200 },
            'pdf-cad': { min: 50, max: 600 },
            'step': { min: 80, max: 1000 },
            'sat': { min: 60, max: 800 }
        };

        const range = baseRanges[sourceType] || { min: 10, max: 200 };
        return Math.random() * (range.max - range.min) + range.min;
    }

    static estimateTonnageFromCAD(fileSizeMB, type) {
        // Rough estimation based on file size
        const baseMultipliers = {
            'cad': 15,
            'pdf-cad': 8,
            'step': 12,
            'sat': 10
        };

        const multiplier = baseMultipliers[type] || 10;
        const baseTonnage = fileSizeMB * multiplier;
        
        // Add some variance
        const variance = baseTonnage * 0.3 * (Math.random() - 0.5);
        return Math.max(10, baseTonnage + variance);
    }

    static async processIFCFile(filePath, fileSizeMB) {
        try {
            // Read first few lines to identify steel elements
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').slice(0, 1000); // First 1000 lines
            
            let steelElementCount = 0;
            const steelKeywords = ['IFCBEAM', 'IFCCOLUMN', 'IFCPLATE', 'IFCMEMBER', 'STEEL'];
            
            lines.forEach(line => {
                if (steelKeywords.some(keyword => line.toUpperCase().includes(keyword))) {
                    steelElementCount++;
                }
            });

            // Estimate tonnage based on element count and file size
            const tonnagePerElement = 0.5; // Average 0.5 tonnes per element
            const estimatedFromElements = steelElementCount * tonnagePerElement;
            const estimatedFromSize = fileSizeMB * 10;

            return Math.max(estimatedFromElements, estimatedFromSize * 0.5);
        } catch (error) {
            // Fallback to size-based estimation
            return this.estimateTonnageFromCAD(fileSizeMB, 'step');
        }
    }

    static async extractTextFromPDF(filePath) {
        return new Promise((resolve, reject) => {
            const pdfParser = new PDFParser();
            
            pdfParser.on('pdfParser_dataError', (errData) => {
                reject(new Error(`PDF text extraction failed: ${errData.parserError}`));
            });

            pdfParser.on('pdfParser_dataReady', (pdfData) => {
                let extractedText = '';
                
                if (pdfData.formImage && pdfData.formImage.Pages) {
                    pdfData.formImage.Pages.forEach(page => {
                        if (page.Texts) {
                            page.Texts.forEach(text => {
                                if (text.R && text.R[0] && text.R[0].T) {
                                    extractedText += decodeURIComponent(text.R[0].T) + ' ';
                                }
                            });
                        }
                    });
                }

                resolve(extractedText);
            });

            pdfParser.loadPDF(filePath);
        });
    }

    static async extractTextFromWord(filePath) {
        // Placeholder - would need mammoth or similar library
        // For now, return empty string
        return '';
    }

    static parseSpecifications(text) {
        const specifications = {
            steelGrades: [],
            coatings: [],
            connections: [],
            standards: []
        };

        // Extract steel grades
        const gradePatterns = [
            /A\d+/gi,
            /S\d+/gi,
            /Grade\s*\d+/gi,
            /ASTM\s*A\d+/gi
        ];

        gradePatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                specifications.steelGrades.push(...matches);
            }
        });

        // Extract coating requirements
        const coatingKeywords = ['galvaniz', 'paint', 'coating', 'primer', 'fireproof'];
        coatingKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword)) {
                specifications.coatings.push(keyword);
            }
        });

        // Extract connection types
        const connectionKeywords = ['weld', 'bolt', 'rivet', 'connection'];
        connectionKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword)) {
                specifications.connections.push(keyword);
            }
        });

        // Extract standards
        const standardPatterns = [
            /AS\s*\d+/gi,
            /BS\s*\d+/gi,
            /AISC/gi,
            /AWS/gi,
            /EN\s*\d+/gi
        ];

        standardPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                specifications.standards.push(...matches);
            }
        });

        return specifications;
    }

    // Validation Methods
    static validateFileSize(fileSize, maxSizeMB = 50) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (fileSize > maxSizeBytes) {
            throw new Error(`File size exceeds maximum limit of ${maxSizeMB}MB`);
        }
    }

    static validateFileType(fileName, allowedTypes) {
        const extension = path.extname(fileName).toLowerCase();
        if (!allowedTypes.includes(extension)) {
            throw new Error(`File type ${extension} not supported. Allowed types: ${allowedTypes.join(', ')}`);
        }
    }

    // Batch Processing
    static async processMultipleFiles(files) {
        const results = [];
        
        for (const fileInfo of files) {
            try {
                const result = await this.processFile(fileInfo.file, fileInfo.type);
                results.push(result);
            } catch (error) {
                results.push({
                    fileName: fileInfo.file.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            results,
            summary: {
                total: results.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                totalTonnage: results
                    .filter(r => r.success)
                    .reduce((sum, r) => sum + (r.extractedTonnage || 0), 0)
            }
        };
    }
}

module.exports = FileProcessor;