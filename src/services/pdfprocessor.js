// src/services/pdfprocessor.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

export class PdfProcessor {
  constructor() {
    // --- MODIFIED: Patterns are now strings to be safely compiled at runtime. ---
    // This prevents the "missing /" syntax error from ever crashing the application.
    this.steelPatternStrings = {
      universalBeam: { pattern: '(\\d+)\\s*UB\\s*(\\d+\\.?\\d*)', type: 'Universal Beam', category: 'main_member' },
      universalColumn: { pattern: '(\\d+)\\s*UC\\s*(\\d+\\.?\\d*)', type: 'Universal Column', category: 'main_member' },
      parallelFlangeChannel: { pattern: '(\\d+)\\s*PFC', type: 'Parallel Flange Channel', category: 'main_member' },
      shs: { pattern: '(\\d{2,3})\\s*[xX×]\\s*(\\d{2,3})\\s*[xX×]\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*SHS', type: 'Square Hollow Section', category: 'main_member' },
      rhs: { pattern: '(\\d{2,3})\\s*[xX×]\\s*(\\d{2,3})\\s*[xX×]\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*RHS', type: 'Rectangular Hollow Section', category: 'main_member' },
      angle: { pattern: 'L(\\d{1,3})[xX×](\\d{1,3})[xX×](\\d{1,2}(?:\\.\\d+)?)', type: 'Angle', category: 'main_member' },
      purlin: { pattern: '[CZ](\\d{3})\\s*(\\d{2}(?:\\.\\d+)?)', type: 'Purlin', category: 'purlin' },
      plateAndStiffeners: { pattern: '(\\d+)\\s*(?:MM)?\\s*(?:PL|PLATE|STIFFENER|FIN\\s*PL)', type: 'Plate/Stiffener', category: 'plate_fitting' },
      bolts: { pattern: '(\\d+)\\s*-\\s*M(12|16|20|24|30)\\s*(?:BOLTS?)', type: 'Bolt', category: 'connection' },
    };
    this.unitConversions = this.initializeUnitConversions();
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
    console.log('🔍 Extracting all structural steel information...');
    const steelData = {
      mainMembers: [],
      purlins: [],
      platesAndFittings: [],
      connections: [],
      summary: { totalItems: 0, categories: {} }
    };

    const uniqueEntries = new Set();

    // --- MODIFIED: Loop through the string patterns and safely create RegExp objects ---
    Object.entries(this.steelPatternStrings).forEach(([key, config]) => {
      let regex;
      try {
        // This `new RegExp()` constructor prevents the startup crash.
        regex = new RegExp(config.pattern, 'gi');
      } catch (e) {
        console.error(`Skipping invalid regex pattern for '${key}': ${e.message}`);
        return; // Skips the bad pattern instead of crashing.
      }

      const matches = [...text.matchAll(regex)];
      matches.forEach(match => {
        const designation = this._normalizeDesignation(match[0]);
        if (uniqueEntries.has(designation)) return;
        uniqueEntries.add(designation);

        const item = {
          type: config.type,
          designation: designation,
          rawMatch: match[0],
          quantity: this._extractQuantityFromContext(text, match.index) || 1,
        };

        switch(config.category) {
            case 'main_member':
                steelData.mainMembers.push(item);
                break;
            case 'purlin':
                steelData.purlins.push(item);
                break;
            case 'plate_fitting':
                item.thickness = parseInt(match[1], 10);
                steelData.platesAndFittings.push(item);
                break;
            case 'connection':
                item.quantity = parseInt(match[1], 10);
                item.size = `M${match[2]}`;
                steelData.connections.push(item);
                break;
        }
      });
    });

    steelData.summary.totalItems = steelData.mainMembers.length + steelData.purlins.length + steelData.platesAndFittings.length;
    steelData.summary.categories = {
      main_members: steelData.mainMembers.length,
      purlins: steelData.purlins.length,
      plates_and_fittings: steelData.platesAndFittings.length,
      bolt_sets: steelData.connections.reduce((acc, conn) => acc + conn.quantity, 0)
    };
    
    console.log(`✅ Extracted ${steelData.summary.totalItems} unique steel items.`);
    return steelData;
  }

  _normalizeDesignation(designation) {
    return designation.replace(/\s+/g, ' ').replace(/[×]/g, 'x').toUpperCase().trim();
  }

  _extractQuantityFromContext(text, matchIndex) {
    const context = text.substring(Math.max(0, matchIndex - 50), matchIndex);
    const qtyMatch = context.match(/(\d+)\s*(?:NO|QTY|PCS|EA|X)\.?\s*$/i);
    return qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  }
}

export default PdfProcessor;
