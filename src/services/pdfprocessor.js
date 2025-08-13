// src/services/pdfprocessor.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';
import sharp from 'sharp';

export class PdfProcessor {
  constructor() {
    this.steelPatterns = this.initializeSteelPatterns();
    this.unitConversions = this.initializeUnitConversions();
  }

  initializeSteelPatterns() {
    return {
      // --- NEW: More comprehensive patterns for common steel sections ---
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
        pattern: /(\d{2,3})\s*[xX]\s*(\d{2,3})\s*[xX]\s*(\d{1,2}(?:\.\d+)?)\s*SHS/gi,
        type: 'Square Hollow Section',
        category: 'hollow_structural'
      },
      rhs: {
        pattern: /(\d{2,3})\s*[xX]\s*(\d{2,3})\s*[xX]\s*(\d{1,2}(?:\.\d+)?)\s*RHS/gi,
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
      // Wide Flange Beams (US Standard)
      wideFlange: {
        pattern: /W(\d{1,2})X(\d{1,3}(?:\.\d+)?)/gi,
        type: 'Wide Flange Beam',
        category: 'structural_beam'
      },
      // Standard Beams (US Standard)
      standardBeam: {
        pattern: /S(\d{1,2})X(\d{1,3}(?:\.\d+)?)/gi,
        type: 'Standard Beam',
        category: 'structural_beam'
      },
      // Angles
      angle: {
        pattern: /L(\d{1,2})X(\d{1,2})X(\d+\/\d+|\d+(?:\.\d+)?)/gi,
        type: 'Angle',
        category: 'structural_angle'
      },
      // Plates
      plate: {
        pattern: /PL\s*(\d+\/\d+|\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)/gi,
        type: 'Steel Plate',
        category: 'plate'
      },
      // Rebar
      rebar: {
        pattern: /#(\d+)\s*@\s*(\d+(?:\.\d+)?)\s*(O\.?C\.?|ON\s*CENTER)/gi,
        type: 'Reinforcing Bar',
        category: 'reinforcement'
      },
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
        totalMembers: 0,
        totalWeight: 0,
        categories: {}
      }
    };

