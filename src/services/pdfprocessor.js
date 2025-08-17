// src/services/pdfprocessor.js - CORRECTED VERSION
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export class PdfProcessor {
    constructor() {
        this.patterns = {
            // ... (all other patterns remain the same) ...

            // FIXED: Stricter regex for quantities to avoid capturing dimensions
            quantities: /(?:(\d+)\s*(?:NO|NOS|OFF|QTY|QUANTITY)\b)|(?:QTY\s*:?\s*(\d+))|(?:\b(\d{1,3})\s+(?:PIECES?|PCS|ITEMS)\b)/gi,
            
            lengths: /(\d{1,5})\s*(?:MM|M)\s*(?:LONG|LENGTH|LG)|L\s*=\s*(\d{1,5})\s*(?:MM|M)?/gi,
            weights: /(\d{1,3}(?:\.\d+)?)\s*(?:KG\/M|KG|T\/M|TONNE)/gi,
        };
        this.categories = {
            mainMembers: ['universalBeams', 'universalColumns', 'pfcChannels', 'tSections'],
            hollowSections: ['shs', 'rhs', 'chs'],
            angles: ['equalAngles', 'unequalAngles'],
            purlins: ['cPurlins', 'zPurlins', 'topHats'],
            plates: ['plates', 'stiffeners', 'basePlates', 'capPlates', 'splicePlates', 'webPlates', 'flangePlates', 'haunchPlates'],
            bars: ['flatBars', 'roundBars', 'squareBars'],
            connections: ['bolts', 'hexBolts', 'coachScrews', 'structuralScrews', 'anchorBolts'],
            hardware: ['washers', 'nuts'],
            miscellaneous: ['brackets', 'weldedBeams', 'welding']
        };
    }

    async extractSteelInformation(pdfBuffer) {
        console.log('🚀 Starting COMPREHENSIVE Australian Steel Extraction...');
        const pageTexts = await this._getTextWithLayout(pdfBuffer);
        
        if (!pageTexts || pageTexts.length === 0) {
            throw new Error("PDF text extraction failed or returned no content.");
        }

        const steelData = {
            mainMembers: [],
            hollowSections: [],
            angles: [],
            purlins: [],
            plates: [],
            bars: [],
            connections: [],
            hardware: [],
            miscellaneous: [],
            summary: {}
        };

        const uniqueEntries = new Set();
        
        for (const page of pageTexts) {
            const scheduleTypes = [
                { title: 'BEAM SCHEDULE', target: 'mainMembers', category: 'mainMembers' },
                { title: 'COLUMN SCHEDULE', target: 'mainMembers', category: 'mainMembers' },
                { title: 'PURLIN SCHEDULE', target: 'purlins', category: 'purlins' },
                { title: 'GIRT SCHEDULE', target: 'purlins', category: 'purlins' }
            ];

            scheduleTypes.forEach(schedule => {
                this._processSchedule(page.lines, schedule.title, steelData[schedule.target], uniqueEntries, schedule.category);
            });

            this._processGeneralText(page.lines, steelData, uniqueEntries);
        }

        this._finalizeClassification(steelData);
        steelData.summary = this._createDetailedSummary(steelData);

        return steelData;
    }

    async _getTextWithLayout(pdfBuffer) {
        const uint8Array = new Uint8Array(pdfBuffer);
        const pdf = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true, verbosity: 0 }).promise;
        
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const items = content.items;

            items.sort((a, b) => {
                const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                return yDiff > 5 ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4];
            });

            const lines = [];
            let currentLine = { y: -1, text: '', items: [] };
            
            for (const item of items) {
                if (Math.abs(item.transform[5] - currentLine.y) > 5) {
                    if (currentLine.text.trim()) lines.push(currentLine);
                    currentLine = { y: item.transform[5], text: item.str, items: [item] };
                } else {
                    currentLine.text += ' ' + item.str;
                    currentLine.items.push(item);
                }
            }
            if (currentLine.text.trim()) lines.push(currentLine);
            
            pages.push({ pageNumber: i, lines });
        }
        return pages;
    }

    _processSchedule(lines, scheduleTitle, targetArray, uniqueEntries, category) {
        const titleIndex = lines.findIndex(line => line.text.toUpperCase().includes(scheduleTitle.toUpperCase()));
        if (titleIndex === -1) return 0;

        let itemsFound = 0;
        const maxLines = Math.min(titleIndex + 30, lines.length);
        
        for (let i = titleIndex + 1; i < maxLines; i++) {
            const lineText = lines[i].text.trim();
            if (!lineText || (lineText.toUpperCase().includes('SCHEDULE') && !lineText.toUpperCase().includes(scheduleTitle.toUpperCase()))) continue;

            const foundItems = this._extractSteelFromLine(lineText, category, scheduleTitle);
            
            foundItems.forEach(item => {
                const uniqueKey = `${item.designation}-${item.category}-${scheduleTitle}`;
                if (!uniqueEntries.has(uniqueKey)) {
                    uniqueEntries.add(uniqueKey);
                    targetArray.push(item);
                    itemsFound++;
                }
            });
        }
        return itemsFound;
    }

    _processGeneralText(lines, steelData, uniqueEntries) {
        lines.forEach(line => {
            const text = line.text.trim();
            if (this._shouldSkipLine(text)) return;

            Object.entries(this.categories).forEach(([categoryName]) => {
                const foundItems = this._extractSteelFromLine(text, categoryName, 'General Text');
                
                foundItems.forEach(item => {
                    const uniqueKey = `${item.designation}-${item.category}-general`;
                    if (!uniqueEntries.has(uniqueKey)) {
                        uniqueEntries.add(uniqueKey);
                        steelData[categoryName].push(item);
                    }
                });
            });
        });
    }

    _extractSteelFromLine(lineText, preferredCategory, source) {
        const foundItems = [];
        const quantity = this._extractQuantity(lineText) || 1;
        
        Object.keys(this.categories).forEach(categoryName => {
            this.categories[categoryName].forEach(patternName => {
                if (this.patterns[patternName]) {
                    const matches = [...lineText.matchAll(this.patterns[patternName])];
                    matches.forEach(match => {
                        const designation = this._normalizeDesignation(match[0], patternName);
                        const classification = this._classifySteel(designation, patternName);
                        
                        if (designation && classification) {
                            foundItems.push({
                                type: classification.type,
                                designation: designation,
                                category: classification.category,
                                quantity: quantity,
                                source: source
                            });
                        }
                    });
                }
            });
        });
        return foundItems;
    }

    _shouldSkipLine(text) {
        const skipPatterns = [/^(DRAWING|TITLE|SCALE|DATE)/i, /^(SHEET|PAGE|\d+\s*OF\s*\d+)/i, /^\s*[A-Z]\s*$/i];
        return skipPatterns.some(pattern => pattern.test(text)) || text.length < 3;
    }

    _extractQuantity(text) {
        this.patterns.quantities.lastIndex = 0;
        const match = this.patterns.quantities.exec(text);
        if (!match) return null;
        const qty = parseInt(match[1] || match[2] || match[3] || match[4] || match[5]);
        return (isNaN(qty) || qty <= 0 || qty > 10000) ? null : qty;
    }

    _normalizeDesignation(rawDesignation, patternName) {
        let designation = rawDesignation.replace(/\s+/g, '').replace(/[×]/g, 'x').toUpperCase().trim();
        if (patternName.includes('Purlins')) {
            const match = designation.match(/([CZ])(\d{2,3})(\d{1,2}(?:\.\d+)?)/);
            if (match && !designation.includes('/')) {
                designation = `${match[1]}${match[2]}/${match[3]}`;
            }
        }
        return designation;
    }

    _classifySteel(designation, patternName) {
        const classifications = {
            universalBeams: { type: 'Universal Beam', category: 'mainMembers' },
            universalColumns: { type: 'Universal Column', category: 'mainMembers' },
            pfcChannels: { type: 'Parallel Flange Channel', category: 'mainMembers' },
            shs: { type: 'Square Hollow Section', category: 'hollowSections' },
            rhs: { type: 'Rectangular Hollow Section', category: 'hollowSections' },
            chs: { type: 'Circular Hollow Section', category: 'hollowSections' },
            equalAngles: { type: 'Equal Angle', category: 'angles' },
            unequalAngles: { type: 'Unequal Angle', category: 'angles' },
            cPurlins: { type: 'C Purlin', category: 'purlins' },
            zPurlins: { type: 'Z Purlin', category: 'purlins' },
            plates: { type: 'Plate', category: 'plates' },
            bolts: { type: 'Bolt', category: 'connections' }
        };
        return classifications[patternName] || { type: 'Unknown', category: 'miscellaneous' };
    }

    _finalizeClassification(steelData) {
        Object.entries(steelData).forEach(([category, items]) => {
            if (category === 'summary') return;
            items.forEach((item, index) => {
                const correctCategory = this._determineCorrectCategory(item.designation);
                if (correctCategory && correctCategory !== category) {
                    steelData[correctCategory].push({ ...item, category: correctCategory });
                    items[index] = null;
                }
            });
            steelData[category] = items.filter(item => item !== null);
        });
    }

    _determineCorrectCategory(designation) {
        const d = designation.toUpperCase();
        if (d.includes('UB') || d.includes('UC') || d.includes('PFC')) return 'mainMembers';
        if (d.includes('SHS') || d.includes('RHS') || d.includes('CHS')) return 'hollowSections';
        if (d.startsWith('L') && d.includes('X')) return 'angles';
        if (d.startsWith('C') || d.startsWith('Z')) return 'purlins';
        if (d.includes('PL') || d.includes('PLATE')) return 'plates';
        if (d.includes('M') && /M\d+/.test(d)) return 'connections';
        return null;
    }

    _createDetailedSummary(steelData) {
        const summary = { totalItems: 0 };
        Object.entries(steelData).forEach(([category, items]) => {
            if (category !== 'summary') {
                summary.totalItems += items.length;
            }
        });
        return summary;
    }
}
