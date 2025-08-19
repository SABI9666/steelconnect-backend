// models/Estimation.js
const mongoose = require('mongoose');

const estimationSchema = new mongoose.Schema({
    contractorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    projectTitle: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        maxlength: 2000
    },
    category: {
        type: String,
        enum: ['residential', 'commercial', 'industrial', 'infrastructure', 'renovation', 'other'],
        default: 'other'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    expectedBudget: {
        type: Number,
        min: 0
    },
    deadline: {
        type: Date
    },
    uploadedFiles: [{
        filename: {
            type: String,
            required: true
        },
        originalName: {
            type: String,
            required: true
        },
        filePath: {
            type: String,
            required: true
        },
        fileSize: {
            type: Number,
            required: true
        },
        uploadDate: {
            type: Date,
            default: Date.now
        },
        fileType: {
            type: String,
            enum: ['drawing', 'specification', 'image', 'document', 'other'],
            default: 'other'
        },
        mimeType: String
    }],
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'],
        default: 'pending'
    },
    estimatedAmount: {
        type: Number,
        min: 0
    },
    estimationDetails: {
        materials: [{
            item: {
                type: String,
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 0
            },
            unit: {
                type: String,
                required: true
            },
            unitPrice: {
                type: Number,
                required: true,
                min: 0
            },
            totalPrice: {
                type: Number,
                required: true,
                min: 0
            }
        }],
        labor: [{
            type: {
                type: String,
                required: true
            },
            hours: {
                type: Number,
                required: true,
                min: 0
            },
            rate: {
                type: Number,
                required: true,
                min: 0
            },
            totalCost: {
                type: Number,
                required: true,
                min: 0
            }
        }],
        additionalCosts: [{
            description: {
                type: String,
                required: true
            },
            amount: {
                type: Number,
                required: true,
                min: 0
            }
        }],
        notes: {
            type: String,
            maxlength: 1000
        },
        totalMaterialCost: {
            type: Number,
            default: 0
        },
        totalLaborCost: {
            type: Number,
            default: 0
        },
        totalAdditionalCost: {
            type: Number,
            default: 0
        },
        grandTotal: {
            type: Number,
            default: 0
        }
    },
    resultFile: {
        filename: String,
        originalName: String,
        filePath: String,
        fileSize: Number,
        uploadDate: Date,
        mimeType: String
    },
    adminNotes: {
        type: String,
        maxlength: 1000
    },
    estimatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    estimationStartDate: Date,
    estimationCompletedDate: Date,
    viewedByContractor: {
        type: Boolean,
        default: false
    },
    lastViewedDate: Date
}, {
    timestamps: true
});

// Indexes for better query performance
estimationSchema.index({ contractorId: 1, status: 1 });
estimationSchema.index({ status: 1, createdAt: -1 });
estimationSchema.index({ estimatedBy: 1, status: 1 });

// Virtual for total files count
estimationSchema.virtual('totalFiles').get(function() {
    return this.uploadedFiles.length + (this.resultFile ? 1 : 0);
});

// Pre-save middleware to calculate totals
estimationSchema.pre('save', function(next) {
    if (this.estimationDetails) {
        // Calculate material total
        this.estimationDetails.totalMaterialCost = this.estimationDetails.materials.reduce((total, item) => {
            return total + (item.totalPrice || 0);
        }, 0);

        // Calculate labor total
        this.estimationDetails.totalLaborCost = this.estimationDetails.labor.reduce((total, item) => {
            return total + (item.totalCost || 0);
        }, 0);

        // Calculate additional costs total
        this.estimationDetails.totalAdditionalCost = this.estimationDetails.additionalCosts.reduce((total, item) => {
            return total + (item.amount || 0);
        }, 0);

        // Calculate grand total
        this.estimationDetails.grandTotal = 
            this.estimationDetails.totalMaterialCost + 
            this.estimationDetails.totalLaborCost + 
            this.estimationDetails.totalAdditionalCost;

        // Update main estimated amount
        this.estimatedAmount = this.estimationDetails.grandTotal;
    }
    next();
});

// Instance method to check if estimation is overdue
estimationSchema.methods.isOverdue = function() {
    if (!this.deadline || this.status === 'completed') return false;
    return new Date() > this.deadline;
};

// Instance method to get status with overdue info
estimationSchema.methods.getStatusInfo = function() {
    const status = {
        status: this.status,
        isOverdue: this.isOverdue(),
        daysRemaining: null
    };

    if (this.deadline && this.status !== 'completed') {
        const timeDiff = this.deadline.getTime() - new Date().getTime();
        status.daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
    }

    return status;
};

// Static method to get estimations summary
estimationSchema.statics.getSummary = async function() {
    const summary = await this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$estimatedAmount' }
            }
        }
    ]);

    const result = {
        pending: { count: 0, totalAmount: 0 },
        'in-progress': { count: 0, totalAmount: 0 },
        completed: { count: 0, totalAmount: 0 },
        rejected: { count: 0, totalAmount: 0 },
        cancelled: { count: 0, totalAmount: 0 },
        total: { count: 0, totalAmount: 0 }
    };

    summary.forEach(item => {
        if (result[item._id]) {
            result[item._id] = {
                count: item.count,
                totalAmount: item.totalAmount || 0
            };
        }
        result.total.count += item.count;
        result.total.totalAmount += item.totalAmount || 0;
    });

    return result;
};

module.exports = mongoose.model('Estimation', estimationSchema);