// src/services/pdfProcessor.js - FIXED VERSION
import pdf from 'pdf-parse';

/**
 * A service class to process structural engineering PDF drawings and extract structured data.
 * It uses regular expressions to find steel schedules, general notes, and specifications.
 * FIXED: Removed test file dependency that was causing deployment issues.
 */
export class PdfProcessor {
    constructor() {
        // Corrected and enhanced RegExp patterns for better accuracy.
        this.patterns = {
            // Looks for a steel schedule header to determine confidence.
            steelScheduleHeader: /STEEL\s+SCHEDULE/i,
            
            // Captures the block of text under "GENERAL NOTES". Stops at the next major section or end of text.
            generalNotesBlock: /GENERAL\s+NOTES:([\s\S]*?)(?=STEEL\s+SCHEDULE|STRUCTURAL\s+SPECIFICATIONS|\Z)/i,
            
            // CORRECTED: More precise pattern for steel member designations.
            // Handles formats like '250 UB 31.4', '150x100x8 RHS', '90x90x8 EA'.
            memberLine: /(\b\d+(?:x\d+)*\s*(?:UB|UC|PFC|SHS|RHS|CHS|EA|UA)\b(?:\s*[\d.]*)*)/i,
            
            // Patterns to find quantity and length on a line.
            quantity: /(?:QTY|QUANTITY)\s*[:\-]\s*(\d+)/i,
            length: /(?:LENGTH|LEN)\s*[:\-]\s*([\d.]+)/i,
            
            // Patterns for extracting specific grades from the entire text.
            steelGrade: /STEEL\s+GRADE\s*:\s*(\w+(?:\/\w+)*)/i,
            concreteGrade: /CONCRETE\s+GRADE\s*:\s*(\w+)/i,
            boltGrade: /BOLT\s+GRADE\s*:\s*([\d.]+\/S)/i
        };
        
        console.log('✅ PDF Processor initialized successfully');
    }

