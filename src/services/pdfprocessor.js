// services/pdfprocessor.js
import pdf from 'pdf-parse';

export class PdfProcessor {
    constructor() {
        // Regex patterns for identifying different sections and data points
        this.patterns = {
            steelSchedule: /STEEL\s+SCHEDULE/i,
            memberDesignation: /(\d+\s*(UB|UC|PFC|SHS|RHS|CHS|EA|UA)\s*[\d\.]*)/ig,
            quantity: /(QTY|QUANTITY)\s*:\s*(\d+)/i,
            length: /(LENGTH|LEN)\s*:\s*([\d\.]+)/i,
            grade: /GRADE\s*:\s*(\w+)/i,
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

            if (!text) {
                throw new Error("No text could be extracted from the PDF.");
            }

            // Extract different parts of the document
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
            console.error(`PDF processing failed: ${error.message}`);
            // Return a fallback structure on error
            return {
                metadata: {},
                steel_schedules: [],
                general_notes: "Error processing PDF.",
                specifications: {},
                confidence: 0.1,
            };
        }
    }

    /**
     * Extracts steel member schedules from the text.
     */
    _extractSteelSchedules(text) {
        const schedules = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            // A simple heuristic: a line with a common steel section designation is likely a member
            if (/(\d+\s*(UB|UC|PFC|SHS|RHS|CHS))/.test(line)) {
                const designationMatch = line.match(this.patterns.memberDesignation);
                if (designationMatch) {
                    schedules.push({
                        designation: designationMatch[0].trim(),
                        quantity: this._extractValue(line, /(?:QTY|QUANTITY)\s*[:\-]\s*(\d+)/i) || '1',
                        length: this._extractValue(line, /(?:LENGTH|LEN)\s*[:\-]\s*([\d\.]+)/i) || '6000', // Default 6m
                        notes: line.replace(designationMatch[0], '').trim(),
                    });
                }
            }
        });
        return schedules;
    }

    /**
     * Extracts general notes from the text.
     */
    _extractGeneralNotes(text) {
        const notesMatch = text.match(/GENERAL\s+NOTES:([\s\S]*?)STEEL\s+SCHEDULE/i);
        return notesMatch ? notesMatch[1].trim().split('\n').filter(line => line.trim() !== '') : "No general notes found.";
    }

    /**
     * Extracts material specifications.
     */
    _extractSpecifications(text) {
        return {
            steel_grade: this._extractValue(text, /STEEL\s+GRADE\s*:\s*(\w+\/?\w*)/i) || '300PLUS',
            concrete_grade: this._extractValue(text, /CONCRETE\s+GRADE\s*:\s*(\w+)/i) || 'N32',
            bolt_grade: this._extractValue(text, /BOLT\s+GRADE\s*:\s*([\d\.]+\/S)/i) || '8.8/S',
        };
    }

    /**
     * Helper to extract a single value using regex.
     */
    _extractValue(text, regex) {
        const match = text.match(regex);
        return match ? match[1] : null;
    }

    /**
     * Calculates a confidence score based on the extracted data.
     */
    _calculateConfidence(schedules, text) {
        let score = 0;
        if (schedules.length > 0) score += 0.5;
        if (schedules.length > 10) score += 0.2;
        if (text.length > 1000) score += 0.1;
        if (/SPECIFICATIONS/i.test(text)) score += 0.1;

        return Math.min(0.95, score); // Cap confidence at 95%
    }
}

