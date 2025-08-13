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
      // --- NEW: Added pattern for SHS (Square Hollow Section) ---
      shs: {
        pattern: /(\d{2,3})x(\d{2,3})x(\d{1,2}(?:\.\d+)?)\s*SHS/gi,
        type: 'Square Hollow Section',
        category: 'hollow_structural'
      },
      // --- NEW: Added pattern for Z-Purlins/Z-Sections ---
      zPurlin: {
        pattern: /Z(\d{3})-?(\d{2}(?:\.\d+)?)/gi,
        type: 'Z-Purlin',
        category: 'purlin'
      },
      // --- NEW: Added pattern for C-Purlins/C-Sections ---
      cPurlin: {
        pattern: /C(\d{3})-?(\d{2}(?:\.\d+)?)/gi,
        type: 'C-Purlin',
        category: 'purlin'
      },
      // Wide Flange Beams
      wideFlange: {
        pattern: /W(\d{1,2})X(\d{1,3}(?:\.\d+)?)/gi,
        type: 'Wide Flange Beam',
        category: 'structural_beam'
      },
      
      // Standard Beams
      standardBeam: {
        pattern: /S(\d{1,2})X(\d{1,3}(?:\.\d+)?)/gi,
        type: 'Standard Beam',
        category: 'structural_beam'
      },
      
      // HP Sections
      hpSection: {
        pattern: /HP(\d{1,2})X(\d{1,3}(?:\.\d+)?)/gi,
        type: 'HP Section',
        category: 'pile_foundation'
      },
      
      // Channels
      channel: {
        pattern: /C(\d{1,2})X(\d{1,3}(?:\.\d+)?)/gi,
        type: 'Channel',
        category: 'structural_channel'
      },
      
      // Angles
      angle: {
        pattern: /L(\d{1,2})X(\d{1,2})X(\d+\/\d+|\d+(?:\.\d+)?)/gi,
        type: 'Angle',
        category: 'structural_angle'
      },
      
      // HSS (Hollow Structural Sections)
      hssRectangular: {
        pattern: /HSS(\d{1,2})X(\d{1,2})X(\d+\/\d+|\d+(?:\.\d+)?)/gi,
        type: 'HSS Rectangular',
        category: 'hollow_structural'
      },
      
      hssRound: {
        pattern: /HSS(\d{1,2}(?:\.\d+)?)X(\d+\/\d+|\d+(?:\.\d+)?)/gi,
        type: 'HSS Round',
        category: 'hollow_structural'
      },
      
      // Plates
      plate: {
        pattern: /PL\s*(\d+\/\d+|\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)/gi,
        type: 'Steel Plate',
        category: 'plate'
      },
      
      plateSimple: {
        pattern: /PLATE\s*(\d+\/\d+|\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)/gi,
        type: 'Steel Plate',
        category: 'plate'
      },
      
      // Rebar
      rebar: {
        pattern: /#(\d+)\s*@\s*(\d+(?:\.\d+)?)\s*(O\.?C\.?|ON\s*CENTER)/gi,
        type: 'Reinforcing Bar',
        category: 'reinforcement'
      },
      
      // Mesh
      mesh: {
        pattern: /(\d+X\d+\s*-?\s*W\d+\.\d+X\d+\.\d+)/gi,
        type: 'Welded Wire Mesh',
        category: 'reinforcement'
      },
      
      // Quantities and Units
      quantities: {
        linearFeet: /(\d+(?:\.\d+)?)\s*(LF|L\.F\.|LINEAR\s*FEET?)/gi,
        squareFeet: /(\d+(?:\.\d+)?)\s*(SF|S\.F\.|SQUARE\s*FEET?)/gi,
        each: /(\d+(?:\.\d+)?)\s*(EA|EACH)/gi,
        tons: /(\d+(?:\.\d+)?)\s*(TON|TONS)/gi,
        pounds: /(\d+(?:\.\d+)?)\s*(LBS?|POUNDS?)/gi,
        cubicYards: /(\d+(?:\.\d+)?)\s*(CY|C\.Y\.|CUBIC\s*YARDS?)/gi
      },
      
      // Dimensions
      dimensions: {
        feetInches: /(\d+)'-(\d+)"/gi,
        feetOnly: /(\d+)'/gi,
        decimal: /(\d+\.\d+)'/gi,
        metric: /(\d+(?:\.\d+)?)\s*(MM|CM|M)/gi
      },
      
      // Connection Details
      connections: {
        bolts: /((\d+\/\d+|\d+)\s*[Ø∅]\s*(BOLT|A325|A490))/gi,
        welds: /(\d+\/\d+|\d+)\s*(FILLET\s*WELD|FW)/gi,
        studs: /(\d+\/\d+|\d+)\s*[Ø∅]\s*STUD/gi
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
          
          // Extract text with positioning information
          const pageItems = textContent.items.map(item => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            width: Math.round(item.width),
            height: Math.round(item.height),
            fontName: item.fontName
          }));

          // Sort by Y position (top to bottom) then X position (left to right)
          pageItems.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 5) { // Same line
              return a.x - b.x;
            }
            return b.y - a.y; // Top to bottom
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
      // Extract structural members
      Object.entries(this.steelPatterns).forEach(([key, config]) => {
        if (key === 'quantities' || key === 'dimensions' || key === 'connections') return;
        
        const matches = [...text.matchAll(config.pattern)];
        
        matches.forEach(match => {
          const member = {
            type: config.type,
            category: config.category,
            designation: match[0],
            rawMatch: match,
            context: this.getContextAroundMatch(text, match.index, 100)
          };

          // Parse specific member details
          switch (config.category) {
            case 'structural_beam':
            case 'structural_channel':
              member.depth = parseInt(match[1]);
              member.weight = parseFloat(match[2]);
              break;
            case 'purlin':
              member.depth = parseInt(match[1]);
              member.gauge = parseFloat(match[2]);
              break;
            case 'hollow_structural':
               if (config.type === 'Square Hollow Section') {
                    member.dimension1 = parseInt(match[1]);
                    member.dimension2 = parseInt(match[2]);
                    member.thickness = parseFloat(match[3]);
                } else {
                    member.dimension1 = parseInt(match[1]);
                    member.dimension2 = match[2] ? parseFloat(match[2]) : null;
                }
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

      // Extract quantities
      Object.entries(this.steelPatterns.quantities).forEach(([unit, pattern]) => {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
          steelData.quantities.push({
            value: parseFloat(match[1]),
            unit: unit,
            rawText: match[0],
            context: this.getContextAroundMatch(text, match.index, 50)
          });
        });
      });

      // Extract dimensions
      Object.entries(this.steelPatterns.dimensions).forEach(([type, pattern]) => {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
          let dimension = {
            type: type,
            rawText: match[0],
            context: this.getContextAroundMatch(text, match.index, 50)
          };

          switch (type) {
            case 'feetInches':
              dimension.feet = parseInt(match[1]);
              dimension.inches = parseInt(match[2]);
              dimension.totalInches = dimension.feet * 12 + dimension.inches;
              break;
            case 'feetOnly':
              dimension.feet = parseInt(match[1]);
              dimension.totalInches = dimension.feet * 12;
              break;
            case 'decimal':
              dimension.feet = parseFloat(match[1]);
              dimension.totalInches = dimension.feet * 12;
              break;
            case 'metric':
              dimension.value = parseFloat(match[1]);
              dimension.unit = match[2];
              break;
          }

          steelData.dimensions.push(dimension);
        });
      });

      // Extract connection details
      Object.entries(this.steelPatterns.connections).forEach(([type, pattern]) => {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
          steelData.connections.push({
            type: type,
            size: this.parseFractionOrDecimal(match[1]),
            rawText: match[0],
            context: this.getContextAroundMatch(text, match.index, 50)
          });
        });
      });

      // Generate summary
      steelData.summary.totalMembers = steelData.structuralMembers.length;
      
      // Group by category
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

      // Estimate total weight (basic estimation)
      steelData.summary.estimatedWeight = this.estimateTotalWeight(steelData);

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
    // Basic weight estimation based on typical steel densities
    let totalWeight = 0;
    
    steelData.structuralMembers.forEach(member => {
      switch (member.category) {
        case 'structural_beam':
        case 'structural_channel':
          totalWeight += member.weight || 0; // Weight per foot
          break;
        case 'plate':
          if (member.thickness && member.width && member.length) {
            // Steel density: ~490 lbs/ft³
            const volume = member.thickness * member.width * member.length / 1728; // cubic feet
            totalWeight += volume * 490;
          }
          break;
        // Add more categories as needed
      }
    });
    
    return Math.round(totalWeight * 100) / 100; // Round to 2 decimal places
  }

  async processForEstimation(pdfBuffer, options = {}) {
    console.log('🚀 Starting PDF processing for estimation...');
    
    try {
      // Extract text from PDF
      const extractedData = await this.extractTextFromPdf(pdfBuffer);
      
      if (!extractedData.success) {
        throw new Error(`PDF text extraction failed: ${extractedData.error}`);
      }

      console.log(`📄 Extracted ${extractedData.text.length} characters from ${extractedData.pages} pages`);

      // Extract structural steel information
      const steelData = this.extractSteelInformation(extractedData.text);
      
      // Advanced analysis
      const analysis = await this.performAdvancedAnalysis(extractedData.text, steelData, options);
      
      // Generate estimation data
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

    // Assess confidence level
    analysis.confidence = this.calculateConfidence(steelData, text);
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(steelData, analysis);
    
    // Check for potential issues
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

    // Common patterns for project information
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

    // Categorize members by structural function
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

    // Determine structural system type
    if (system.primaryMembers.length > 0) {
      system.type = 'steel_frame';
    }

    return system;
  }

  assessComplexity(steelData) {
    let complexity = 'simple';
    let score = 0;

    // Factors that increase complexity
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
    
    // Base confidence from extracted data
    if (steelData.structuralMembers.length > 0) confidence += 30;
    if (steelData.quantities.length > 0) confidence += 20;
    if (steelData.dimensions.length > 0) confidence += 15;
    if (steelData.connections.length > 0) confidence += 15;
    
    // Bonus for clear patterns
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

    // Basic material cost estimation
    steelData.structuralMembers.forEach(member => {
      const materialCost = this.estimateMaterialCost(member, options);
      if (materialCost > 0) {
        estimation.materials.push({
          description: member.designation,
          category: member.category,
          quantity: 1, // Default quantity
          unitCost: materialCost,
          totalCost: materialCost
        });
        estimation.totals.materials += materialCost;
      }
    });

    // Basic labor estimation (typically 40-60% of material cost)
    estimation.totals.labor = estimation.totals.materials * 0.5;

    // Basic equipment estimation (typically 10-15% of material cost)
    estimation.totals.equipment = estimation.totals.materials * 0.125;

    // Calculate total
    estimation.totals.total = estimation.totals.materials + estimation.totals.labor + estimation.totals.equipment;

    // Add assumptions
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
    // Basic cost per unit for different steel types (in USD)
    const baseCosts = {
      'Wide Flange Beam': 2.5,    // per lb
      'Standard Beam': 2.3,      // per lb
      'HP Section': 2.8,         // per lb
      'Channel': 2.4,            // per lb
      'Angle': 2.6,              // per lb
      'HSS Rectangular': 3.0,    // per lb
      'HSS Round': 3.2,          // per lb
      'Steel Plate': 2.2         // per lb
    };

    const baseCost = baseCosts[member.type] || 2.5;
    
    // Estimate weight based on member type
    let estimatedWeight = 10; // Default weight in lbs
    
    if (member.weight) {
      estimatedWeight = member.weight;
    } else if (member.category === 'plate' && member.thickness && member.width && member.length) {
      const volume = member.thickness * member.width * member.length / 1728; // cubic feet
      estimatedWeight = volume * 490; // steel density ~490 lbs/ft³
    }

    return baseCost * estimatedWeight;
  }

  // Utility method for saving processed results
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
