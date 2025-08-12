// Enhanced PDF Processor for Structural Drawings
import fs from 'fs/promises';
import path from 'path';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export class EnhancedPDFProcessor {
    constructor() {
        this.structuralKeywords = {
            concrete: ['concrete', 'n20', 'n25', 'n32', 'n40', 'mpa', 'slab', 'beam', 'column', 'footing'],
            steel: ['ub', 'uc', 'pfc', 'shs', 'rhs', 'steel', 'beam', 'column', 'purlin', 'girt'],
            dimensions: ['mm', 'cm', 'm', 'length', 'width', 'height', 'thickness', 'diameter'],
            quantities: ['qty', 'quantity', 'no.', 'number', 'total', 'sum'],
            materials: ['grade', 'class', 'strength', 'reinforcement', 'mesh', 'bar']
        };
    }

    async extractStructuralContent(filePath) {
        try {
            const dataBuffer = await fs.readFile(filePath);
            const uint8Array = new Uint8Array(dataBuffer);
            const doc = await pdfjsLib.getDocument(uint8Array).promise;

            const extractedContent = {
                filename: path.basename(filePath),
                pages: [],
                structuredData: {
                    titleBlocks: [],
                    schedules: [],
                    dimensions: [],
                    specifications: [],
                    quantities: []
                },
                rawText: '',
                confidence: 0
            };

            // Process each page with enhanced analysis
            for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                const page = await doc.getPage(pageNum);
                const pageData = await this._extractPageData(page, pageNum);
                extractedContent.pages.push(pageData);
                extractedContent.rawText += pageData.text + '\n';
            }

            // Analyze and structure the extracted content
            await this._structureContent(extractedContent);
            
            return extractedContent;

        } catch (error) {
            console.error(`Enhanced PDF extraction error: ${error.message}`);
            throw error;
        }
    }

    async _extractPageData(page, pageNum) {
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();
        
        const pageData = {
            pageNumber: pageNum,
            text: '',
            textItems: [],
            dimensions: { width: viewport.width, height: viewport.height },
            structuredElements: []
        };

        // Enhanced text extraction with positioning
        for (const item of textContent.items) {
            const textItem = {
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height,
                font: item.fontName,
                fontSize: Math.abs(item.transform[0])
            };
            
            pageData.textItems.push(textItem);
            pageData.text += item.str + ' ';
        }

        // Identify structured elements based on positioning and content
        pageData.structuredElements = this._identifyStructuredElements(pageData.textItems);
        
        return pageData;
    }

    _identifyStructuredElements(textItems) {
        const elements = [];
        const sortedItems = [...textItems].sort((a, b) => b.y - a.y); // Top to bottom

        let currentGroup = [];
        let lastY = null;
        const LINE_TOLERANCE = 10;

        for (const item of sortedItems) {
            if (lastY === null || Math.abs(item.y - lastY) < LINE_TOLERANCE) {
                currentGroup.push(item);
            } else {
                if (currentGroup.length > 0) {
                    elements.push(this._analyzeGroup(currentGroup));
                }
                currentGroup = [item];
            }
            lastY = item.y;
        }

        if (currentGroup.length > 0) {
            elements.push(this._analyzeGroup(currentGroup));
        }

        return elements.filter(el => el !== null);
    }

    _analyzeGroup(group) {
        const text = group.map(item => item.text).join(' ').trim();
        if (!text) return null;

        const element = {
            text: text,
            type: 'text',
            bbox: this._getGroupBoundingBox(group),
            items: group
        };

        // Classify the element type
        if (this._isTitle(text)) {
            element.type = 'title';
        } else if (this._isScheduleHeader(text)) {
            element.type = 'schedule_header';
        } else if (this._isScheduleRow(text)) {
            element.type = 'schedule_row';
            element.data = this._parseScheduleRow(text);
        } else if (this._isDimension(text)) {
            element.type = 'dimension';
            element.data = this._parseDimension(text);
        } else if (this._isSpecification(text)) {
            element.type = 'specification';
            element.data = this._parseSpecification(text);
        }

        return element;
    }

    _getGroupBoundingBox(group) {
        const xs = group.map(item => item.x);
        const ys = group.map(item => item.y);
        return {
            left: Math.min(...xs),
            right: Math.max(...xs.map((x, i) => x + group[i].width)),
            top: Math.max(...ys),
            bottom: Math.min(...ys.map((y, i) => y - group[i].height))
        };
    }

    _isTitle(text) {
        const titlePatterns = [
            /^(STEEL|CONCRETE|FOOTING|BEAM|COLUMN)\s+(SCHEDULE|LIST|TABLE)/i,
            /^(DRAWING|DWG)\s*(NO|NUMBER)[:.]?\s*[A-Z0-9-]+/i,
            /^(STRUCTURAL|FOUNDATION|FLOOR)\s+(PLAN|SECTION|ELEVATION)/i
        ];
        return titlePatterns.some(pattern => pattern.test(text));
    }

    _isScheduleHeader(text) {
        const headers = ['mark', 'size', 'length', 'quantity', 'grade', 'weight', 'member', 'section'];
        const words = text.toLowerCase().split(/\s+/);
        const headerCount = words.filter(word => headers.includes(word)).length;
        return headerCount >= 2;
    }

    _isScheduleRow(text) {
        // Look for patterns like: B1 200UB25 6000 4 or similar
        const patterns = [
            /^[A-Z]\d+\s+\d+[A-Z]+\d+\s+\d+\s+\d+/,  // Mark, Section, Length, Qty
            /^[A-Z]+\d*\s+\d+\s*x\s*\d+\s*x\s*\d+/,   // Section with dimensions
            /^\d+\s+[A-Z]+\d+\s+\d+/                   // Simple schedule row
        ];
        return patterns.some(pattern => pattern.test(text));
    }

    _isDimension(text) {
        const dimensionPatterns = [
            /\d+\s*x\s*\d+\s*x\s*\d+\s*(mm|m)/i,
            /\d+\.\d+\s*m\s*x\s*\d+\.\d+\s*m/i,
            /ø\s*\d+\s*(mm)?/i,
            /\d+\s*(mm|m)\s+(long|wide|thick)/i
        ];
        return dimensionPatterns.some(pattern => pattern.test(text));
    }

    _isSpecification(text) {
        return this.structuralKeywords.concrete.some(kw => 
            text.toLowerCase().includes(kw)
        ) || this.structuralKeywords.steel.some(kw => 
            text.toLowerCase().includes(kw)
        );
    }

    _parseScheduleRow(text) {
        const parts = text.split(/\s+/);
        const data = {};
        
        // Try to identify common schedule patterns
        if (parts.length >= 4) {
            // Pattern: Mark, Section, Length, Quantity
            data.mark = parts[0];
            data.section = parts[1];
            data.length = this._parseNumber(parts[2]);
            data.quantity = this._parseNumber(parts[3]);
            
            if (parts.length > 4) {
                data.weight = this._parseNumber(parts[4]);
            }
        }
        
        return data;
    }

    _parseDimension(text) {
        const dimensionMatch = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x?\s*(\d+(?:\.\d+)?)?/i);
        if (dimensionMatch) {
            return {
                length: parseFloat(dimensionMatch[1]),
                width: parseFloat(dimensionMatch[2]),
                height: dimensionMatch[3] ? parseFloat(dimensionMatch[3]) : null,
                unit: this._extractUnit(text)
            };
        }
        return { raw: text };
    }

    _parseSpecification(text) {
        const specs = {};
        
        // Extract concrete grades
        const concreteMatch = text.match(/N(\d{2,3})/i);
        if (concreteMatch) {
            specs.concreteGrade = `N${concreteMatch[1]}`;
        }
        
        // Extract steel sections
        const steelMatch = text.match(/(\d+)(UB|UC|PFC|SHS|RHS)(\d+)/i);
        if (steelMatch) {
            specs.steelSection = `${steelMatch[1]}${steelMatch[2]}${steelMatch[3]}`;
        }
        
        return specs;
    }

    _parseNumber(str) {
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    _extractUnit(text) {
        const unitMatch = text.match(/(mm|cm|m|kg|tonne)/i);
        return unitMatch ? unitMatch[1].toLowerCase() : 'mm';
    }

    async _structureContent(extractedContent) {
        const allElements = extractedContent.pages.flatMap(page => page.structuredElements);
        
        // Group elements by type
        extractedContent.structuredData.titleBlocks = allElements.filter(el => el.type === 'title');
        extractedContent.structuredData.schedules = this._buildSchedules(allElements);
        extractedContent.structuredData.dimensions = allElements.filter(el => el.type === 'dimension');
        extractedContent.structuredData.specifications = allElements.filter(el => el.type === 'specification');
        
        // Calculate confidence based on structured data found
        extractedContent.confidence = this._calculateConfidence(extractedContent.structuredData);
        
        return extractedContent;
    }

    _buildSchedules(elements) {
        const schedules = [];
        let currentSchedule = null;
        
        for (const element of elements) {
            if (element.type === 'schedule_header') {
                // Start new schedule
                if (currentSchedule) {
                    schedules.push(currentSchedule);
                }
                currentSchedule = {
                    title: element.text,
                    headers: element.text.toLowerCase().split(/\s+/),
                    rows: []
                };
            } else if (element.type === 'schedule_row' && currentSchedule) {
                currentSchedule.rows.push(element);
            }
        }
        
        if (currentSchedule) {
            schedules.push(currentSchedule);
        }
        
        return schedules;
    }

    _calculateConfidence(structuredData) {
        let score = 0;
        const maxScore = 100;
        
        // Award points for finding structured data
        if (structuredData.schedules.length > 0) score += 40;
        if (structuredData.dimensions.length > 0) score += 20;
        if (structuredData.specifications.length > 0) score += 20;
        if (structuredData.titleBlocks.length > 0) score += 20;
        
        return Math.min(score, maxScore) / maxScore;
    }

    // Method to convert structured data for AI analysis
    formatForAIAnalysis(extractedContent) {
        const formatted = {
            filename: extractedContent.filename,
            confidence: extractedContent.confidence,
            
            // Structured summaries for better AI understanding
            project_info: this._extractProjectInfo(extractedContent),
            steel_schedules: this._formatSteelSchedules(extractedContent.structuredData.schedules),
            concrete_elements: this._formatConcreteElements(extractedContent),
            dimensions_found: this._formatDimensions(extractedContent.structuredData.dimensions),
            
            // Raw text for fallback
            raw_text: extractedContent.rawText.substring(0, 10000), // Limit for API
            
            // Processing metadata
            pages_processed: extractedContent.pages.length,
            elements_found: {
                schedules: extractedContent.structuredData.schedules.length,
                dimensions: extractedContent.structuredData.dimensions.length,
                specifications: extractedContent.structuredData.specifications.length
            }
        };
        
        return formatted;
    }

    _extractProjectInfo(content) {
        const info = {};
        const titleBlocks = content.structuredData.titleBlocks;
        
        for (const title of titleBlocks) {
            const text = title.text;
            
            // Extract drawing number
            const dwgMatch = text.match(/(?:DWG|DRAWING)\s*(?:NO|NUMBER)[:.]?\s*([A-Z0-9-]+)/i);
            if (dwgMatch) info.drawing_number = dwgMatch[1];
            
            // Extract revision
            const revMatch = text.match(/REV[:.]?\s*([A-Z0-9]+)/i);
            if (revMatch) info.revision = revMatch[1];
        }
        
        return info;
    }

    _formatSteelSchedules(schedules) {
        return schedules.map(schedule => ({
            title: schedule.title,
            items: schedule.rows.map(row => ({
                mark: row.data?.mark || '',
                section: row.data?.section || '',
                length: row.data?.length || 0,
                quantity: row.data?.quantity || 0,
                weight: row.data?.weight || 0,
                raw_text: row.text
            }))
        }));
    }

    _formatConcreteElements(content) {
        const elements = [];
        const specs = content.structuredData.specifications;
        const dimensions = content.structuredData.dimensions;
        
        // Correlate specifications with dimensions where possible
        for (const spec of specs) {
            if (spec.data?.concreteGrade) {
                elements.push({
                    grade: spec.data.concreteGrade,
                    context: spec.text,
                    associated_dimensions: dimensions.filter(dim => 
                        Math.abs(dim.bbox.top - spec.bbox.top) < 50 // Same approximate area
                    )
                });
            }
        }
        
        return elements;
    }

    _formatDimensions(dimensions) {
        return dimensions.map(dim => ({
            text: dim.text,
            parsed: dim.data,
            context: 'structural_element' // Could be enhanced to classify type
        }));
    }
}
