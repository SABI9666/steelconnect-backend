import mongoose from 'mongoose';

const estimationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'approved', 'rejected'],
        default: 'draft',
    },
    materialCost: {
        type: Number,
        default: 0,
    },
    laborCost: {
        type: Number,
        default: 0,
    },
    totalCost: {
        type: Number,
        required: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // This links to a user in MongoDB
        required: true,
    },
    quoteId: { // This can store the ID from your Firebase 'quotes' collection
         type: String,
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

const Estimation = mongoose.model('Estimation', estimationSchema);

export default Estimation;
