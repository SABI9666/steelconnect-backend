// src/services/pdfprocessor.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

export class PdfProcessor {
  constructor() {
    this.steelPatterns = this.initializeSteelPatterns();
    this.unitConversions = this.initializeUnitConversions();
  }

  initializeSteelPatterns() {
    return {
      // Australian Standard Steel Sections
      universalBeam: {
        pattern: /(\d+)\s*UB\s*(\d+\.?\d*)/gi,
        type: 'Universal Beam',
        category: 'structural_beam'
      },
      universalColumn: {
        pattern: /(\d+)\s*UC\s*(\d+\.?\d*)/gi,
        type: 'Universal Column',
        category: 'structural_column'
      },
      parallelFlangeChannel: {
        pattern: /(\d+)\s*PFC/gi,
        type: 'Parallel Flange Channel',
        category: 'structural_channel'
      },
      shs: {
        pattern: /(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*SHS/gi,
        type: 'Square Hollow Section',
        category: 'hollow_structural'
      },
      rhs: {
        pattern: /(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*RHS/gi,
        type: 'Rectangular Hollow Section',
        category: 'hollow_structural'
      },
      zPurlin: {
        pattern: /[CZ](\d{3})\s*(\d{2}(?:\.\d+)?)/gi,
        type: 'Purlin',
        category: 'purlin'
      },
      plate: {
        pattern: /PL\s*(\d+(?:\.\d+)?)\s*(?:[xX×]\s*(\d+(?:\.\d+)?))?/gi,
        type: 'Steel Plate',
        category: 'plate'
      },
       stiffenerPlate: {
        // --- THIS LINE IS THE SOURCE OF THE ERROR AND IS NOW CORRECTED ---
        pattern: /(\d+)\s*STIFFENER\s*PL/gi,
        type: 'Stiffener Plate',
        category: 'plate'
      },
      bolts: {
          pattern: /(\d+)\s*-\s*M(12|16|20|24|30)\s*(?:bolts?)/gi,
          type: 'Bolt',
          category: 'connections'
      },
      angle: {
        pattern: /L(\d{1,3})[xX×](\d{1,3})[xX×](\d{1,2}(?:\.\d+)?)/gi,
        type: 'Angle',
        category: 'structural_angle'
      },
    };
  }

  initializeUnitConversions() {
    return {
      feetToMeters: (feet) => feet * 0.3048,
      fractionToDecimal: (fraction) => {
        if (!fraction || !fraction.includes('/')) return parseFloat(fraction) || 0;
        const [numerator, denominator] = fraction.split('/').map(Number);
        return numerator / (denominator || 1);
      }
    };
  }

  async extractTextFromPdf(pdfData) {
    try {
      console.log('Starting PDF text extraction...');
      const pdf = await pdfjsLib.getDocument({ data: pdfData, useSystemFonts: true, verbosity: 0 }).promise;
      let fullText = '';
      const numPages = pdf.numPages;
      console.log(`Processing ${numPages} pages...`);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
        fullText += pageText + '\n';
      }

      console.log('✅ PDF text extraction completed');
      return { text: fullText.trim(), pages: numPages, success: true };
    } catch (error) {
      console.error('❌ PDF processing error:', error);
      return { text: '', pages: 0, success: false, error: error.message };
    }
  }

  extractSteelInformation(text) {
    console.log('🔍 Extracting steel information...');
    const steelData = {
      structuralMembers: [],
      plates: [],
      connections: [],
      purlins: [],
      summary: { totalMembers: 0, categories: {} }
    };

    const uniqueEntries = new Set();

    try {
      Object.entries(this.steelPatterns).forEach(([key, config]) => {
        const matches = [...text.matchAll(config.pattern)];
        matches.forEach(match => {
          const designation = this._normalizeDesignation(match[0]);
          if (uniqueEntries.has(designation)) return;
          uniqueEntries.add(designation);

          const item = {
            type: config.type,
            category: config.category,
            designation: designation,
            rawMatch: match[0],
            quantity: this._extractQuantityFromContext(text, match.index) || 1
          };

          // --- Categorize extracted data ---
          if (config.category.includes('structural') || config.category.includes('hollow')) {
            steelData.structuralMembers.push(item);
          } else if (config.category === 'plate') {
             item.thickness = this.parseFractionOrDecimal(match[1]);
             item.width = match[2] ? parseFloat(match[2]) : 0;
            steelData.plates.push(item);
          } else if (config.category === 'connections') {
            item.quantity = parseInt(match[1], 10);
            item.size = `M${match[2]}`;
            steelData.connections.push(item);
          } else if (config.category === 'purlin') {
             item.depth = parseInt(match[1], 10);
             item.gauge = parseFloat(match[2] || 0);
            steelData.purlins.push(item);
          }
        });
      });

      // --- Generate Summary ---
      steelData.summary.totalMembers = steelData.structuralMembers.length + steelData.purlins.length;
      steelData.summary.categories = {
          beams: steelData.structuralMembers.filter(m => m.category.includes('beam')).length,
          columns: steelData.structuralMembers.filter(m => m.category.includes('column')).length,
          purlins: steelData.purlins.length,
          plates: steelData.plates.length,
          connections: steelData.connections.reduce((acc, conn) => acc + conn.quantity, 0)
      };

      console.log(`✅ Extracted ${steelData.summary.totalMembers} members, ${steelData.plates.length} plates, and ${steelData.summary.connections} bolts.`);
      return steelData;
    } catch (error) {
      console.error('❌ Error extracting steel information:', error);
      return steelData;
    }
  }

  _normalizeDesignation(designation) {
    return designation.replace(/\s+/g, ' ').replace(/[×]/g, 'x').toUpperCase().trim();
  }

  _extractQuantityFromContext(text, matchIndex) {
    const context = text.substring(Math.max(0, matchIndex - 50), matchIndex);
    const qtyMatch = context.match(/(\d+)\s*(?:NO|QTY|PCS|EA)\.?\s*$/i);
    return qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  }
  
  parseFractionOrDecimal(value) {
      if(!value) return 0;
      if (typeof value !== 'string') return parseFloat(value) || 0;
      return this.unitConversions.fractionToDecimal(value);
  }
}

export default PdfProcessor;

