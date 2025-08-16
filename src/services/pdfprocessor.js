// src/services/pdfprocessor.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// --- FIX: Changed 'export class' to 'export default class' for consistency ---
export default class PdfProcessor {
  constructor() {
    this.patterns = {
      mainMember: /(\d+\s*(?:UB|UC|WB|WC)\s*\d+\.?\d*)|(\d+\s*PFC)|((\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*(?:SHS|RHS))|(L\d{1,3}[xX×]\d{1,3}[xX×]\d{1,2}(?:\.\d+)?)/gi,
      purlin: /[CZ](\d{3})\s*(\d{2}(?:\.\d+)?)/gi,
      plate: /(?:PL|STIFFENER)\s*(\d+)/gi,
      bolts: /M(12|16|20|24|30)/gi,
      quantity: /(?:(\d+)\s*NO)|(?:QTY\s*:\s*(\d+))|(?:(\d+)x)/gi
    };
  }

  async extractSteelInformation(pdfBuffer) {
    console.log('🚀 Starting High-Accuracy PDF Steel Extraction...');
    const pageTexts = await this._getTextWithLayout(pdfBuffer);
    if (!pageTexts || pageTexts.length === 0) {
      throw new Error("PDF text extraction failed or returned no content.");
    }

    const steelData = {
      mainMembers: [],
      purlins: [],
      platesAndFittings: [],
      connections: [],
      summary: {}
    };

    const uniqueEntries = new Set();

    for (const page of pageTexts) {
      console.log(`Analyzing Page ${page.pageNumber}...`);
      this._processSchedules(page.lines, "BEAM SCHEDULE", steelData.mainMembers, uniqueEntries);
      this._processSchedules(page.lines, "COLUMN SCHEDULE", steelData.mainMembers, uniqueEntries);
      this._processSchedules(page.lines, "PURLIN SCHEDULE", steelData.purlins, uniqueEntries);
      this._findGeneralNotesItems(page.lines, this.patterns.plate, "Plate/Stiffener", steelData.platesAndFittings, uniqueEntries);
      this._findGeneralNotesItems(page.lines, this.patterns.bolts, "Bolt", steelData.connections, uniqueEntries);
    }
    
    steelData.summary = this._createSummary(steelData);
    console.log(`✅ High-Accuracy Extraction Complete. Found ${steelData.summary.totalItems} unique steel items.`);
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
        if (Math.abs(a.transform[5] - b.transform[5]) > 5) {
          return b.transform[5] - a.transform[5];
        }
        return a.transform[4] - b.transform[4];
      });

      const lines = [];
      let currentLine = { y: -1, text: '' };
      for (const item of items) {
        if (Math.abs(item.transform[5] - currentLine.y) > 5) {
          if (currentLine.text) lines.push(currentLine);
          currentLine = { y: item.transform[5], text: item.str };
        } else {
          currentLine.text += ' ' + item.str;
        }
      }
      if (currentLine.text) lines.push(currentLine);
      
      pages.push({ pageNumber: i, lines });
    }
    return pages;
  }

  _processSchedules(lines, scheduleTitle, targetArray, uniqueEntries) {
    const titleIndex = lines.findIndex(line => line.text.toUpperCase().includes(scheduleTitle));
    if (titleIndex === -1) return;

    console.log(`Found "${scheduleTitle}"...`);
    for (let i = titleIndex + 1; i < lines.length; i++) {
      const lineText = lines[i].text;
      if (lineText.trim() === '' || lineText.toUpperCase().includes("SCHEDULE")) break;

      const memberMatch = lineText.match(this.patterns.mainMember) || lineText.match(this.patterns.purlin);
      if (memberMatch) {
        const designation = this._normalizeDesignation(memberMatch[0]);
        
        if (!uniqueEntries.has(designation)) {
          uniqueEntries.add(designation);
          targetArray.push({
            type: this._classifyMember(designation),
            designation: designation,
            quantity: this._findQuantityInLine(lineText) || 1,
            source: scheduleTitle
          });
        }
      }
    }
  }

  _findGeneralNotesItems(lines, pattern, type, targetArray, uniqueEntries) {
      lines.forEach(line => {
          const matches = [...line.text.matchAll(pattern)];
          matches.forEach(match => {
              const designation = this._normalizeDesignation(match[0]);
              if (!uniqueEntries.has(designation)) {
                  uniqueEntries.add(designation);
                  targetArray.push({
                      type: type,
                      designation: designation,
                      quantity: this._findQuantityInLine(line.text) || 1,
                      source: "General Notes / Detail"
                  });
              }
          });
      });
  }

  _findQuantityInLine(lineText) {
      const qtyMatch = lineText.match(this.patterns.quantity);
      if (!qtyMatch) return null;
      return parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3]);
  }

  _classifyMember(designation) {
    const d = designation.toUpperCase();
    if (d.includes('UB') || d.includes('WB')) return 'Universal Beam';
    if (d.includes('UC') || d.includes('WC')) return 'Universal Column';
    if (d.includes('PFC')) return 'Parallel Flange Channel';
    if (d.includes('SHS')) return 'Square Hollow Section';
    if (d.includes('RHS')) return 'Rectangular Hollow Section';
    if (d.includes('L')) return 'Angle';
    if (d.startsWith('C') || d.startsWith('Z')) return 'Purlin';
    return 'Unknown Member';
  }

  _normalizeDesignation(designation) {
    return designation.replace(/\s+/g, ' ').replace(/[×]/g, 'x').toUpperCase().trim();
  }

  _createSummary(steelData) {
    return {
      totalItems: steelData.mainMembers.length + steelData.purlins.length + steelData.platesAndFittings.length + steelData.connections.length,
      mainMembersCount: steelData.mainMembers.length,
      purlinCount: steelData.purlins.length,
      plateAndFittingCount: steelData.platesAndFittings.length,
      connectionCount: steelData.connections.length,
    };
  }
}
