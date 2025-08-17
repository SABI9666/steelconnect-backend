// src/services/pdfprocessor.js - CORRECTED VERSION
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// RENAMED CLASS to match the import in estimation.js
export class PdfProcessor {
    constructor() {
        // ... (constructor content remains the same)
        this.patterns = {
            universalBeams: /(\d{2,4})\s*UB\s*(\d{1,3}(?:\.\d+)?)|(\d{2,4})\s*WB\s*(\d{1,3}(?:\.\d+)?)/gi,
            universalColumns: /(\d{2,4})\s*UC\s*(\d{1,3}(?:\.\d+)?)|(\d{2,4})\s*WC\s*(\d{1,3}(?:\.\d+)?)/gi,
            pfcChannels: /(\d{2,4})\s*PFC\s*(\d{1,3}(?:\.\d+)?)|PFC\s*(\d{2,4})\s*(\d{1,3}(?:\.\d+)?)/gi,
            shs: /SHS\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)|(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*SHS/gi,
            rhs: /RHS\s*(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)|(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*RHS/gi,
            chs: /CHS\s*(\d{2,4})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)|(\d{2,4})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*CHS/gi,
            equalAngles: /L\s*(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)|(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*(?:EA|ANGLE)/gi,
            unequalAngles: /UA\s*(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)|(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)\s*UA/gi,
            tSections: /T\s*(\d{2,3})\s*[xX×]\s*(\d{1,3}(?:\.\d+)?)|(\d{2,3})\s*T\s*(\d{1,3}(?:\.\d+)?)/gi,
            cPurlins: /C\s*(\d{2,3})\s*[\/-]\s*(\d{1,2}(?:\.\d+)?)|C(\d{2,3})(\d{1,2}(?:\.\d+)?)|C\s*(\d{2,3})\s*(\d{1,2}(?:\.\d+)?)/gi,
            zPurlins: /Z\s*(\d{2,3})\s*[\/-]\s*(\d{1,2}(?:\.\d+)?)|Z(\d{2,3})(\d{1,2}(?:\.\d+)?)|Z\s*(\d{2,3})\s*(\d{1,2}(?:\.\d+)?)/gi,
            topHats: /TH\s*(\d{2,3})\s*[\/-]\s*(\d{1,2}(?:\.\d+)?)|TOP\s*HAT\s*(\d{2,3})/gi,
            plates: /(?:PL|PLATE)\s*(\d{1,3})\s*(?:[xX×]\s*(\d{2,4})\s*[xX×]\s*(\d{2,5}))?|(\d{1,3})\s*(?:MM\s*)?(?:THK\s*)?PLATE/gi,
            flatBars: /FB\s*(\d{1,3})\s*[xX×]\s*(\d{1,3})|FLAT\s*(\d{1,3})\s*[xX×]\s*(\d{1,3})|(\d{1,3})\s*[xX×]\s*(\d{1,3})\s*(?:FB|FLAT)/gi,
            roundBars: /R\s*(\d{1,3})|RB\s*(\d{1,3})|(\d{1,3})\s*(?:DIA|Ø)\s*(?:ROD|BAR|ROUND)/gi,
            squareBars: /SB\s*(\d{1,3})|(\d{1,3})\s*[xX×]\s*(\d{1,3})\s*(?:SQ|SQUARE)\s*(?:BAR|ROD)/gi,
            stiffeners: /STIFFENER\s*(?:PL\s*)?(\d{1,3})|STIFF\s*(\d{1,3})|(\d{1,3})\s*(?:MM\s*)?STIFFENER/gi,
            brackets: /BRACKET|CLEAT|LUG|GUSSET|END\s*PLATE/gi,
            weldedBeams: /WB\s*(\d{2,4})\s*[xX×]\s*(\d{2,4})\s*[xX×]\s*(\d{1,2}(?:\.\d+)?)|WELDED\s*BEAM/gi,
            bolts: /M(\d{1,2})\s*(?:[xX×]\s*(\d{1,4}))?\s*(?:BOLT|B)?|(\d{1,2})\s*(?:MM\s*)?(?:DIA\s*)?BOLT/gi,
            hexBolts: /M(\d{1,2})\s*HEX|HEX\s*M(\d{1,2})|(\d{1,2})\s*MM\s*HEX/gi,
            coachScrews: /M(\d{1,2})\s*(?:COACH|CS)|COACH\s*SCREW\s*M(\d{1,2})/gi,
            structuralScrews: /M(\d{1,2})\s*STRUCT|STRUCT\s*SCREW\s*M(\d{1,2})/gi,
            anchorBolts: /M(\d{1,2})\s*(?:ANCHOR|AB)|ANCHOR\s*BOLT\s*M(\d{1,2})/gi,
            washers: /M(\d{1,2})\s*WASHER|WASHER\s*M(\d{1,2})|(\d{1,2})\s*MM\s*WASHER/gi,
            nuts: /M(\d{1,2})\s*NUT|NUT\s*M(\d{1,2})|(\d{1,2})\s*MM\s*NUT/gi,
            welding: /(\d{1,2}(?:\.\d+)?)\s*(?:MM\s*)?(?:FILLET|BUTT)\s*WELD|E(\d{2})\s*ELECTRODE|(\d{1,2})\s*MM\s*WELD/gi,
            basePlates: /BASE\s*PLATE|BP\s*(\d{1,3})|(\d{2,4})\s*[xX×]\s*(\d{2,4})\s*(?:[xX×]\s*(\d{1,3}))?\s*BP/gi,
            capPlates: /CAP\s*PLATE|CP\s*(\d{1,3})/gi,
            splicePlates: /SPLICE\s*PLATE|SP\s*(\d{1,3})/gi,
            webPlates: /WEB\s*PLATE|WP\s*(\d{1,3})/gi,
            flangePlates: /FLANGE\s*PLATE|FP\s*(\d{1,3})/gi,
            haunchPlates: /HAUNCH\s*PLATE|HP\s*(\d{1,3})/gi,
            quantities: /(?:(\d+)\s*(?:NO|NOS|OFF|QTY|QUANTITY))|(?:QTY\s*:?\s*(\d+))|(?:(\d+)\s*[xX×])|(?:^(\d+)\s+[A-Z])|(?:\b(\d+)\s+(?:PIECES|PCS|ITEMS))/gi,
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

    // RENAMED METHOD to match the call in estimation.js
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
        let totalItemsFound = 0;

        console.log('📊 Processing all pages for steel components...');

        for (const page of pageTexts) {
            console.log(`\n📄 === PAGE ${page.pageNumber} ANALYSIS ===`);
            
            const scheduleTypes = [
                { title: 'BEAM SCHEDULE', target: 'mainMembers', category: 'mainMembers' },
                { title: 'COLUMN SCHEDULE', target: 'mainMembers', category: 'mainMembers' },
                { title: 'PURLIN SCHEDULE', target: 'purlins', category: 'purlins' },
                { title: 'GIRT SCHEDULE', target: 'purlins', category: 'purlins' },
                { title: 'CONNECTION SCHEDULE', target: 'connections', category: 'connections' },
                { title: 'BOLT SCHEDULE', target: 'connections', category: 'connections' },
                { title: 'MATERIAL SCHEDULE', target: 'miscellaneous', category: 'miscellaneous' }
            ];

            scheduleTypes.forEach(schedule => {
                const found = this._processSchedule(page.lines, schedule.title, steelData[schedule.target], uniqueEntries, schedule.category);
                if (found > 0) {
                    console.log(`   ✅ ${schedule.title}: ${found} items`);
                    totalItemsFound += found;
                }
            });

            const generalItems = this._processGeneralText(page.lines, steelData, uniqueEntries);
            if (generalItems > 0) {
                console.log(`   📝 General text: ${generalItems} items`);
                totalItemsFound += generalItems;
            }
        }

        this._finalizeClassification(steelData);
        steelData.summary = this._createDetailedSummary(steelData);

        console.log('\n🎯 === EXTRACTION SUMMARY ===');
        console.log(`Main Members: ${steelData.mainMembers.length}`);
        console.log(`Hollow Sections: ${steelData.hollowSections.length}`);
        // ... (rest of the log statements) ...
        console.log(`TOTAL STEEL ITEMS: ${steelData.summary.totalItems}`);

        return steelData;
    }

    // ... (all other private methods like _getTextWithLayout, _processSchedule, etc. remain the same) ...
    async _getTextWithLayout(pdfBuffer) {
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdf = await pdfjsLib.getDocument({ 
      data: uint8Array, 
      useSystemFonts: true, 
      verbosity: 0 
    }).promise;
    
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items;

      items.sort((a, b) => {
        const yDiff = Math.abs(a.transform[5] - b.transform[5]);
        if (yDiff > 5) {
          return b.transform[5] - a.transform[5];
        }
        return a.transform[4] - b.transform[4];
      });

      const lines = [];
      let currentLine = { y: -1, text: '', items: [] };
      
      for (const item of items) {
        if (Math.abs(item.transform[5] - currentLine.y) > 5) {
          if (currentLine.text.trim()) {
            lines.push(currentLine);
          }
          currentLine = { 
            y: item.transform[5], 
            text: item.str, 
            items: [item] 
          };
        } else {
          currentLine.text += ' ' + item.str;
          currentLine.items.push(item);
        }
      }
      if (currentLine.text.trim()) {
        lines.push(currentLine);
      }
      
      pages.push({ pageNumber: i, lines });
    }
    return pages;
  }

  _processSchedule(lines, scheduleTitle, targetArray, uniqueEntries, category) {
    const titleIndex = lines.findIndex(line => 
      line.text.toUpperCase().includes(scheduleTitle.toUpperCase())
    );
    
    if (titleIndex === -1) return 0;

    console.log(`   📋 Processing ${scheduleTitle}...`);
    
    let itemsFound = 0;
    const maxLines = Math.min(titleIndex + 30, lines.length);
    
    for (let i = titleIndex + 1; i < maxLines; i++) {
      const lineText = lines[i].text.trim();
      
      if (!lineText || 
          (lineText.toUpperCase().includes('SCHEDULE') && 
           !lineText.toUpperCase().includes(scheduleTitle.toUpperCase()))) {
        continue;
      }

      const foundItems = this._extractSteelFromLine(lineText, category, scheduleTitle);
      
      foundItems.forEach(item => {
        const uniqueKey = `${item.designation}-${item.category}-${scheduleTitle}`;
        if (!uniqueEntries.has(uniqueKey)) {
          uniqueEntries.add(uniqueKey);
          targetArray.push(item);
          itemsFound++;
          console.log(`      ✅ ${item.designation} (${item.quantity}x)`);
        }
      });
    }

    return itemsFound;
  }

  _processGeneralText(lines, steelData, uniqueEntries) {
    let itemsFound = 0;

    lines.forEach((line, index) => {
      const text = line.text.trim();
      
      if (this._shouldSkipLine(text)) return;

      Object.entries(this.categories).forEach(([categoryName, patternNames]) => {
        const foundItems = this._extractSteelFromLine(text, categoryName, 'General Text');
        
        foundItems.forEach(item => {
          const uniqueKey = `${item.designation}-${item.category}-general`;
          if (!uniqueEntries.has(uniqueKey)) {
            uniqueEntries.add(uniqueKey);
            steelData[categoryName].push(item);
            itemsFound++;
          }
        });
      });
    });

    return itemsFound;
  }

  _extractSteelFromLine(lineText, preferredCategory, source) {
    const foundItems = [];
    const text = lineText.toUpperCase();

    const quantity = this._extractQuantity(lineText) || 1;
    
    const categoriesToCheck = preferredCategory ? 
      [preferredCategory, ...Object.keys(this.categories).filter(c => c !== preferredCategory)] :
      Object.keys(this.categories);

    categoriesToCheck.forEach(categoryName => {
      const patternNames = this.categories[categoryName];
      
      patternNames.forEach(patternName => {
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
                subCategory: classification.subCategory,
                quantity: quantity,
                source: source,
                rawLine: lineText,
                patternUsed: patternName,
                dimensions: this._extractDimensions(lineText),
                weight: this._extractWeight(lineText),
                length: this._extractLength(lineText)
              });
            }
          });
        }
      });
    });

    return foundItems;
  }

  _shouldSkipLine(text) {
    const skipPatterns = [
      /^(DRAWING|TITLE|SCALE|DATE|DRAWN|CHECKED|APPROVED|REVISION|NOTE|GENERAL|SPECIFICATION)/i,
      /^(SHEET|PAGE|\d+\s*OF\s*\d+)/i,
      /^(TOLERANCES|WELDING|FINISH|MATERIAL\s*PROPERTIES)/i,
      /^\s*[A-Z]\s*$/i
    ];

    return skipPatterns.some(pattern => pattern.test(text)) || text.length < 3;
  }

  _extractQuantity(text) {
    this.patterns.quantities.lastIndex = 0;
    const match = this.patterns.quantities.exec(text);
    if (!match) return null;
    
    const qty = parseInt(match[1] || match[2] || match[3] || match[4] || match[5]);
    return (isNaN(qty) || qty <= 0 || qty > 10000) ? null : qty;
  }

  _extractDimensions(text) {
    const dimMatch = text.match(/(\d{2,4})\s*[xX×]\s*(\d{2,4})(?:\s*[xX×]\s*(\d{1,3}))?/);
    return dimMatch ? {
      width: parseInt(dimMatch[1]),
      height: parseInt(dimMatch[2]),
      thickness: dimMatch[3] ? parseInt(dimMatch[3]) : null
    } : null;
  }

  _extractWeight(text) {
    this.patterns.weights.lastIndex = 0;
    const match = this.patterns.weights.exec(text);
    return match ? parseFloat(match[1]) : null;
  }

  _extractLength(text) {
    this.patterns.lengths.lastIndex = 0;
    const match = this.patterns.lengths.exec(text);
    return match ? parseInt(match[1] || match[2]) : null;
  }

  _normalizeDesignation(rawDesignation, patternName) {
    let designation = rawDesignation
      .replace(/\s+/g, '')
      .replace(/[×]/g, 'x')
      .replace(/\//g, '/')
      .toUpperCase()
      .trim();

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
      universalBeams: { type: 'Universal Beam', category: 'mainMembers', subCategory: 'Hot Rolled Beams' },
      universalColumns: { type: 'Universal Column', category: 'mainMembers', subCategory: 'Hot Rolled Columns' },
      pfcChannels: { type: 'Parallel Flange Channel', category: 'mainMembers', subCategory: 'Hot Rolled Channels' },
      shs: { type: 'Square Hollow Section', category: 'hollowSections', subCategory: 'Cold Formed Hollow' },
      rhs: { type: 'Rectangular Hollow Section', category: 'hollowSections', subCategory: 'Cold Formed Hollow' },
      chs: { type: 'Circular Hollow Section', category: 'hollowSections', subCategory: 'Cold Formed Hollow' },
      equalAngles: { type: 'Equal Angle', category: 'angles', subCategory: 'Hot Rolled Angles' },
      unequalAngles: { type: 'Unequal Angle', category: 'angles', subCategory: 'Hot Rolled Angles' },
      cPurlins: { type: 'C Purlin', category: 'purlins', subCategory: 'Cold Formed Purlins' },
      zPurlins: { type: 'Z Purlin', category: 'purlins', subCategory: 'Cold Formed Purlins' },
      topHats: { type: 'Top Hat Section', category: 'purlins', subCategory: 'Cold Formed Purlins' },
      plates: { type: 'Plate', category: 'plates', subCategory: 'Hot Rolled Plate' },
      flatBars: { type: 'Flat Bar', category: 'bars', subCategory: 'Hot Rolled Bar' },
      roundBars: { type: 'Round Bar', category: 'bars', subCategory: 'Hot Rolled Bar' },
      squareBars: { type: 'Square Bar', category: 'bars', subCategory: 'Hot Rolled Bar' },
      stiffeners: { type: 'Stiffener', category: 'plates', subCategory: 'Fabricated Plate' },
      basePlates: { type: 'Base Plate', category: 'plates', subCategory: 'Fabricated Plate' },
      bolts: { type: 'Bolt', category: 'connections', subCategory: 'Structural Fasteners' },
      washers: { type: 'Washer', category: 'hardware', subCategory: 'Fastener Hardware' },
      nuts: { type: 'Nut', category: 'hardware', subCategory: 'Fastener Hardware' }
    };

    return classifications[patternName] || { 
      type: 'Unknown Steel Component', 
      category: 'miscellaneous', 
      subCategory: 'Other' 
    };
  }

  _finalizeClassification(steelData) {
    Object.entries(steelData).forEach(([category, items]) => {
      if (category === 'summary') return;
      
      items.forEach((item, index) => {
        const correctCategory = this._determineCorrectCategory(item.designation, item.type);
        if (correctCategory && correctCategory !== category) {
          steelData[correctCategory] = steelData[correctCategory] || [];
          steelData[correctCategory].push({
            ...item,
            category: correctCategory
          });
          items[index] = null;
        }
      });
      
      steelData[category] = items.filter(item => item !== null);
    });
  }

  _determineCorrectCategory(designation, type) {
    const d = designation.toUpperCase();
    
    if (d.includes('UB') || d.includes('UC') || d.includes('PFC') || d.includes('WB') || d.includes('WC')) {
      return 'mainMembers';
    }
    if (d.includes('SHS') || d.includes('RHS') || d.includes('CHS')) {
      return 'hollowSections';
    }
    if (d.startsWith('L') && d.includes('X')) {
      return 'angles';
    }
    if (d.startsWith('C') || d.startsWith('Z') || d.includes('TH')) {
      return 'purlins';
    }
    if (d.includes('PL') || d.includes('PLATE') || d.includes('STIFF') || d.includes('BP') || d.includes('CP')) {
      return 'plates';
    }
    if (d.includes('FB') || d.includes('RB') || d.includes('SB') || d.includes('FLAT') || d.includes('ROUND') || d.includes('SQUARE')) {
      return 'bars';
    }
    if (d.includes('M') && /M\d+/.test(d) && (d.includes('BOLT') || d.match(/^M\d+$/))) {
      return 'connections';
    }
    if (d.includes('WASHER') || d.includes('NUT')) {
      return 'hardware';
    }
    
    return null;
  }

  _createDetailedSummary(steelData) {
    const summary = {
      totalItems: 0,
      totalWeight: 0,
      categories: {}
    };

    Object.entries(steelData).forEach(([category, items]) => {
      if (category === 'summary') return;
      
      const categoryCount = items.length;
      const categoryWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
      const categoryQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      
      summary.categories[category] = {
        count: categoryCount,
        totalQuantity: categoryQuantity,
        totalWeight: categoryWeight
      };
      
      summary.totalItems += categoryCount;
      summary.totalWeight += categoryWeight;
    });

    return summary;
  }
}
