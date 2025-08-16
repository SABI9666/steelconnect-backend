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
        totalMembers: 0,
        totalWeight: 0,
        categories: {}
      }
    };

    try {
      // Track unique sections to avoid duplicates
      const uniqueSections = new Set();

      Object.entries(this.steelPatterns).forEach(([key, config]) => {
        if (config.category === 'quantities' || config.category === 'dimensions' || config.category === 'connections') return;
        
        const matches = [...text.matchAll(config.pattern)];
        
        matches.forEach(match => {
          const designation = this._normalizeDesignation(match[0]);
          
          // Skip if we've already found this exact section
          if (uniqueSections.has(designation)) {
            return;
          }
          uniqueSections.add(designation);

          const member = {
            type: config.type,
            category: config.category,
            designation: designation,
            rawMatch: match[0],
            context: this.getContextAroundMatch(text, match.index, 100),
            quantity: this._extractQuantityFromContext(text, match.index),
            length: this._extractLengthFromContext(text, match.index)
          };

          // Parse dimensions based on category
          switch (config.category) {
            case 'structural_beam':
            case 'structural_column':
            case 'structural_channel':
              member.depth = parseInt(match[1]);
              member.weight = parseFloat(match[2] || 0);
              break;
            case 'purlin':
              member.depth = parseInt(match[1]);
              member.gauge = parseFloat(match[2] || 0);
              break;
            case 'hollow_structural':
              if (match.length >= 4) {
                member.dimension1 = parseInt(match[1]);
                member.dimension2 = parseInt(match[2]);
                member.thickness = parseFloat(match[3]);
              }
              break;
            case 'structural_angle':
              if (match.length >= 4) {
                member.leg1 = parseInt(match[1]);
                member.leg2 = parseInt(match[2]);
                member.thickness = this.parseFractionOrDecimal(match[3]);
              }
              break;
            case 'plate':
              if (match.length >= 3) {
                member.thickness = this.parseFractionOrDecimal(match[1]);
                member.width = match[2] ? parseFloat(match[2]) : null;
              }
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

  _normalizeDesignation(designation) {
    return designation
      .replace(/\s+/g, ' ')
      .replace(/[×]/g, 'x')
      .replace(/[Xx]/g, ' x ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  _extractQuantityFromContext(text, matchIndex) {
    const contextStart = Math.max(0, matchIndex - 100);
    const contextEnd = Math.min(text.length, matchIndex + 100);
    const context = text.substring(contextStart, contextEnd);
    
    // Look for quantity patterns near the match
    const qtyPatterns = [
      /(\d+)\s*(?:NO|QTY|PIECES?|PCS)/i,
      /QTY[:\s]*(\d+)/i,
      /(\d+)\s*(?:OFF|EA)/i
    ];
    
    for (const pattern of qtyPatterns) {
      const match = context.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    return 1; // Default quantity
  }

  _extractLengthFromContext(text, matchIndex) {
    const contextStart = Math.max(0, matchIndex - 150);
    const contextEnd = Math.min(text.length, matchIndex + 150);
    const context = text.substring(contextStart, contextEnd);
    
    // Look for length patterns
    const lengthPatterns = [
      /(\d+(?:\.\d+)?)\s*[Mm]/g,
      /L[=:\s]*(\d+(?:\.\d+)?)/i,
      /LENGTH[:\s]*(\d+(?:\.\d+)?)/i
    ];
    
    for (const pattern of lengthPatterns) {
      const match = context.match(pattern);
      if (match) {
        const length = parseFloat(match[1]);
        if (length > 0 && length < 100) { // Reasonable length range in meters
          return length;
        }
      }
    }
    
    return 6; // Default length in meters
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
      let memberWeight = 0;
      
      switch (member.category) {
        case 'structural_beam':
        case 'structural_channel':
          memberWeight = (member.weight || 0) * (member.length || 6) * (member.quantity || 1);
          break;
        case 'hollow_structural':
          // Estimate weight for hollow sections
          if (member.dimension1 && member.dimension2 && member.thickness) {
            const perimeter = 2 * (member.dimension1 + member.dimension2);
            const weightPerM = perimeter * member.thickness * 0.00785; // kg/m for steel
            memberWeight = weightPerM * (member.length || 6) * (member.quantity || 1);
          }
          break;
        case 'plate':
          if (member.thickness && member.width) {
            const areaPerM = member.width * member.thickness / 1000; // m²/m
            const weightPerM = areaPerM * 7850; // kg/m (density of steel)
            memberWeight = weightPerM * (member.length || 6) * (member.quantity || 1);
          }
          break;
        default:
          // Use a default weight estimation
          memberWeight = 25 * (member.length || 6) * (member.quantity || 1); // kg
          break;
      }
      
      totalWeight += memberWeight;
    });
    
    return Math.round(totalWeight * 100) / 100;
  }

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
        if (member.depth >= 250) {
          system.primaryMembers.push(member);
        } else {
          system.secondaryMembers.push(member);
        }
      } else if (member.category === 'structural_column') {
        system.primaryMembers.push(member);
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
    
    // Base confidence from extracted members
    if (steelData.structuralMembers.length > 0) confidence += 30;
    if (steelData.structuralMembers.length > 10) confidence += 20;
    if (steelData.structuralMembers.length > 50) confidence += 10;
    
    // Bonus for finding quantities and dimensions
    const membersWithQuantities = steelData.structuralMembers.filter(m => m.quantity > 1).length;
    const membersWithLengths = steelData.structuralMembers.filter(m => m.length && m.length !== 6).length;
    
    confidence += Math.min(membersWithQuantities * 2, 20);
    confidence += Math.min(membersWithLengths * 2, 20);
    
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

    const uniqueSections = new Set(steelData.structuralMembers.map(m => m.designation)).size;
    if (uniqueSections > 10) {
      recommendations.push('High variety of sections - consider standardization to reduce costs');
    }

    return recommendations;
  }

  identifyWarnings(steelData, text) {
    const warnings = [];

    if (steelData.structuralMembers.length === 0) {
      warnings.push('No structural members detected - check PDF quality');
    }

    if (steelData.structuralMembers.length < 5) {
      warnings.push('Very few members detected - may indicate incomplete extraction');
    }

    const membersWithoutWeight = steelData.structuralMembers.filter(m => !m.weight || m.weight === 0).length;
    if (membersWithoutWeight > steelData.structuralMembers.length * 0.5) {
      warnings.push('Many members missing weight information - costs may be estimated');
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
      methodology: 'enhanced_estimation'
    };

    // Calculate material costs for each member
    steelData.structuralMembers.forEach(member => {
      const materialCost = this.estimateMaterialCost(member, options);
      if (materialCost > 0) {
        estimation.materials.push({
          description: member.designation,
          category: member.category,
          quantity: member.quantity || 1,
          length: member.length || 6,
          unitCost: materialCost / (member.quantity || 1),
          totalCost: materialCost
        });
        estimation.totals.materials += materialCost;
      }
    });

    // Labor costs (60% of material costs for fabrication and erection)
    estimation.totals.labor = estimation.totals.materials * 0.6;

    // Equipment costs (15% of material costs)
    estimation.totals.equipment = estimation.totals.materials * 0.15;

    // Total cost
    estimation.totals.total = estimation.totals.materials + estimation.totals.labor + estimation.totals.equipment;

    // Generate assumptions
    estimation.assumptions = [
      'Material costs based on current Australian market rates',
      'Labor costs estimated at 60% of material costs',
      'Equipment costs estimated at 15% of material costs',
      'Standard fabrication complexity assumed',
      'Hot-dip galvanizing included for all structural steel',
      'Standard site access and crane requirements',
      'Does not include GST, overhead, or profit margins',
      `Quantities based on ${steelData.structuralMembers.length} identified members`
    ];

    if (analysis.confidence < 80) {
      estimation.assumptions.push('Low extraction confidence - manual verification recommended');
    }

    console.log(`💲 Total estimated cost: ${estimation.totals.total.toFixed(2)}`);

    return estimation;
  }

  estimateMaterialCost(member, options = {}) {
    const baseCostPerKg = options.steelCostPerKg || 3.2; // AUD per kg
    const quantity = member.quantity || 1;
    const length = member.length || 6;
    
    let weightPerMeter = 0;
    
    // Estimate weight per meter based on section type
    if (member.weight && member.weight > 0) {
      weightPerMeter = member.weight;
    } else {
      switch (member.category) {
        case 'structural_beam':
        case 'structural_channel':
          weightPerMeter = this._estimateBeamWeight(member);
          break;
        case 'hollow_structural':
          weightPerMeter = this._estimateHollowSectionWeight(member);
          break;
        case 'structural_angle':
          weightPerMeter = this._estimateAngleWeight(member);
          break;
        case 'plate':
          weightPerMeter = this._estimatePlateWeight(member);
          break;
        case 'purlin':
          weightPerMeter = member.gauge || 15; // Default purlin weight
          break;
        default:
          weightPerMeter = 25; // Default fallback
      }
    }
    
    const totalWeight = weightPerMeter * length * quantity;
    const materialCost = totalWeight * baseCostPerKg;
    
    // Add fabrication multiplier based on complexity
    const fabricationMultiplier = this._getFabricationMultiplier(member);
    
    return materialCost * fabricationMultiplier;
  }

  _estimateBeamWeight(member) {
    if (member.depth) {
      // Rough estimation based on depth
      if (member.depth <= 200) return 18;
      if (member.depth <= 250) return 25;
      if (member.depth <= 310) return 32;
      if (member.depth <= 360) return 45;
      if (member.depth <= 410) return 55;
      if (member.depth <= 460) return 67;
      return 80; // Large beams
    }
    return 25; // Default
  }

  _estimateHollowSectionWeight(member) {
    if (member.dimension1 && member.dimension2 && member.thickness) {
      // Calculate approximate weight for hollow section
      const perimeter = 2 * (member.dimension1 + member.dimension2);
      return perimeter * member.thickness * 0.00785; // kg/m
    }
    return 20; // Default
  }

  _estimateAngleWeight(member) {
    if (member.leg1 && member.leg2 && member.thickness) {
      const area = (member.leg1 + member.leg2) * member.thickness;
      return area * 0.00785; // kg/m
    }
    return 15; // Default
  }

  _estimatePlateWeight(member) {
    if (member.thickness && member.width) {
      return member.thickness * member.width * 0.00785; // kg/m
    }
    return 30; // Default
  }

  _getFabricationMultiplier(member) {
    // Different sections have different fabrication complexity
    switch (member.category) {
      case 'structural_beam':
      case 'structural_column':
        return 1.8; // Includes cutting, welding, connections
      case 'hollow_structural':
        return 2.0; // More complex fabrication
      case 'structural_channel':
        return 1.7;
      case 'purlin':
        return 1.5; // Simpler fabrication
      case 'plate':
        return 1.9; // Cutting and forming
      default:
        return 1.8;
    }
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
