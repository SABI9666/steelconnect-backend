import pdf from 'pdf-parse';

/**
 * A service class to process structural engineering PDF drawings and extract structured data.
 * It uses regular expressions to find steel schedules, general notes, and specifications.
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
    }

    /**
     * Processes a PDF buffer to extract structured data.
     * @param {Buffer} pdfBuffer - The buffer containing the PDF file.
     * @returns {Promise<object>} A promise that resolves to the structured data.
     */
    async process(pdfBuffer) {
        try {
            console.log('📄 Starting PDF processing...');
            const data = await pdf(pdfBuffer);
            const text = data.text;

            if (!text || text.trim().length === 0) {
                throw new Error("No text could be extracted from the PDF.");
            }

            const steelSchedules = this._extractSteelSchedules(text);
            const generalNotes = this._extractGeneralNotes(text);
            const specifications = this._extractSpecifications(text);

            const structuredData = {
                metadata: {
                    pages: data.numpages,
                    version: data.version,
                    character_count: text.length,
                },
                steel_schedules: steelSchedules,
                general_notes: generalNotes,
                specifications: specifications,
                confidence: this._calculateConfidence(steelSchedules, text),
            };

            console.log(`✅ PDF processed successfully. Found ${steelSchedules.length} steel members.`);
            return structuredData;

        } catch (error) {
            console.error(`❌ PDF processing failed: ${error.message}`);
            // CORRECTED: Re-throw the error to be handled by the calling service (e.g., API route).
            // This is better than returning a successful response with an error message.
            throw new Error(`Failed to process PDF. Reason: ${error.message}`);
        }
    }

    _extractSteelSchedules(text) {
        const schedules = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
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
                });
            }
        });
        return schedules;
    }

    _extractGeneralNotes(text) {
        const notesMatch = text.match(this.patterns.generalNotesBlock);
        // Return an array of notes, or an empty array if none are found.
        return notesMatch ? notesMatch[1].trim().split('\n').filter(line => line.trim() !== '') : [];
    }

    _extractSpecifications(text) {
        return {
            steel_grade: this._extractValue(text, this.patterns.steelGrade) || '300PLUS',
            concrete_grade: this._extractValue(text, this.patterns.concreteGrade) || 'N32',
            bolt_grade: this._extractValue(text, this.patterns.boltGrade) || '8.8/S',
        };
    }

    _extractValue(text, regex) {
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    }

    _calculateConfidence(schedules, text) {
        let score = 0.1; // Start with a base score
        if (schedules.length > 0) score += 0.5;
        if (schedules.length > 10) score += 0.2;
        if (text.length > 1000) score += 0.1;
        if (this.patterns.steelScheduleHeader.test(text)) score += 0.15;

        // Ensure confidence is capped at a realistic maximum (e.g., 0.95)
        return Math.min(0.95, parseFloat(score.toFixed(2)));
    }
}
