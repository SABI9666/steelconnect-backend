import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Schema for individual line items
const EstimationItemSchema = new Schema({
    code: { type: String, required: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    unitRate: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    category: { type: String, required: true },
    subcategory: { type: String, default: '' },
    notes: { type: String, default: '' },
    riskFactor: { type: Number, default: 1.0, min: 0.5, max: 2.0 },
    confidence: { type: Number, default: 0.8, min: 0, max: 1 }
});

// Schema for cost summary
const CostSummarySchema = new Schema({
    base_cost: { type: Number, required: true, min: 0 },
    location_factor: { type: Number, default: 1.0 },
    location_adjusted: { type: Number, required: true, min: 0 },
    complexity_multiplier: { type: Number, default: 1.0 },
    access_factor: { type: Number, default: 1.0 },
    risk_adjusted: { type: Number, required: true, min: 0 },
    site_access_contingency: { type: Number, default: 0 },
    unforeseen_contingency: { type: Number, default: 0 },
    subtotal_ex_gst: { type: Number, required: true, min: 0 },
    gst: { type: Number, required: true, min: 0 },
    total_inc_gst: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'AUD' }
});

// Schema for structured data from PDF extraction
const StructuredDataSchema = new Schema({
    schedules: [{
        title: String,
        items: [{
            mark: String,
            section: String,
            length: Number,
            quantity: Number,
            weight: Number,
            raw_text: String
        }]
    }],
    dimensions: [{
        text: String,
        parsed: {
            length: Number,
            width: Number,
            height: Number,
            unit: String
        },
        context: String
    }],
    specifications: [{
        text: String,
        data: {
            concreteGrade: String,
            steelSection: String
        },
        context: String
    }],
    titleBlocks: [{
        text: String,
        type: String
    }]
});

// Schema for AI analysis results
const AnalysisResultSchema = new Schema({
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    drawingAnalysis: {
        project_info: {
            project_name: String,
            drawing_number: String,
            revision: String,
            drawing_type: String
        },
        structural_systems: {
            foundation_type: String,
            structural_system: String,
            floor_systems: [String],
            roof_system: String
        },
        steel_analysis: {
            total_members_identified: { type: Number, default: 0 },
            member_types: [String],
            max_member_size: String,
            total_estimated_weight: String
        },
        concrete_analysis: {
            grades_identified: [String],
            element_types_inferred: [String],
            estimated_volumes: String
        }
    },
    quantityTakeoff: {
        steel_quantities: {
            members: [{
                section: String,
                total_length_m: Number,
                weight_per_m: Number,
                total_weight_kg: Number,
                member_type: String,
                quantity: Number
            }],
            summary: {
                total_steel_weight_tonnes: { type: Number, default: 0 },
                beam_weight_tonnes: { type: Number, default: 0 },
                column_weight_tonnes: { type: Number, default: 0 },
                member_count: { type: Number, default: 0 }
            }
        },
        concrete_quantities: {
            elements: [{
                element_type: String,
                grade: String,
                volume_m3: Number,
                area_m2: Number,
                linear_m: Number,
                estimated: { type: Boolean, default: true }
            }],
            summary: {
                total_concrete_m3: { type: Number, default: 0 },
                n32_concrete_m3: { type: Number, default: 0 },
                n40_concrete_m3: { type: Number, default: 0 },
                slab_area_m2: { type: Number, default: 0 }
            }
        },
        calculation_notes: [String]
    },
    specifications: {
        concrete_specifications: {
            grades_found: [String],
            typical_applications: Schema.Types.Mixed,
            cover_requirements: Schema.Types.Mixed
        },
        steel_specifications: {
            sections_used: [String],
            steel_grade: String,
            connection_requirements: String,
            surface_treatment: String
        },
        standards_applicable: [String]
    },
    scopeIdentification: {
        work_packages: [{
            package_name: String,
            description: String,
            complexity: { type: String, enum: ['low', 'medium', 'high'] },
            estimated_duration_days: Number
        }],
        project_complexity: { type: String, enum: ['low', 'medium', 'high'] },
        member_count_basis: Number,
        data_confidence: Number
    },
    riskAssessment: {
        technical_risks: [{
            risk: String,
            probability: String,
            impact: String,
            mitigation: String
        }],
        data_quality_risks: [{
            extraction_confidence: Number,
            recommendation: String
        }],
        cost_factors: {
            complexity_multiplier: { type: Number, default: 1.0 },
            data_confidence_factor: { type: Number, default: 1.0 }
        }
    },
    assumptions: [String]
});

// Schema for processing metadata
const ProcessingMetadataSchema = new Schema({
    pdfPages: { type: Number, default: 0 },
    structuredElementsFound: { type: Number, default: 0 },
    aiAnalysisConfidence: { type: Number, min: 0, max: 1 },
    processingDate: { type: Date, default: Date.now },
    enhancedProcessing: { type: Boolean, default: false },
    processingTimeMs: { type: Number, default: 0 },
    errorsDuringProcessing: [String],
    qualityMetrics: {
        textExtractionSuccess: { type: Boolean, default: true },
        scheduleExtractionSuccess: { type: Boolean, default: false },
        specificationExtractionSuccess: { type: Boolean, default: false },
        dimensionExtractionSuccess: { type: Boolean, default: false }
    }
});

// Main Estimation Schema
const EstimationSchema = new Schema({
    // Basic project information
    projectName: { 
        type: String, 
        required: true,
        trim: true,
        maxLength: 200
    },
    projectLocation: { 
        type: String, 
        required: true,
        enum: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Darwin', 'Hobart'],
        index: true
    },
    clientName: {
        type: String,
        trim: true
    },

    // File information
    originalFilename: { 
        type: String, 
        required: true 
    },
    fileSize: { 
        type: Number, 
        default: 0 
    },
    fileType: { 
        type: String, 
        default: 'pdf' 
    },

    // Processing results
    extractionConfidence: { 
        type: Number, 
        min: 0, 
        max: 1, 
        default: 0,
        index: true
    },
    structuredData: StructuredDataSchema,
    analysisResults: AnalysisResultSchema,
    processingMetadata: ProcessingMetadataSchema,

    // Cost estimation results
    estimationData: {
        items: [EstimationItemSchema],
        cost_summary: CostSummarySchema,
        categories: Schema.Types.Mixed,
        assumptions: [String],
        exclusions: [String],
        notes: { type: String, default: '' },
        validityPeriodDays: { type: Number, default: 30 }
    },

    // Management fields
    status: {
        type: String,
        required: true,
        enum: ['Draft', 'Processing', 'Review', 'Submitted', 'Approved', 'Rejected', 'Archived'],
        default: 'Draft',
        index: true
    },
    version: {
        type: Number,
        default: 1,
        min: 1
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User', // Assumes a 'User' model exists for associating the estimation with a user
        required: true
    }

}, {
    // Automatically add createdAt and updatedAt timestamps
    timestamps: true
});

// Create and export the model
const Estimation = model('Estimation', EstimationSchema);

export default Estimation;