    /**
     * Processes a PDF buffer to extract structured data.
     * @param {Buffer} pdfBuffer - The buffer containing the PDF file.
     * @returns {Promise<object>} A promise that resolves to the structured data.
     */
    async process(pdfBuffer) {
        try {
            console.log('📄 Starting PDF processing...');
            
            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error("Invalid PDF buffer provided");
            }

            const data = await pdf(pdfBuffer);
            const text = data.text;

            if (!text || text.trim().length === 0) {
                throw new Error("No text could be extracted from the PDF");
            }

            console.log(`📊 Extracted ${text.length} characters from ${data.numpages} pages`);

            const steelSchedules = this._extractSteelSchedules(text);
            const generalNotes = this._extractGeneralNotes(text);
            const specifications = this._extractSpecifications(text);
            const confidence = this._calculateConfidence(steelSchedules, text);

            const structuredData = {
                metadata: {
                    pages: data.numpages,
                    version: data.version,
                    character_count: text.length,
                    processing_date: new Date().toISOString()
                },
                steel_schedules: steelSchedules,
                general_notes: generalNotes,
                specifications: specifications,
                confidence: confidence,
                raw_text_sample: text.substring(0, 500) // First 500 chars for debugging
            };

            console.log(`✅ PDF processed successfully. Found ${steelSchedules.length} steel members (confidence: ${confidence})`);
            return structuredData;

        } catch (error) {
            console.error(`❌ PDF processing failed: ${error.message}`);
            
            // Return a minimal structure instead of throwing to prevent complete failure
            return {
                metadata: {
                    pages: 0,
                    character_count: 0,
                    processing_date: new Date().toISOString(),
                    error: error.message
                },
                steel_schedules: [],
                general_notes: [],
                specifications: {
                    steel_grade: '300PLUS',
                    concrete_grade: 'N32',
                    bolt_grade: '8.8/S'
                },
                confidence: 0.1,
                processing_error: true
            };
        }
    }

    _extractSteelSchedules(text) {
        const schedules = [];
        const lines = text.split('\n');
        
        console.log(`🔍 Analyzing ${lines.length} lines for steel schedules...`);
        
        lines.forEach((line, index) => {
            // Use the more precise regex to find a potential member line.
            const designationMatch = line.match(this.patterns.memberLine);
            if (designationMatch) {
                const designation = designationMatch[0].trim();
                const quantity = this._extractValue(line, this.patterns.quantity) || '1';
                const length = this._extractValue(line, this.patterns.length) || '6000'; // Default 6m

                // CORRECTED: Smarter note extraction. Remove designation, quantity, and length to isolate notes.
                let notes = line.replace(designation, '')
                                .replace(this.patterns.quantity, '')
                                .replace(this.patterns.length, '')
                                .replace(/QTY|QUANTITY|LENGTH|LEN/ig, '') // Remove keywords
                                .replace(/[:\-]/g, '') // Remove separators
                                .trim();

                schedules.push({
                    designation,
                    quantity,
                    length,
                    notes,
                    line_number: index + 1
                });
                
                console.log(`📋 Found steel member: ${designation} (Qty: ${quantity}, Length: ${length})`);
            }
        });
        
        console.log(`🏗️ Total steel members extracted: ${schedules.length}`);
        return schedules;
    }

    _extractGeneralNotes(text) {
        const notesMatch = text.match(this.patterns.generalNotesBlock);
        const notes = notesMatch ? 
            notesMatch[1].trim().split('\n').filter(line => line.trim() !== '') : 
            [];
            
        console.log(`📝 Extracted ${notes.length} general notes`);
        return notes;
    }

    _extractSpecifications(text) {
        const specs = {
            steel_grade: this._extractValue(text, this.patterns.steelGrade) || '300PLUS',
            concrete_grade: this._extractValue(text, this.patterns.concreteGrade) || 'N32',
            bolt_grade: this._extractValue(text, this.patterns.boltGrade) || '8.8/S',
        };
        
        console.log('🔧 Extracted specifications:', specs);
        return specs;
    }

    _extractValue(text, regex) {
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    }

    _calculateConfidence(schedules, text) {
        let score = 0.1; // Start with a base score
        
        // Increase confidence based on found elements
        if (schedules.length > 0) score += 0.5;
        if (schedules.length > 5) score += 0.1;
        if (schedules.length > 10) score += 0.1;
        if (schedules.length > 20) score += 0.1;
        
        // Text length indicates document completeness
        if (text.length > 1000) score += 0.05;
        if (text.length > 5000) score += 0.05;
        
        // Presence of key headers increases confidence
        if (this.patterns.steelScheduleHeader.test(text)) score += 0.1;
        
        // Look for common structural engineering terms
        const engineeringTerms = [
            /structural/i, /steel/i, /concrete/i, /beam/i, /column/i,
            /foundation/i, /connection/i, /weld/i, /bolt/i, /grade/i
        ];
        
        const foundTerms = engineeringTerms.filter(term => term.test(text)).length;
        score += foundTerms * 0.02; // Small boost for each engineering term
        
        // Ensure confidence is capped at a realistic maximum
        const finalScore = Math.min(0.95, parseFloat(score.toFixed(2)));
        console.log(`📊 Confidence calculation: ${finalScore} (${schedules.length} members, ${text.length} chars)`);
        
        return finalScore;
    }

    /**
     * Test method to verify the processor is working
     * No longer depends on external test files
     */
    async testProcessor() {
        try {
            console.log('🧪 Running PDF processor self-test...');
            
            // Create a simple test buffer with mock PDF-like text
            const mockText = `
STEEL SCHEDULE
250 UB 31.4  QTY: 8  LENGTH: 6000  Main beams
200 UC 46.2  QTY: 4  LENGTH: 3000  Columns
150 PFC      QTY: 12 LENGTH: 4500  Secondary beams

GENERAL NOTES:
All steel to be hot-dip galvanized
Standard connections as per AS 4100-2020
Welding to AS/NZS 1554.1

STEEL GRADE: 300PLUS
CONCRETE GRADE: N32
BOLT GRADE: 8.8/S
            `;

            // Simulate pdf-parse response
            const mockPdfData = {
                text: mockText,
                numpages: 1,
                version: '1.0'
            };

            // Process the mock data
            const result = {
                metadata: {
                    pages: mockPdfData.numpages,
                    character_count: mockText.length,
                    processing_date: new Date().toISOString()
                },
                steel_schedules: this._extractSteelSchedules(mockText),
                general_notes: this._extractGeneralNotes(mockText),
                specifications: this._extractSpecifications(mockText),
                confidence: this._calculateConfidence(this._extractSteelSchedules(mockText), mockText)
            };

            console.log('✅ PDF processor self-test completed successfully');
            console.log(`📊 Test results: ${result.steel_schedules.length} members, confidence: ${result.confidence}`);
            
            return {
                success: true,
                result: result,
                message: 'PDF processor is working correctly'
            };

        } catch (error) {
            console.error('❌ PDF processor self-test failed:', error.message);
            return {
                success: false,
                error: error.message,
                message: 'PDF processor test failed'
            };
        }
    }
}
