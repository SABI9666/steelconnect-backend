// src/services/pdfprocessor.js - CORRECTED VERSION
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export class PdfProcessor {
    constructor() {
        this.patterns = {
            universalBeams: /(\d{2,4})\s*UB\s*(\d{1,3}(?:\.\d+)?)/gi,
            universalColumns: /(\d{2,4})\s*UC\s*(\d{1,3}(?:\.\d+)?)/gi,
            pfcChannels: /(\d{2,4})\s*PFC\s*(\d{1,3}(?:\.\d+)?)/gi,
            shs: /SHS\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)/gi,
            rhs: /RHS\s*(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)/gi,
            equalAngles: /L\s*(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)/gi,
            cPurlins: /C\s*(\d{2,3})\s*[\/-]\s*(\d{1,2}(?:\.\d+)?)/gi,
            zPurlins: /Z\s*(\d{2,3})\s*[\/-]\s*(\d{1,2}(?:\.\d+)?)/gi,
            plates: /(?:PL|PLATE)\s*(\d{1,3})/gi,
            bolts: /M(\d{1,2})\s*(?:BOLT|B)?/gi,
            quantities: /(?:(\d+)\s*(?:NO|NOS|OFF|QTY)\b)|(?:QTY\s*:?\s*(\d+))|(?:\b(\d{1,3})\s+(?:PCS|ITEMS)\b)/gi,
        };
        this.categories = {
            mainMembers: ['universalBeams', 'universalColumns', 'pfcChannels'],
            hollowSections: ['shs', 'rhs'],
            angles: ['equalAngles'],
            purlins: ['cPurlins', 'zPurlins'],
            plates: ['plates'],
            connections: ['bolts'],
        };
    }

    async extractSteelInformation(pdfBuffer) {
        const pageTexts = await this._getTextWithLayout(pdfBuffer);
        if (!pageTexts || pageTexts.length === 0) {
            throw new Error("PDF text extraction failed.");
        }

        const steelData = {
            mainMembers: [], hollowSections: [], angles: [],
            purlins: [], plates: [], connections: [],
            miscellaneous: [], summary: {}
        };
        const uniqueEntries = new Set();

        for (const page of pageTexts) {
            for (const line of page.lines) {
                const foundItems = this._extractSteelFromLine(line.text);
                foundItems.forEach(item => {
                    const uniqueKey = `${item.designation}-${item.category}`;
                    if (!uniqueEntries.has(uniqueKey)) {
                        uniqueEntries.add(uniqueKey);
                        if (steelData[item.category]) {
                            steelData[item.category].push(item);
                        }
                    }
                });
            }
        }
        
        steelData.summary = this._createDetailedSummary(steelData);
        return steelData;
    }

    _extractSteelFromLine(lineText) {
        const foundItems = [];
        const quantity = this._extractQuantity(lineText) || 1;

        for (const categoryName in this.categories) {
            for (const patternName of this.categories[categoryName]) {
                const regex = this.patterns[patternName];
                if (regex) {
                    const matches = [...lineText.matchAll(regex)];
                    for (const match of matches) {
                        const designation = match[0].trim();
                        foundItems.push({
                            designation: this._normalizeDesignation(designation),
                            quantity: quantity,
                            category: categoryName,
                        });
                    }
                }
            }
        }
        return foundItems;
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
            let currentLine = null;
            
            for (const item of items) {
                if (!currentLine || Math.abs(item.transform[5] - currentLine.y) > 5) {
                    if (currentLine) lines.push({ text: currentLine.text.trim() });
                    currentLine = { y: item.transform[5], text: item.str };
                } else {
                    currentLine.text += ' ' + item.str;
                }
            }
            if (currentLine) lines.push({ text: currentLine.text.trim() });
            
            pages.push({ pageNumber: i, lines });
        }
        return pages;
    }

    _extractQuantity(text) {
        this.patterns.quantities.lastIndex = 0;
        const match = this.patterns.quantities.exec(text);
        if (!match) return null;
        const qty = parseInt(match[1] || match[2] || match[3]);
        return isNaN(qty) ? null : qty;
    }

    _normalizeDesignation(designation) {
        return designation.replace(/\s+/g, ' ').trim().toUpperCase();
    }

    _createDetailedSummary(steelData) {
        let totalItems = 0;
        for (const category in steelData) {
            if (Array.isArray(steelData[category])) {
                totalItems += steelData[category].length;
            }
        }
        return { totalItems };
    }
}
