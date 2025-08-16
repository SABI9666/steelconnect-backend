// src/services/pdfProcessor.js
import pdf from 'pdf-parse';

/**
 * A service class to process structural engineering PDF drawings and extract structured data.
 * It uses regular expressions to find steel schedules, general notes, and specifications.
 */
export class PdfProcessor {
    constructor() {
        // Enhanced RegExp patterns for better accuracy
        this.patterns = {
            // Looks for a steel schedule header to determine confidence
            steelScheduleHeader: /STEEL\s+SCHEDULE/i,
            
            // Captures the block of text under "GENERAL NOTES"
            generalNotesBlock: /GENERAL\s+NOTES:([\s\S]*?)(?=STEEL\s+SCHEDULE|STRUCTURAL\s+SPECIFICATIONS|\Z)/i,
            
            // More precise pattern for steel member designations
            memberLine: /(\b\d+(?:x\d+)*\s*(?:UB|UC|PFC|SHS|RHS|CHS|EA|UA)\b(?:\s*[\d.]*)*)/i,
            
            // Patterns to find quantity and length on a line
            quantity: /(?:QTY|QUANTITY)\s*[:\-]\s*(\d+)/i,
            length: /(?:LENGTH|LEN)\s*[:\-]\s*([\d.]+)/i,
            
            // Patterns for extracting specific grades from the entire text
            steelGrade: /STEEL\s+GRADE\s*:\s*(\w+(?:\/\w+)*)/i,
            concreteGrade: /CONCRETE\s+GRADE\s*:\s*(\w+)/i,
            boltGrade: /BOLT\s+GRADE\s*:\s*([\d.]+\/S)/i
        };
    }

    /**
     * Processes a PDF buffer to extract structured data.
     * @param {Buffer} pdfBuffer - The buffer containing the PDF file.
     * @returns {Promise<object>} A promise that resolves to the structured data.
     */
    async process(pdfBuffer) {
        try {
            console.log('📄 Starting PDF processing...');
            
            if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
                throw new Error("Invalid PDF buffer provided");
            }

            const data = await pdf(pdfBuffer);
            const text = data.text;

            if (!text || text.trim().length === 0) {
                throw new Error("No text could be extracted from the PDF");
            }

            const steelSchedules = this._extractSteelSchedules(text);
            const generalNotes = this._extractGeneralNotes(text);
            const specifications = this._extractSpecifications(text);

            const structuredData = {
                metadata: {
                    pages: data.numpages,
                    version: data.version,
                    character_count: text.length,
                    extraction_timestamp: new Date().toISOString()
                },
                steel_schedules: steelSchedules,
                general_notes: generalNotes,
                specifications: specifications,
                confidence: this._calculateConfidence(steelSchedules, text),
                raw_text: text // Keep for debugging if needed
            };

            console.log(`✅ PDF processed successfully. Found ${steelSchedules.length} steel members.`);
            return structuredData;

        } catch (error) {
            console.error(`❌ PDF processing failed: ${error.message}`);
            throw new Error(`Failed to process PDF: ${error.message}`);
        }
    }

    /**
     * Extract steel schedules from text
     */
    _extractSteelSchedules(text) {
        const schedules = [];
        const lines = text.split('\n');
        
        lines.forEach((line, index) => {
            const designationMatch = line.match(this.patterns.memberLine);
            if (designationMatch) {
                const designation = designationMatch[0].trim();
                const quantity = this._extractValue(line, this.patterns.quantity) || '1';
                const length = this._extractValue(line, this.patterns.length) || '6000';

                // Extract notes by removing known components
                let notes = line.replace(designation, '')
                                .replace(this.patterns.quantity, '')
                                .replace(this.patterns.length, '')
                                .replace(/QTY|QUANTITY|LENGTH|LEN/ig, '')
                                .replace(/[:\-]/g, '')
                                .trim();

                schedules.push({
                    designation,
                    quantity,
                    length,
                    notes,
                    line_number: index + 1
                });
            }
        });

        return schedules;
    }

    /**
     * Extract general notes from text
     */
    _extractGeneralNotes(text) {
        const notesMatch = text.match(this.patterns.generalNotesBlock);
        if (!notesMatch) return [];
        
        return notesMatch[1]
            .trim()
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => line.trim());
    }

    /**
     * Extract specifications from text
     */
    _extractSpecifications(text) {
        return {
            steel_grade: this._extractValue(text, this.patterns.steelGrade) || '300PLUS',
            concrete_grade: this._extractValue(text, this.patterns.concreteGrade) || 'N32',
            bolt_grade: this._extractValue(text, this.patterns.boltGrade) || '8.8/S',
        };
    }

    /**
     * Extract value using regex pattern
     */
    _extractValue(text, regex) {
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Calculate confidence score based on extraction quality
     */
    _calculateConfidence(schedules, text) {
        let score = 0.1; // Base score
        
        // Increase confidence based on schedules found
        if (schedules.length > 0) score += 0.5;
        if (schedules.length > 10) score += 0.2;
        
        // Increase confidence based on text content
        if (text.length > 1000) score += 0.1;
        if (this.patterns.steelScheduleHeader.test(text)) score += 0.15;
        
        // Check for common structural terms
        const structuralTerms = ['beam', 'column', 'connection', 'foundation', 'steel', 'concrete'];
        const termMatches = structuralTerms.filter(term => 
            text.toLowerCase().includes(term)
        ).length;
        score += (termMatches / structuralTerms.length) * 0.1;

        // Cap confidence at realistic maximum
        return Math.min(0.95, parseFloat(score.toFixed(2)));
    }

    /**
     * Validate extracted data quality
     */
    validateExtraction(structuredData) {
        const issues = [];
        
        if (!structuredData.steel_schedules || structuredData.steel_schedules.length === 0) {
            issues.push('No steel schedules found');
        }
        
        if (structuredData.confidence < 0.5) {
            issues.push('Low extraction confidence');
        }
        
        if (!structuredData.metadata || structuredData.metadata.character_count < 500) {
            issues.push('Very short document - may be incomplete');
        }
        
        return {
            valid: issues.length === 0,
            issues: issues,
            confidence: structuredData.confidence
        };
    }
}
