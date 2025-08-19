// middleware/fileUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Create upload directories
const uploadPaths = {
    estimations: 'uploads/estimations/',
    results: 'uploads/results/'
};

Object.values(uploadPaths).forEach(ensureDirExists);

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath;
        
        if (req.route.path.includes('result') || req.url.includes('result')) {
            uploadPath = uploadPaths.results;
        } else {
            uploadPath = uploadPaths.estimations;
        }
        
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
        cb(null, filename);
    }
});

// File filter function
const fileFilter = (req, file, cb) => {
    const isResultUpload = req.route.path.includes('result') || req.url.includes('result');
    
    if (isResultUpload) {
        // Only PDFs for result uploads
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for estimation results'), false);
        }
    } else {
        // Multiple file types for estimation requests
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'application/dwg',
            'application/dxf',
            'application/x-autocad',
            'image/vnd.dwg'
        ];
        
        const allowedExtensions = /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|txt|dwg|dxf)$/i;
        
        const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
        const extensionValid = allowedExtensions.test(file.originalname);
        
        if (mimeTypeValid || extensionValid) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: JPG, PNG, PDF, DOC, DOCX, XLS, XLSX, TXT, DWG, DXF'), false);
        }
    }
};

// Multer configuration
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 10 // Maximum 10 files per upload
    },
    fileFilter: fileFilter
});

// Different upload configurations
const uploadConfigs = {
    // Single result file upload
    singleResult: upload.single('resultFile'),
    
    // Multiple estimation files upload
    multipleFiles: upload.array('files', 10),
    
    // Single estimation file upload
    singleFile: upload.single('file'),
    
    // Mixed uploads with specific field names
    fields: upload.fields([
        { name: 'drawings', maxCount: 5 },
        { name: 'specifications', maxCount: 3 },
        { name: 'images', maxCount: 5 },
        { name: 'documents', maxCount: 2 }
    ])
};

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({
                    success: false,
                    message: 'File too large. Maximum size is 50MB.',
                    error: 'FILE_TOO_LARGE'
                });
            case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                    success: false,
                    message: 'Too many files. Maximum is 10 files.',
                    error: 'TOO_MANY_FILES'
                });
            case 'LIMIT_UNEXPECTED_FILE':
                return res.status(400).json({
                    success: false,
                    message: 'Unexpected field name in file upload.',
                    error: 'UNEXPECTED_FIELD'
                });
            default:
                return res.status(400).json({
                    success: false,
                    message: 'File upload error: ' + error.message,
                    error: 'UPLOAD_ERROR'
                });
        }
    } else if (error) {
        return res.status(400).json({
            success: false,
            message: error.message,
            error: 'UPLOAD_ERROR'
        });
    }
    next();
};

// File validation helper
const validateFiles = (files) => {
    const errors = [];
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    if (!files || (Array.isArray(files) && files.length === 0)) {
        errors.push('At least one file is required');
        return errors;
    }

    const fileArray = Array.isArray(files) ? files : [files];

    fileArray.forEach((file, index) => {
        if (!file) {
            errors.push(`File ${index + 1}: No file provided`);
            return;
        }

        if (file.size > maxSize) {
            errors.push(`File ${index + 1}: File size exceeds 50MB limit`);
        }

        if (!allowedTypes.includes(file.mimetype)) {
            errors.push(`File ${index + 1}: Invalid file type. Allowed: JPG, PNG, PDF, DOC, DOCX`);
        }
    });

    return errors;
};

// File cleanup utility
const deleteFile = (filePath) => {
    return new Promise((resolve, reject) => {
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

// Delete multiple files
const deleteFiles = async (filePaths) => {
    const deletePromises = filePaths.map(filePath => deleteFile(filePath));
    try {
        await Promise.all(deletePromises);
        return true;
    } catch (error) {
        console.error('Error deleting files:', error);
        return false;
    }
};

// Get file info helper
const getFileInfo = (file) => {
    return {
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadDate: new Date()
    };
};

// File type detector
const getFileType = (filename, mimeType) => {
    const ext = path.extname(filename).toLowerCase();
    const mime = mimeType.toLowerCase();
    
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'document';
    if (['.dwg', '.dxf'].includes(ext)) return 'drawing';
    if (['.doc', '.docx', '.txt'].includes(ext)) return 'specification';
    
    return 'other';
};

module.exports = {
    upload,
    uploadConfigs,
    handleUploadError,
    validateFiles,
    deleteFile,
    deleteFiles,
    getFileInfo,
    getFileType,
    uploadPaths
};