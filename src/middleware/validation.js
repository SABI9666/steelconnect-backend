// middleware/validation.js - Estimation Input Validation
const { body, validationResult } = require('express-validator');

const validateEstimationInput = [
    body('projectName')
        .notEmpty()
        .withMessage('Project name is required')
        .isLength({ min: 3, max: 200 })
        .withMessage('Project name must be between 3 and 200 characters')
        .trim()
        .escape(),

    body('projectLocation')
        .optional()
        .isLength({ max: 200 })
        .withMessage('Project location must not exceed 200 characters')
        .trim()
        .escape(),

    body('structureType')
        .notEmpty()
        .withMessage('Structure type is required')
        .isIn([
            'commercial-building',
            'warehouse', 
            'bridge',
            'tower',
            'stadium',
            'residential',
            'infrastructure',
            'petrochemical',
            'power-plant',
            'miscellaneous'
        ])
        .withMessage('Invalid structure type'),

    body('projectComplexity')
        .notEmpty()
        .withMessage('Project complexity is required')
        .isIn(['simple', 'moderate', 'complex', 'architectural'])
        .withMessage('Invalid project complexity'),

    body('steelGrade')
        .notEmpty()
        .withMessage('Steel grade is required')
        .isIn(['A36', 'A572-50', 'A992', 'S355', 'S275', 'Grade-50', 'Weathering', 'Stainless-316', 'Custom'])
        .withMessage('Invalid steel grade'),

    body('coatingRequirement')
        .optional()
        .isIn(['none', 'primer', 'intermediate', 'heavy-duty', 'marine', 'fire-resistant'])
        .withMessage('Invalid coating requirement'),

    body('region')
        .notEmpty()
        .withMessage('Region is required')
        .isIn(['us', 'canada', 'uk', 'australia', 'germany', 'india', 'china', 'uae', 'saudi', 'south-africa'])
        .withMessage('Invalid region'),

    body('totalTonnage')
        .notEmpty()
        .withMessage('Total tonnage is required')
        .isFloat({ min: 0.1, max: 50000 })
        .withMessage('Total tonnage must be between 0.1 and 50,000 MT')
        .toFloat(),

    body('additionalRequirements')
        .optional()
        .isArray()
        .withMessage('Additional requirements must be an array'),

    body('clientId')
        .optional()
        .isMongoId()
        .withMessage('Invalid client ID format'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

// File upload validation
const validateFileUpload = (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No files uploaded'
        });
    }

    const maxFileSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/dwg',
        'application/dxf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    for (const [fieldName, files] of Object.entries(req.files)) {
        const fileArray = Array.isArray(files) ? files : [files];
        
        for (const file of fileArray) {
            if (file.size > maxFileSize) {
                return res.status(400).json({
                    success: false,
                    message: `File ${file.name} exceeds maximum size of 50MB`
                });
            }

            // Additional file extension check
            const allowedExtensions = [
                '.pdf', '.xlsx', '.xls', '.csv', '.dwg', '.dxf', 
                '.ifc', '.step', '.stp', '.sat', '.txt', '.doc', '.docx'
            ];
            
            const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            if (!allowedExtensions.includes(fileExt)) {
                return res.status(400).json({
                    success: false,
                    message: `File type ${fileExt} is not supported`
                });
            }
        }
    }

    next();
};

// Rate limiting for estimation calculations
const estimationRateLimit = (req, res, next) => {
    // This would typically integrate with Redis or similar
    // For now, we'll use a simple in-memory approach
    const userId = req.user.id;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const maxRequests = 10; // 10 estimations per hour

    if (!global.estimationLimits) {
        global.estimationLimits = new Map();
    }

    const userLimits = global.estimationLimits.get(userId) || { count: 0, resetTime: now + windowMs };
    
    if (now > userLimits.resetTime) {
        userLimits.count = 0;
        userLimits.resetTime = now + windowMs;
    }

    if (userLimits.count >= maxRequests) {
        return res.status(429).json({
            success: false,
            message: 'Estimation rate limit exceeded. Please try again later.',
            resetTime: new Date(userLimits.resetTime).toISOString()
        });
    }

    userLimits.count++;
    global.estimationLimits.set(userId, userLimits);
    next();
};

module.exports = {
    validateEstimationInput,
    validateFileUpload,
    estimationRateLimit
};

// config/database.js - Database Connection
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/steelconnect', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
        
        // Create indexes for better performance
        await createIndexes();
        
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        process.exit(1);
    }
};

const createIndexes = async () => {
    try {
        const db = mongoose.connection.db;
        
        // Estimation indexes
        await db.collection('estimations').createIndex({ userId: 1, createdAt: -1 });
        await db.collection('estimations').createIndex({ projectName: 'text' });
        await db.collection('estimations').createIndex({ status: 1 });
        await db.collection('estimations').createIndex({ validUntil: 1 });
        
        // User indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('users').createIndex({ type: 1 });
        
        console.log('✅ Database indexes created successfully');
    } catch (error) {
        console.warn('⚠️  Index creation warning:', error.message);
    }
};

module.exports = connectDB;

// middleware/errorHandler.js - Global Error Handler
const errorHandler = (err, req, res, next) => {
    console.error('Error Stack:', err.stack);

    let error = { ...err };
    error.message = err.message;

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }

    // JWT error
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = { message, statusCode: 401 };
    }

    // JWT expired
    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = { message, statusCode: 401 };
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;

// package.json - Dependencies
const packageJson = {
    "name": "steelconnect-backend",
    "version": "1.0.0",
    "description": "SteelConnect Professional Backend API with Advanced Estimation",
    "main": "server.js",
    "scripts": {
        "start": "node server.js",
        "dev": "nodemon server.js",
        "test": "jest",
        "seed": "node scripts/seed.js"
    },
    "dependencies": {
        "express": "^4.18.2",
        "mongoose": "^7.5.0",
        "cors": "^2.8.5",
        "helmet": "^7.0.0",
        "bcryptjs": "^2.4.3",
        "jsonwebtoken": "^9.0.2",
        "express-validator": "^7.0.1",
        "express-rate-limit": "^6.10.0",
        "compression": "^1.7.4",
        "morgan": "^1.10.0",
        "dotenv": "^16.3.1",
        "express-fileupload": "^1.4.0",
        "xlsx": "^0.18.5",
        "csv-parser": "^3.0.0",
        "pdf2json": "^3.0.4",
        "pdfkit": "^0.13.0",
        "multer": "^1.4.5-lts.1",
        "sharp": "^0.32.5",
        "nodemailer": "^6.9.4"
    },
    "devDependencies": {
        "nodemon": "^3.0.1",
        "jest": "^29.6.4",
        "supertest": "^6.3.3"
    },
    "engines": {
        "node": ">=16.0.0"
    }
};