import mongoose from 'mongoose';

const estimationSchema = new mongoose.Schema({
    // --- Project Details ---
    projectName: {
        type: String,
        required: true,
        trim: true
    },
    projectLocation: {
        type: String,
        required: true
    },
    clientName: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Draft', 'Approved', 'Archived', 'Completed'],
        default: 'Draft'
    },
    user: {
        // This can be used to link the estimation to a user account
        type: String 
    },

    // --- File & Processing Info ---
    originalFilename: String,
    fileSize: Number,
    processingMetadata: {
        type: Object // Stores data like page count, processing time, etc.
    },
    
    // --- Data & Results ---
    // These are stored as flexible "Mixed" type objects 
    // because their structure from the AI can be complex and vary.
    structuredData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    analysisResults: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    estimationData: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },

}, {
    // This option automatically adds `createdAt` and `updatedAt` fields
    timestamps: true
});

const Estimation = mongoose.model('Estimation', estimationSchema);

export default Estimation;