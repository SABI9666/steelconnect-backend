// Enhanced PDF Processor with improved steel section detection and quantity extraction
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export class EnhancedPdfProcessor {
  constructor() {
    this.steelPatterns = this.initializeComprehensiveSteelPatterns();
    this.quantityPatterns = this.initializeQuantityPatterns();
    this.dimensionPatterns = this.initializeDimensionPatterns();
    this.steelDatabase = this.initializeSteelDatabase();
  }

  initializeComprehensiveSteelPatterns() {
    return {
      // More comprehensive Australian steel section patterns
      universalBeam: {
        pattern: /(\d{2,3})\s*UB\s*(\d+\.?\d*)/gi,
        type: 'Universal Beam',
        category: 'beam'
      },
      universalColumn: {
        pattern: /(\d{2,3})\s*UC\s*(\d+\.?\d*)/gi,
        type: 'Universal Column', 
        category: 'column'
      },
      parallelFlangeChannel: {
        pattern: /(\d{2,3})\s*PFC\s*(\d+\.?\d*)?/gi,
        type: 'Parallel Flange Channel',
        category: 'channel'
      },
      // Enhanced SHS patterns with better capture groups
      shs: {
        pattern: /(\d{2,3})\s*[×xX]\s*(\d{2,3})\s*[×xX]\s*(\d{1,2}(?:\.\d+)?)\s*SHS/gi,
        type: 'Square Hollow Section',
        category: 'hollow'
      },
      // Simplified SHS pattern
      shsSimple: {
        pattern: /(\d{2,3})\s*SHS/gi,
        type: 'Square Hollow Section',
        category: 'hollow'
      },
      rhs: {
        pattern: /(\d{2,3})\s*[×xX]\s*(\d{2,3})\s*[×xX]\s*(\d{1,2}(?:\.\d+)?)\s*RHS/gi,
        type: 'Rectangular Hollow Section',
        category: 'hollow'
      },
      // Enhanced purlin patterns
      zPurlin: {
        pattern: /Z\s*(\d{2,3})\s*(\d{2}(?:\.\d+)?)?/gi,
        type: 'Z-Purlin',
        category: 'purlin'
      },
      cPurlin: {
        pattern: /C\s*(\d{2,3})\s*(\d{2}(?:\.\d+)?)?/gi,
        type: 'C-Purlin',
        category: 'purlin'
      },
      // Steel schedule table patterns
      scheduleEntry: {
        pattern: /([A-Z]\d+)\s+(\d{2,3}\s*(?:UB|UC|PFC|SHS|RHS|CHS)[\s\d\.×xX]*)\s+(\d+)\s+(\d+(?:\.\d+)?)/gi,
        type: 'Schedule Entry',
        category: 'schedule'
      },
      // Mark references in drawings
      markReference: {
        pattern: /([A-Z]\d+)(?:\s*[-–]\s*)?(\d{2,3}\s*(?:UB|UC|PFC)[\s\d\.]*)/gi,
        type: 'Mark Reference',
        category: 'reference'
      }
    };
  }

  initializeQuantityPatterns() {
    return [
      // Quantity patterns commonly found in schedules
      /QTY[:\s]*(\d+)/gi,
      /QUANTITY[:\s]*(\d+)/gi,
      /(\d+)\s*(?:NO|QTY|PCS|PIECES?|OFF|EA)/gi,
      /(\d+)\s+(?:BEAMS?|COLUMNS?|MEMBERS?)/gi,
      // Table-based quantity patterns
      /^\s*(\d+)\s+[A-Z]\d+\s+/gm, // Leading number in schedule lines
      /[A-Z]\d+\s+[\w\s×]+\s+(\d+)\s+/gi // Quantity after member description
    ];
  }

  initializeDimensionPatterns() {
    return [
      // Length patterns in various formats
      /L[=:\s]*(\d+(?:\.\d+)?)\s*[Mm]/gi,
      /LENGTH[:\s]*(\d+(?:\.\d+)?)\s*[Mm]?/gi,
      /(\d+(?:\.\d+)?)\s*[Mm](?:\s*LONG)?/gi,
      /(\d+(?:\.\d+)?)M(?:\s*LENGTH)?/gi,
      // Imperial to metric conversions
      /(\d+(?:\.\d+)?)\s*[Ff][Tt]/gi, // feet
      /(\d+'-\d+"?)/gi // feet-inches format
    ];
  }

  initializeSteelDatabase() {
    // Comprehensive Australian steel database with accurate weights
    return {
      'UB': {
        150: { 14: 14.0, 18: 18.0 },
        180: { 16.1: 16.1, 18.1: 18.1, 22.2: 22.2 },
        200: { 18.2: 18.2, 22.3: 22.3, 25.4: 25.4, 29.8: 29.8 },
        250: { 25.7: 25.7, 31.4: 31.4, 37.3: 37.3 },
        310: { 32.0: 32.0, 40.4: 40.4, 46.2: 46.2 },
        360: { 44.7: 44.7, 50.7: 50.7, 56.7: 56.7 },
        410: { 53.7: 53.7, 59.7: 59.7, 67.1: 67.1 },
        460: { 67.1: 67.1, 74.6: 74.6, 82.1: 82.1 }
      },
      'UC': {
        100: { 14.8: 14.8 },
        150: { 23.4: 23.4, 30.0: 30.0, 37.2: 37.2 },
        200: { 46.2: 46.2, 52.0: 52.0, 59.5: 59.5 },
        250: { 72.4: 72.4, 89.5: 89.5 },
        310: { 96.8: 96.8, 118.0: 118.0, 137.0: 137.0, 158.0: 158.0 }
      },
      'PFC': {
        75: 7.5, 100: 10.4, 125: 13.4, 150: 17.0,
        180: 20.9, 200: 23.4, 230: 27.6, 250: 31.1,
        300: 37.9, 380: 48.2, 430: 54.9
      }
    };
  }

  async extractTextFromPdf(pdfData) {
    try {
      const pdf = await pdfjsLib.getDocument({
        data: pdfData,
        useSystemFonts: true,
        verbosity: 0
      }).promise;

      let fullText = '';
      let pageTexts = [];
      let structuredData = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Get text items with positioning
        const pageItems = textContent.items.map(item => ({
          text: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          width: Math.round(item.width),
          height: Math.round(item.height),
          fontName: item.fontName || ''
        })).filter(item => item.text.length > 0);

        // Sort by position for better text flow
        pageItems.sort((a, b) => {
          if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
          return b.y - a.y;
        });

        // Extract table-like structures
        const tableData = this.extractTableStructures(pageItems);
        structuredData.push(...tableData);

        const pageText = pageItems.map(item => item.text).join(' ');
        pageTexts.push({
          pageNumber: pageNum,
          text: pageText,
          items: pageItems,
          tables: tableData
        });
        
        fullText += pageText + '\n';
      }

      return {
        text: fullText,
        pages: pdf.numPages,
        pageTexts,
        structuredData,
        success: true
      };
    } catch (error) {
      console.error('PDF processing error:', error);
      return { text: '', pages: 0, success: false, error: error.message };
    }
  }

  extractTableStructures(pageItems) {
    // Group items by approximate Y position (rows)
    const rows = {};
    const tolerance = 5;

    pageItems.forEach(item => {
      const rowKey = Math.round(item.y / tolerance) * tolerance;
      if (!rows[rowKey]) rows[rowKey] = [];
      rows[rowKey].push(item);
    });

    const tables = [];
    const sortedRows = Object.keys(rows).map(Number).sort((a, b) => b - a);

    for (const rowY of sortedRows) {
      const rowItems = rows[rowY].sort((a, b) => a.x - b.x);
      const rowText = rowItems.map(item => item.text).join(' ');
      
      // Check if this looks like a steel schedule row
      if (this.isScheduleRow(rowText)) {
        const parsedRow = this.parseScheduleRow(rowText, rowItems);
        if (parsedRow) tables.push(parsedRow);
      }
    }

    return tables;
  }

  isScheduleRow(text) {
    // Identify steel schedule rows by common patterns
    const schedulePatterns = [
      /[A-Z]\d+\s+\d{2,3}\s*(?:UB|UC|PFC|SHS|RHS)/i,
      /^\s*\d+\s+[A-Z]\d+\s+\d{2,3}/i,
      /MARK|MEMBER|SIZE|QTY|LENGTH/i
    ];
    
    return schedulePatterns.some(pattern => pattern.test(text));
  }

  parseScheduleRow(text, items) {
    // Parse structured schedule data
    const patterns = {
      mark: /([A-Z]\d+)/i,
      section: /(\d{2,3}\s*(?:UB|UC|PFC|SHS|RHS)[\s\d\.×xX]*)/i,
      quantity: /(\d+)(?:\s*(?:NO|QTY|PCS|OFF))?/i,
      length: /(\d+(?:\.\d+)?)\s*[Mm]?/i
    };

    const result = { type: 'schedule_row', source: text };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) result[key] = match[1];
    }

    // Validate that we have essential data
    if (result.mark && result.section) {
      return result;
    }
    
    return null;
  }

  extractSteelInformation(text, structuredData = []) {
    console.log('🔍 Enhanced steel information extraction...');
    
    const steelData = {
      structuralMembers: [],
      scheduleData: structuredData,
      summary: { totalMembers: 0, categories: {} }
    };

    // First, process structured table data
    structuredData.forEach(row => {
      if (row.type === 'schedule_row' && row.mark && row.section) {
        const member = this.createMemberFromSchedule(row);
        if (member) steelData.structuralMembers.push(member);
      }
    });

    // Then process text-based extraction
    Object.entries(this.steelPatterns).forEach(([key, config]) => {
      const matches = [...text.matchAll(config.pattern)];
      
      matches.forEach(match => {
        const member = this.createMemberFromPattern(match, config, text);
        if (member && !this.isDuplicate(steelData.structuralMembers, member)) {
          steelData.structuralMembers.push(member);
        }
      });
    });

    // Enhance with quantity and dimension extraction
    steelData.structuralMembers = steelData.structuralMembers.map(member => 
      this.enhanceMemberWithContext(member, text)
    );

    this.generateSummary(steelData);
    
    console.log(`✅ Extracted ${steelData.structuralMembers.length} steel members`);
    return steelData;
  }

  createMemberFromSchedule(row) {
    const section = this.normalizeSection(row.section);
    const details = this.lookupSteelDetails(section);
    
    return {
      mark: row.mark,
      designation: section,
      category: this.classifySection(section),
      quantity: parseInt(row.quantity) || 1,
      length: parseFloat(row.length) || 6.0,
      weight: details?.weight || this.estimateWeight(section),
      source: 'schedule',
      confidence: 0.95
    };
  }

  createMemberFromPattern(match, config, fullText) {
    let section = '';
    let weight = 0;

    // Handle different pattern types
    switch (config.category) {
      case 'beam':
      case 'column':
      case 'channel':
        section = `${match[1]} ${config.type.split(' ')[1]} ${match[2] || ''}`.trim();
        weight = parseFloat(match[2]) || 0;
        break;
      case 'hollow':
        if (match[3]) {
          section = `${match[1]}x${match[2]}x${match[3]} ${config.type.split(' ')[2]}`;
        } else {
          section = `${match[1]} ${config.type.split(' ')[2]}`;
        }
        break;
      case 'purlin':
        section = `${config.type.charAt(0)}${match[1]} ${match[2] || ''}`.trim();
        break;
      default:
        section = match[0];
    }

    const details = this.lookupSteelDetails(section);
    
    return {
      designation: this.normalizeSection(section),
      category: config.category,
      type: config.type,
      weight: weight || details?.weight || this.estimateWeight(section),
      quantity: 1, // Will be enhanced later
      length: 6.0, // Default, will be enhanced later
      source: 'pattern',
      confidence: 0.8,
      context: this.getContextAroundMatch(fullText, match.index, 150)
    };
  }

  enhanceMemberWithContext(member, fullText) {
    const enhanced = { ...member };
    
    // Extract quantity from context
    const quantity = this.extractQuantityFromContext(member.context || '', fullText);
    if (quantity > 0) enhanced.quantity = quantity;
    
    // Extract length from context
    const length = this.extractLengthFromContext(member.context || '', fullText);
    if (length > 0) enhanced.length = length;
    
    // Calculate total weight
    enhanced.totalWeight = enhanced.weight * enhanced.length * enhanced.quantity;
    
    return enhanced;
  }

  extractQuantityFromContext(context, fullText) {
    for (const pattern of this.quantityPatterns) {
      const match = context.match(pattern);
      if (match) {
        const qty = parseInt(match[1]);
        if (qty > 0 && qty <= 1000) return qty; // Reasonable range
      }
    }
    return 1;
  }

  extractLengthFromContext(context, fullText) {
    for (const pattern of this.dimensionPatterns) {
      const match = context.match(pattern);
      if (match) {
        let length = parseFloat(match[1]);
        
        // Convert feet to meters if needed
        if (match[0].toLowerCase().includes('ft') || match[0].includes("'")) {
          length = length * 0.3048;
        }
        
        if (length > 0 && length <= 50) return length; // Reasonable range
      }
    }
    return 6.0; // Default length
  }

  lookupSteelDetails(section) {
    const normalized = this.normalizeSection(section);
    
    // Parse section components
    const ubMatch = normalized.match(/(\d+)\s*UB\s*(\d+\.?\d*)/i);
    if (ubMatch) {
      const depth = parseInt(ubMatch[1]);
      const weight = parseFloat(ubMatch[2]);
      return this.steelDatabase.UB?.[depth]?.[weight] ? 
        { weight, category: 'beam' } : null;
    }
    
    const ucMatch = normalized.match(/(\d+)\s*UC\s*(\d+\.?\d*)/i);
    if (ucMatch) {
      const depth = parseInt(ucMatch[1]);
      const weight = parseFloat(ucMatch[2]);
      return this.steelDatabase.UC?.[depth]?.[weight] ? 
        { weight, category: 'column' } : null;
    }
    
    const pfcMatch = normalized.match(/(\d+)\s*PFC/i);
    if (pfcMatch) {
      const depth = parseInt(pfcMatch[1]);
      const weight = this.steelDatabase.PFC?.[depth];
      return weight ? { weight, category: 'channel' } : null;
    }
    
    return null;
  }

  normalizeSection(section) {
    return section
      .replace(/\s+/g, ' ')
      .replace(/[×]/g, 'x')
      .trim()
      .toUpperCase();
  }

  classifySection(section) {
    const s = section.toLowerCase();
    if (s.includes('ub')) return 'beam';
    if (s.includes('uc')) return 'column';
    if (s.includes('pfc')) return 'channel';
    if (s.includes('shs') || s.includes('rhs')) return 'hollow';
    if (s.includes('z') || s.includes('c')) return 'purlin';
    return 'other';
  }

  estimateWeight(section) {
    // Enhanced weight estimation with better algorithms
    const s = section.toLowerCase();
    
    // Extract numeric values
    const numbers = section.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (numbers.length === 0) return 20;
    
    const depth = numbers[0];
    
    if (s.includes('ub')) {
      // UB weight estimation based on depth
      if (depth <= 200) return depth * 0.13;
      if (depth <= 300) return depth * 0.15;
      return depth * 0.18;
    }
    
    if (s.includes('uc')) {
      // UC weight estimation
      return depth * 0.25;
    }
    
    if (s.includes('pfc')) {
      // PFC weight estimation
      return depth * 0.12;
    }
    
    if (s.includes('shs') && numbers.length >= 3) {
      // SHS weight calculation: perimeter * thickness * density
      const [dim1, dim2, thickness] = numbers;
      const perimeter = 2 * (dim1 + (dim2 || dim1));
      return perimeter * thickness * 0.00785; // kg/m
    }
    
    return Math.max(10, depth * 0.1); // Fallback
  }

  isDuplicate(members, newMember) {
    return members.some(existing => 
      existing.designation === newMember.designation &&
      existing.mark === newMember.mark
    );
  }

  getContextAroundMatch(text, index, length = 100) {
    const start = Math.max(0, index - length);
    const end = Math.min(text.length, index + length);
    return text.substring(start, end).trim();
  }

  generateSummary(steelData) {
    steelData.summary.totalMembers = steelData.structuralMembers.length;
    
    steelData.structuralMembers.forEach(member => {
      const category = member.category;
      if (!steelData.summary.categories[category]) {
        steelData.summary.categories[category] = { count: 0, totalWeight: 0 };
      }
      steelData.summary.categories[category].count += member.quantity || 1;
      steelData.summary.categories[category].totalWeight += member.totalWeight || 0;
    });
  }
}