    try {
      Object.entries(this.steelPatterns).forEach(([key, config]) => {
        if (config.category === 'quantities' || config.category === 'dimensions' || config.category === 'connections') return;
        
        const matches = [...text.matchAll(config.pattern)];
        
        matches.forEach(match => {
          const member = {
            type: config.type,
            category: config.category,
            designation: match[0],
            rawMatch: match,
            context: this.getContextAroundMatch(text, match.index, 100)
          };

          switch (config.category) {
            case 'structural_beam':
            case 'structural_column':
            case 'structural_channel':
              member.depth = parseInt(match[1]);
              member.weight = parseFloat(match[2] || 0);
              break;
            case 'purlin':
              member.depth = parseInt(match[1]);
              member.gauge = parseFloat(match[2]);
              break;
            case 'hollow_structural':
              member.dimension1 = parseInt(match[1]);
              member.dimension2 = parseInt(match[2]);
              member.thickness = parseFloat(match[3]);
              break;
            case 'structural_angle':
              member.leg1 = parseInt(match[1]);
              member.leg2 = parseInt(match[2]);
              member.thickness = this.parseFractionOrDecimal(match[3]);
              break;
            case 'plate':
              member.thickness = this.parseFractionOrDecimal(match[1]);
              member.width = match[2] ? parseFloat(match[2]) : null;
              member.length = match[3] ? parseFloat(match[3]) : null;
              break;
          }

          steelData.structuralMembers.push(member);
        });
      });

      // Generate summary
      steelData.summary.totalMembers = steelData.structuralMembers.length;
      
      steelData.structuralMembers.forEach(member => {
        if (!steelData.summary.categories[member.category]) {
          steelData.summary.categories[member.category] = {
            count: 0,
            members: []
          };
        }
        steelData.summary.categories[member.category].count++;
        steelData.summary.categories[member.category].members.push(member.designation);
      });

      console.log(`✅ Extracted ${steelData.structuralMembers.length} structural members`);
      console.log(`📊 Categories: ${Object.keys(steelData.summary.categories).join(', ')}`);
      
      return steelData;
      
    } catch (error) {
      console.error('❌ Error extracting steel information:', error);
      return steelData;
    }
  }

  getContextAroundMatch(text, index, contextLength = 100) {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + contextLength);
    return text.substring(start, end).trim();
  }

  parseFractionOrDecimal(value) {
    if (typeof value !== 'string') return parseFloat(value) || 0;
    
    if (value.includes('/')) {
      return this.unitConversions.fractionToDecimal(value);
    }
    return parseFloat(value) || 0;
  }

  estimateTotalWeight(steelData) {
    let totalWeight = 0;
    
    steelData.structuralMembers.forEach(member => {
      switch (member.category) {
        case 'structural_beam':
        case 'structural_channel':
          totalWeight += member.weight || 0; 
          break;
        case 'plate':
          if (member.thickness && member.width && member.length) {
            const volume = member.thickness * member.width * member.length / 1728;
            totalWeight += volume * 490;
          }
          break;
      }
    });
    
    return Math.round(totalWeight * 100) / 100;
  }

  // Other methods remain the same...
  async processForEstimation(pdfBuffer, options = {}) {
    console.log('🚀 Starting PDF processing for estimation...');
    
    try {
      const extractedData = await this.extractTextFromPdf(pdfBuffer);
      
      if (!extractedData.success) {
        throw new Error(`PDF text extraction failed: ${extractedData.error}`);
      }

      console.log(`📄 Extracted ${extractedData.text.length} characters from ${extractedData.pages} pages`);

      const steelData = this.extractSteelInformation(extractedData.text);
      
      const analysis = await this.performAdvancedAnalysis(extractedData.text, steelData, options);
      
      const estimation = this.generateEstimation(steelData, analysis, options);
      
      const result = {
        ...extractedData,
        steelData,
        analysis,
        estimation,
        processedAt: new Date().toISOString(),
        processingOptions: options
      };

      console.log('✅ PDF processing completed successfully');
      
      return result;
      
    } catch (error) {
      console.error('❌ PDF processing failed:', error);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  async performAdvancedAnalysis(text, steelData, options) {
    console.log('🔬 Performing advanced analysis...');
    
    const analysis = {
      projectInfo: this.extractProjectInfo(text),
      structuralSystem: this.analyzeStructuralSystem(steelData),
      complexity: this.assessComplexity(steelData),
      recommendations: [],
      warnings: [],
      confidence: 0
    };

    analysis.confidence = this.calculateConfidence(steelData, text);
    
    analysis.recommendations = this.generateRecommendations(steelData, analysis);
    
    analysis.warnings = this.identifyWarnings(steelData, text);
    
    return analysis;
  }

  extractProjectInfo(text) {
    const info = {
      projectName: null,
      drawing: null,
      date: null,
      scale: null,
      architect: null,
      engineer: null
    };

    const patterns = {
      projectName: /PROJECT\s*:?\s*([^\n\r]{1,100})/i,
      drawing: /DRAWING\s*(?:NO\.?)?\s*:?\s*([A-Z0-9\-\.]{1,20})/i,
      date: /DATE\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      scale: /SCALE\s*:?\s*([\d\/\\"=\s]{1,20})/i
    };

    Object.entries(patterns).forEach(([key, pattern]) => {
      const match = text.match(pattern);
      if (match) {
        info[key] = match[1].trim();
      }
    });

    return info;
  }

  analyzeStructuralSystem(steelData) {
    const system = {
      type: 'unknown',
      primaryMembers: [],
      secondaryMembers: [],
      connections: [],
      foundation: []
    };

    steelData.structuralMembers.forEach(member => {
      if (member.category === 'structural_beam') {
        if (member.depth >= 12) {
          system.primaryMembers.push(member);
        } else {
          system.secondaryMembers.push(member);
        }
      } else if (member.category === 'pile_foundation') {
        system.foundation.push(member);
      }
    });

    if (system.primaryMembers.length > 0) {
      system.type = 'steel_frame';
    }

    return system;
  }

  assessComplexity(steelData) {
    let complexity = 'simple';
    let score = 0;

    const uniqueMembers = new Set(steelData.structuralMembers.map(m => m.designation)).size;
    const totalMembers = steelData.structuralMembers.length;
    const categories = Object.keys(steelData.summary.categories).length;

    score += uniqueMembers * 2;
    score += totalMembers;
    score += categories * 5;
    score += steelData.connections.length;

    if (score < 20) complexity = 'simple';
    else if (score < 50) complexity = 'moderate';
    else if (score < 100) complexity = 'complex';
    else complexity = 'very_complex';

    return {
      level: complexity,
      score,
      factors: {
        uniqueMembers,
        totalMembers,
        categories,
        connections: steelData.connections.length
      }
    };
  }

  calculateConfidence(steelData, text) {
    let confidence = 0;
    
    if (steelData.structuralMembers.length > 0) confidence += 30;
    if (steelData.quantities.length > 0) confidence += 20;
    if (steelData.dimensions.length > 0) confidence += 15;
    if (steelData.connections.length > 0) confidence += 15;
    
    const clearPatterns = text.match(/W\d+X\d+|PL\s*\d+|#\d+/g) || [];
    confidence += Math.min(clearPatterns.length * 2, 20);
    
    return Math.min(confidence, 100);
  }

  generateRecommendations(steelData, analysis) {
    const recommendations = [];

    if (analysis.complexity.level === 'simple') {
      recommendations.push('Consider standard connection details for cost efficiency');
    }

    if (steelData.structuralMembers.length > 20) {
      recommendations.push('Large project - consider modular fabrication approach');
    }

    if (analysis.confidence < 70) {
      recommendations.push('Low confidence - manual review recommended');
    }

    return recommendations;
  }

  identifyWarnings(steelData, text) {
    const warnings = [];

    if (steelData.structuralMembers.length === 0) {
      warnings.push('No structural members detected - check PDF quality');
    }

    if (steelData.quantities.length === 0) {
      warnings.push('No quantities found - estimation may be incomplete');
    }

    return warnings;
  }

  generateEstimation(steelData, analysis, options = {}) {
    console.log('💰 Generating cost estimation...');
    
    const estimation = {
      materials: [],
      labor: [],
      equipment: [],
      totals: {
        materials: 0,
        labor: 0,
        equipment: 0,
        total: 0
      },
      breakdown: {},
      assumptions: [],
      methodology: 'basic_estimation'
    };

    steelData.structuralMembers.forEach(member => {
      const materialCost = this.estimateMaterialCost(member, options);
      if (materialCost > 0) {
        estimation.materials.push({
          description: member.designation,
          category: member.category,
          quantity: 1,
          unitCost: materialCost,
          totalCost: materialCost
        });
        estimation.totals.materials += materialCost;
      }
    });

    estimation.totals.labor = estimation.totals.materials * 0.5;

    estimation.totals.equipment = estimation.totals.materials * 0.125;

    estimation.totals.total = estimation.totals.materials + estimation.totals.labor + estimation.totals.equipment;

    estimation.assumptions = [
      'Material costs based on current market averages',
      'Labor costs estimated at 50% of material costs',
      'Equipment costs estimated at 12.5% of material costs',
      'Does not include overhead, profit, or contingency',
      'Quantities assumed as 1 unit where not specified'
    ];

    console.log(`💲 Total estimated cost: $${estimation.totals.total.toFixed(2)}`);

    return estimation;
  }

  estimateMaterialCost(member, options = {}) {
    const baseCosts = {
      'Wide Flange Beam': 2.5,
      'Standard Beam': 2.3,
      'HP Section': 2.8,
      'Channel': 2.4,
      'Angle': 2.6,
      'HSS Rectangular': 3.0,
      'HSS Round': 3.2,
      'Steel Plate': 2.2
    };

    const baseCost = baseCosts[member.type] || 2.5;
    
    let estimatedWeight = 10;
    
    if (member.weight) {
      estimatedWeight = member.weight;
    } else if (member.category === 'plate' && member.thickness && member.width && member.length) {
      const volume = member.thickness * member.width * member.length / 1728;
      estimatedWeight = volume * 490;
    }

    return baseCost * estimatedWeight;
  }

  async saveProcessedResults(results, outputPath) {
    try {
      const data = JSON.stringify(results, null, 2);
      await fs.writeFile(outputPath, data);
      console.log(`✅ Results saved to ${outputPath}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to save results:', error);
      return false;
    }
  }
}

export default PdfProcessor;
