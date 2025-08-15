import pdf from 'pdf-parse';

export class PdfProcessor {
    constructor() {
        // All regex patterns are defined here for clarity and maintenance.
        // All forward slashes within patterns are correctly escaped with a backslash (\).
        this.patterns = {
            steelScheduleHeader: /STEEL\s+SCHEDULE/i,
            generalNotesBlock: /GENERAL\s+NOTES:([\s\S]*?)(?=STEEL\s+SCHEDULE|STRUCTURAL\s+SPECIFICATIONS)/i,
            // Matches common steel member designations like '250 UB 31.4' or '150x100x8 RHS'
            memberLine: /(\d+\s*(UB|UC|PFC|SHS|RHS|CHS|EA|UA)[\s\d\.x]*)/i,
            quantity: /(?:QTY|QUANTITY)\s*[:\-]\s*(\d+)/i,
            length: /(?:LENGTH|LEN)\s*[:\-]\s*([\d\.]+)/i,
            // Correctly escaped forward slashes for grades like '300PLUS/S'
            steelGrade: /STEEL\s+GRADE\s*:\s*(\w+(?:\/\w+)*)/i,
            concreteGrade: /CONCRETE\s+GRADE\s*:\s*(\w+)/i,
            boltGrade: /BOLT\s+GRADE\s*:\s*([\d\.]+\/S)/i,
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
            return {
                metadata: {},
                steel_schedules: [],
                general_notes: "Error processing PDF.",
                specifications: {},
                confidence: 0.1,
            };
        }
    }

    _extractSteelSchedules(text) {
        const schedules = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (this.patterns.memberLine.test(line)) {
                const designationMatch = line.match(this.patterns.memberLine);
                if (designationMatch) {
                    schedules.push({
                        designation: designationMatch[0].trim(),
                        quantity: this._extractValue(line, this.patterns.quantity) || '1',
                        length: this._extractValue(line, this.patterns.length) || '6000', // Default 6m
                        notes: line.replace(designationMatch[0], '').trim(),
                    });
                }
            }
        });
        return schedules;
    }

    _extractGeneralNotes(text) {
        const notesMatch = text.match(this.patterns.generalNotesBlock);
        return notesMatch ? notesMatch[1].trim().split('\n').filter(line => line.trim() !== '') : "No general notes found.";
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
        return match ? match[1] : null;
    }

    _calculateConfidence(schedules, text) {
        let score = 0;
        if (schedules.length > 0) score += 0.5;
        if (schedules.length > 10) score += 0.2;
        if (text.length > 1000) score += 0.1;
        if (/SPECIFICATIONS/i.test(text)) score += 0.1;

        return Math.min(0.95, score);
    }
}
