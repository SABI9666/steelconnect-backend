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
        pattern: /Z(\d{3})\s*(\d{2}(?:\.\d+)?)/gi,
        type: 'Z-Purlin',
        category: 'purlin'
      },
      cPurlin: {
        pattern: /C(\d{3})\s*(\d{2}(?:\.\d+)?)/gi,
        type: 'C-Purlin',
        category: 'purlin'
      },
      // Additional patterns for common variations
      angle: {
        pattern: /L(\d{1,3})[xX×](\d{1,3})[xX×](\d{1,2}(?:\.\d+)?)/gi,
        type: 'Angle',
        category: 'structural_angle'
      },
      plate: {
        pattern: /PL\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/gi,
        type: 'Steel Plate',
        category: 'plate'
      },
      // More flexible patterns for missed sections
      generalUB: {
        pattern: /(\d+)\s*UB/gi,
        type: 'Universal Beam',
        category: 'structural_beam'
      },
      generalSHS: {
        pattern: /(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*SHS/gi,
        type: 'Square Hollow Section',
        category: 'hollow_structural'
      },
      generalRHS: {
        pattern: /(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*RHS/gi,
        type: 'Rectangular Hollow Section',
        category: 'hollow_structural'
      }
    };
  }

  initializeUnitConversions() {
    return {
      feetToInches: (feet) => feet * 12,
      inchesToFeet: (inches) => inches / 12,
      poundsToTons: (pounds) => pounds / 2000,
      tonsToKilograms: (tons) => tons * 907.185,
      feetToMeters: (feet) => feet * 0.3048,
      squareFeetToSquareMeters: (sqft) => sqft * 0.092903,
      fractionToDecimal: (fraction) => {
        const [numerator, denominator] = fraction.split('/').map(Number);
        return numerator / denominator;
      }
    };
  }

  async extractTextFromPdf(pdfData) {
    try {
      console.log('Starting PDF text extraction...');
      
      const pdf = await pdfjsLib.getDocument({
        data: pdfData,
        useSystemFonts: true,
        verbosity: 0
      }).promise;

      let fullText = '';
      let pageTexts = [];
      const numPages = pdf.numPages;
      console.log(`Processing ${numPages} pages...`);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          const pageItems = textContent.items.map(item => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            width: Math.round(item.width),
            height: Math.round(item.height),
            fontName: item.fontName
          }));

          // Sort items by position (top-to-bottom, left-to-right)
          pageItems.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 5) {
              return a.x - b.x;
            }
            return b.y - a.y;
          });

          const pageText = pageItems
            .map(item => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          pageTexts.push({
            pageNumber: pageNum,
            text: pageText,
            items: pageItems
          });
          
          fullText += pageText + '\n';
          console.log(`✓ Page ${pageNum} processed (${pageText.length} characters)`);
          
        } catch (pageError) {
          console.error(`Error processing page ${pageNum}:`, pageError.message);
          pageTexts.push({
            pageNumber: pageNum,
            text: '',
            items: [],
            error: pageError.message
          });
        }
      }

      console.log('✅ PDF text extraction completed');
      
      return {
        text: fullText.trim(),
        pages: numPages,
        pageTexts,
        success: true,
        metadata: {
          totalCharacters: fullText.length,
          extractedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('❌ PDF processing error:', error);
      return {
        text: '',
        pages: 0,
        pageTexts: [],
        success: false,
        error: error.message,
        metadata: {
          extractedAt: new Date().toISOString(),
          failureReason: error.message
        }
      };
    }
  }

  extractSteelInformation(text) {
    console.log('🔍 Extracting steel information...');
    
    const steelData = {
      structuralMembers: [],
      plates: [],
      connections: [],
      reinforcement: [],
      quantities: [],
      dimensions: [],
      materials: [],
      summary: {
        totalMembers: 0
