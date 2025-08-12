import fs from 'fs/promises';
import path from 'path';
import { fromPath } from 'pdf2pic';

// UPDATED: Use the specific build for Node.js/ES Module environments
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

/**
 * Container for extracted PDF content
 */
export class ExtractedContent {
    constructor({
        filename = '',
        text = '',
        tables = [],
        images = [],
        metadata = {},
        drawingElements = []
    } = {}) {
        this.filename = filename;
        this.text = text;
        this.tables = tables;
        this.images = images;
        this.metadata = metadata;
        this.drawingElements = drawingElements;
    }
}

/**
 * Advanced PDF processing for structural drawings
 */
export class PDFProcessor {
    constructor() {
        this.supportedFormats = ['.pdf', '.dwg', '.dxf'];
        this.tableKeywords = [
            'schedule', 'legend', 'notes', 'specification',
            'material', 'steel', 'concrete', 'footing', 'beam'
        ];
        
        // UPDATED: Set a robust path to the worker script for server environments.
        // This is necessary to prevent initialization errors with the library.
        pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.mjs';
    }

    /**
     * Main extraction method for PDF files
     * @param {string} filePath - Path to the file
     * @returns {Promise<Object>} Extracted content
     */
    async extractContent(filePath) {
        try {
            const filename = path.basename(filePath);
            const fileExt = path.extname(filename).toLowerCase();

            if (fileExt === '.pdf') {
                return await this._extractPdfContent(filePath);
            } else if (['.dwg', '.dxf'].includes(fileExt)) {
                return await this._extractCadContent(filePath);
            } else {
                throw new Error(`Unsupported file format: ${fileExt}`);
            }
        } catch (error) {
            console.error(`Content extraction error for ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract comprehensive content from PDF using pdfjs-dist
     * @param {string} filePath - Path to PDF file
     * @returns {Promise<Object>} Extracted content
     */
    async _extractPdfContent(filePath) {
        try {
            const dataBuffer = await fs.readFile(filePath);
            const doc = await pdfjsLib.getDocument(dataBuffer).promise;

            const extractedContent = {
                filename: path.basename(filePath),
                text: '',
                tables: [],
                images: [],
                metadata: {},
                drawingElements: [],
                pages: []
            };

            // Extract basic metadata
            const metadata = await doc.getMetadata();
            extractedContent.metadata = {
                pageCount: doc.numPages,
                title: metadata.info?.Title || '',
                author: metadata.info?.Author || '',
                subject: metadata.info?.Subject || '',
                creator: metadata.info?.Creator || '',
                producer: metadata.info?.Producer || '',
                creationDate: metadata.info?.CreationDate || '',
                modificationDate: metadata.info?.ModDate || ''
            };

            // Extract text content from all pages
            let fullText = '';
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
                
                extractedContent.pages.push({
                    pageNumber: i,
                    text: pageText,
                    dimensions: page.view,
                    rotation: page.rotate
                });
            }
            extractedContent.text = fullText;

            // Process text for tables and elements
            const textLines = fullText.split('\n').filter(line => line.trim());
            
            // Extract tables from text
            extractedContent.tables = await this._extractTablesFromText(textLines);

            // Extract images (basic implementation)
            extractedContent.images = await this._extractImages(filePath);

            // Extract drawing elements from text patterns
            extractedContent.drawingElements = await this._extractDrawingElements(textLines);

            // Post-process to identify structural elements
            return await this._postProcessContent(extractedContent);

        } catch (error) {
            console.error(`PDF extraction error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract tables from text lines
     * @param {string[]} textLines - Array of text lines
     * @returns {Promise<Array>} Extracted tables
     */
    async _extractTablesFromText(textLines) {
        const tables = [];
        let currentTable = [];
        let tableIndex = 0;

        for (let i = 0; i < textLines.length; i++) {
            const line = textLines[i];

            if (this._isTableLine(line)) {
                currentTable.push({
                    text: line.trim(),
                    lineNumber: i,
                    page: Math.floor(i / 50) // Rough page estimation
                });
            } else if (currentTable.length > 0) {
                // End of current table
                if (currentTable.length > 2) { // Minimum rows for a table
                    const tableDict = {
                        tableId: `table_${tableIndex}`,
                        page: currentTable[0].page,
                        rows: [],
                        type: 'extracted',
                        bbox: null
                    };

                    // Convert table data to structured format
                    for (const row of currentTable) {
                        const columns = this._splitTableRow(row.text);
                        tableDict.rows.push(columns);
                    }

                    if (tableDict.rows.length > 0) {
                        tables.push(tableDict);
                        tableIndex++;
                    }
                }
                currentTable = [];
            }
        }

        // Add final table if exists
        if (currentTable.length > 2) {
            const tableDict = {
                tableId: `table_${tableIndex}`,
                page: currentTable[0].page,
                rows: [],
                type: 'extracted',
                bbox: null
            };

            for (const row of currentTable) {
                const columns = this._splitTableRow(row.text);
                tableDict.rows.push(columns);
            }

            if (tableDict.rows.length > 0) {
                tables.push(tableDict);
            }
        }

        return tables;
    }

    /**
     * Check if a line of text appears to be part of a table
     * @param {string} text - Text line to check
     * @returns {boolean} True if appears to be table content
     */
    _isTableLine(text) {
        const indicators = [
            /\s+\d+\s+/.test(text), // Numbers with spaces
            /\|\s*\w+\s*\|/.test(text), // Pipe-separated
            /\t/.test(text), // Tab-separated
            this.tableKeywords.some(keyword => text.toLowerCase().includes(keyword)),
            /^\s*\w+\s+\d+/.test(text), // Text followed by numbers
            /^\s*[A-Z]\d+/.test(text), // Reference codes like N12, M16
        ];

        return indicators.some(indicator => indicator);
    }

    /**
     * Split table row into columns
     * @param {string} text - Table row text
     * @returns {string[]} Array of column values
     */
    _splitTableRow(text) {
        // Try different splitting methods
        if (text.includes('|')) {
            return text.split('|').map(col => col.trim());
        } else if (text.includes('\t')) {
            return text.split('\t').map(col => col.trim());
        } else if (/\s{3,}/.test(text)) { // Multiple spaces
            return text.split(/\s{3,}/).map(col => col.trim());
        } else {
            // Try to split on spaces while preserving meaningful groups
            const parts = text.split(/\s+/);
            return parts.length > 1 ? parts : [text.trim()];
        }
    }

    /**
     * Extract images from PDF (basic implementation)
     * @param {string} filePath - Path to PDF file
     * @returns {Promise<Array>} Array of image information
     */
    async _extractImages(filePath) {
        const images = [];
        
        try {
            const options = {
                density: 100,
                saveFilename: "page",
                savePath: "./temp/",
                format: "png",
                width: 600,
                height: 600
            };
            const convert = fromPath(filePath, options);

            // Note: This would convert PDF pages to images
            // For actual image extraction from PDF, you'd need a different approach
            
            images.push({
                imageId: 'pdf_conversion',
                page: 1,
                size: 0,
                width: 600,
                height: 600,
                colorspace: 'RGB',
                hasAlpha: false,
                data: null // Would contain actual image data
            });

        } catch (error) {
            console.error(`Image extraction error: ${error.message}`);
        }

        return images;
    }

    /**
     * Extract drawing elements from text lines
     * @param {string[]} textLines - Array of text lines
     * @returns {Promise<Array>} Array of drawing elements
     */
    async _extractDrawingElements(textLines) {
        const elements = [];

        try {
            textLines.forEach((line, index) => {
                if (line.trim()) {
                    const element = {
                        page: Math.floor(index / 50), // Rough page estimation
                        type: 'text',
                        text: line.trim(),
                        lineNumber: index,
                        fontInfo: {} // Would need more advanced parsing
                    };
                    elements.push(element);
                }
            });

        } catch (error) {
            console.error(`Drawing elements extraction error: ${error.message}`);
        }

        return elements;
    }

    /**
     * Post-process extracted content to identify structural elements
     * @param {Object} content - Extracted content object
     * @returns {Promise<Object>} Post-processed content
     */
    async _postProcessContent(content) {
        try {
            // Identify steel schedules
            content.steelSchedule = this._identifySteelSchedule(content.text);

            // Identify concrete specifications
            content.concreteSpecifications = this._identifyConcreteSpecs(content.text);

            // Identify dimensions and quantities
            content.dimensions = this._extractDimensions(content.text);

            // Identify drawing numbers and revisions
            content.drawingInfo = this._extractDrawingInfo(content.text);

            // Clean and structure tables
            content.structuredTables = this._structureTables(content.tables);

            return content;

        } catch (error) {
            console.error(`Post-processing error: ${error.message}`);
            return content;
        }
    }

    /**
     * Identify steel member schedules in text
     * @param {string} text - Text to analyze
     * @returns {Array} Array of steel elements found
     */
    _identifySteelSchedule(text) {
        const steelElements = [];
        const patterns = [
            /UB\s*\d+\s*x?\s*\d+\.?\d*/gi,  // Universal beams
            /UC\s*\d+\s*x?\s*\d+\.?\d*/gi,  // Universal columns
            /PFC\s*\d+/gi,  // Parallel flange channels
            /SHS\s*\d+\s*x?\s*\d+\s*x?\s*\d+\.?\d*/gi,  // Square hollow sections
            /RHS\s*\d+\s*x?\s*\d+\s*x?\s*\d+\.?\d*/gi,  // Rectangular hollow sections
            /CEE?\s*\d+/gi,  // C sections
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                steelElements.push({
                    section: match[0],
                    position: [match.index, match.index + match[0].length],
                    context: text.substring(Math.max(0, match.index - 50), match.index + match[0].length + 50)
                });
            }
        });
        return steelElements;
    }

    /**
     * Identify concrete specifications
     * @param {string} text - Text to analyze
     * @returns {Array} Array of concrete specifications found
     */
    _identifyConcreteSpecs(text) {
        const concreteSpecs = [];
        const gradePatterns = [ /N\d{2,3}/gi, /\d{2,3}\s*MPa/gi ];

        gradePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                concreteSpecs.push({
                    grade: match[0],
                    position: [match.index, match.index + match[0].length],
                    context: text.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30)
                });
            }
        });
        return concreteSpecs;
    }

    /**
     * Extract dimensions from text
     * @param {string} text - Text to analyze
     * @returns {Array} Array of dimensions found
     */
    _extractDimensions(text) {
        const dimensions = [];
        const patterns = [
            /\d+\s*x\s*\d+\s*x\s*\d+/g,
            /\d+\s*mm\s*x\s*\d+\s*mm/g,
            /\d+\.\d+\s*m\s*x\s*\d+\.\d+\s*m/g,
            /Ø\s*\d+/g,
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                dimensions.push({
                    dimension: match[0],
                    position: [match.index, match.index + match[0].length],
                    context: text.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20)
                });
            }
        });
        return dimensions;
    }

    /**
     * Extract drawing numbers, revisions, dates
     * @param {string} text - Text to analyze
     * @returns {Object} Drawing information
     */
    _extractDrawingInfo(text) {
        const info = {};
        const dwgPatterns = [ /DRG\s*No\.?\s*:?\s*([A-Z]?\d+\.?\d*)/i, /Drawing\s*No\.?\s*:?\s*([A-Z]?\d+\.?\d*)/i, /(\d+-\d+)/g ];
        for (const pattern of dwgPatterns) {
            const match = text.match(pattern);
            if (match) { info.drawingNumber = match[1]; break; }
        }

        const revPatterns = [ /REV\.?\s*:?\s*([A-Z0-9]+)/i, /Revision\s*:?\s*([A-Z0-9]+)/i ];
        for (const pattern of revPatterns) {
            const match = text.match(pattern);
            if (match) { info.revision = match[1]; break; }
        }

        const datePatterns = [ /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, /\d{1,2}\s+\w{3,9}\s+\d{2,4}/g ];
        for (const pattern of datePatterns) {
            const matches = text.match(pattern);
            if (matches) { info.dates = matches; break; }
        }
        return info;
    }

    /**
     * Structure and clean up extracted tables
     * @param {Array} tables - Array of extracted tables
     * @returns {Array} Array of structured tables
     */
    _structureTables(tables) {
        const structured = [];
        for (const table of tables) {
            if (!table.rows || table.rows.length === 0) continue;
            const structuredTable = {
                tableId: table.tableId || '',
                page: table.page || 0,
                type: this._classifyTable(table.rows),
                headers: [],
                data: [],
                summary: {}
            };
            if (table.rows.length > 0) {
                structuredTable.headers = table.rows[0];
                structuredTable.data = table.rows.slice(1);
            }
            structuredTable.summary = {
                rowCount: structuredTable.data.length,
                columnCount: structuredTable.headers.length,
                hasNumbers: structuredTable.data.some(row => row.some(cell => /\d/.test(String(cell))))
            };
            structured.push(structuredTable);
        }
        return structured;
    }

    /**
     * Classify table type based on content
     * @param {Array} rows - Table rows
     * @returns {string} Table type classification
     */
    _classifyTable(rows) {
        if (!rows || rows.length === 0) return 'unknown';
        const allText = rows.flat().join(' ').toLowerCase();

        if (['steel', 'beam', 'ub', 'pfc', 'shs'].some(keyword => allText.includes(keyword))) return 'steel_schedule';
        if (['concrete', 'n20', 'n32', 'n40', 'mpa'].some(keyword => allText.includes(keyword))) return 'concrete_schedule';
        if (['footing', 'pf', 'pad'].some(keyword => allText.includes(keyword))) return 'footing_schedule';
        if (['anchor', 'm12', 'm16', 'hilti'].some(keyword => allText.includes(keyword))) return 'anchor_schedule';
        if (allText.includes('schedule')) return 'general_schedule';
        if (['note', 'specification', 'requirement'].some(keyword => allText.includes(keyword))) return 'notes';
        return 'data_table';
    }

    /**
     * Extract content from CAD files (placeholder)
     * @param {string} filePath - Path to CAD file
     * @returns {Promise<Object>} CAD content (placeholder)
     */
    async _extractCadContent(filePath) {
        return {
            filename: path.basename(filePath),
            text: `CAD file: ${path.basename(filePath)} (processing not yet implemented)`,
            tables: [],
            images: [],
            metadata: { fileType: 'CAD', status: 'not_processed' },
            drawingElements: []
        };
    }

    /**
     * Generate summary of extracted content
     * @param {Object} content - Extracted content object
     * @returns {Object} Content summary
     */
    getContentSummary(content) {
        return {
            filename: content.filename || '',
            pages: content.pages ? content.pages.length : 0,
            textLength: content.text ? content.text.length : 0,
            tableCount: content.tables ? content.tables.length : 0,
            imageCount: content.images ? content.images.length : 0,
            steelElementsFound: content.steelSchedule ? content.steelSchedule.length : 0,
            concreteSpecsFound: content.concreteSpecifications ? content.concreteSpecifications.length : 0,
            dimensionsFound: content.dimensions ? content.dimensions.length : 0,
            drawingInfo: content.drawingInfo || {},
        };
    }
}
