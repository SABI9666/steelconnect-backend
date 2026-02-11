// middleware/upload.js - COMPLETE UPDATED version with quote attachment support
import multer from 'multer';
import { uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase } from '../utils/firebaseStorage.js';

// File upload configuration
const FILE_UPLOAD_CONFIG = {
    maxFileSize: 50 * 1024 * 1024, // 50MB per file (supports large PDF drawings/blueprints)
    maxFiles: 20, // Maximum 20 files (for bulk estimation/project file uploads)
    fieldSize: 1024 * 1024, // 1MB for form fields
    fieldNameSize: 100, // Field name size limit
    fields: 20 // Maximum number of non-file fields
};

// UPDATED: Enhanced multer configuration with better route-specific handling
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: FILE_UPLOAD_CONFIG.maxFileSize,
        files: FILE_UPLOAD_CONFIG.maxFiles,
        fieldSize: FILE_UPLOAD_CONFIG.fieldSize,
        fieldNameSize: FILE_UPLOAD_CONFIG.fieldNameSize,
        fields: FILE_UPLOAD_CONFIG.fields
    },
    fileFilter: (req, file, cb) => {
        console.log(`Processing file: ${file.originalname}, MIME: ${file.mimetype}, Field: ${file.fieldname}, Route: ${req.originalUrl}`);
        
        // Handle undefined MIME types
        if (!file.mimetype) {
            console.log(`Rejected file ${file.originalname}: Missing MIME type`);
            return cb(new Error(`File type could not be determined for ${file.originalname}. Please ensure the file is valid.`), false);
        }
        
        // Determine upload context
        const isQuoteUpload = req.originalUrl.includes('/quotes');
        const isEstimationUpload = req.originalUrl.includes('/estimation');
        const isJobUpload = req.originalUrl.includes('/jobs');
        const isProfileUpload = req.originalUrl.includes('/profile');
        const isMessageUpload = req.originalUrl.includes('/messages');
        
        // Define allowed file types based on context
        let allowedMimeTypes;
        let allowedExtensions;
        let routeDescription;
        let maxFilesForRoute;
        
        if (isEstimationUpload) {
            // Estimation: PDF only for accuracy - supports large qty and size
            allowedMimeTypes = ['application/pdf'];
            allowedExtensions = ['pdf'];
            routeDescription = 'PDF files only';
            maxFilesForRoute = 20;
        } else if (isQuoteUpload) {
            // Quotes: Extended file types for proposals
            allowedMimeTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/jpg', 
                'image/png',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain'
            ];
            allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xls', 'xlsx', 'txt'];
            routeDescription = 'PDF, DOC, DOCX, JPG, PNG, XLS, XLSX, TXT';
            maxFilesForRoute = 5;
        } else if (isJobUpload) {
            // Jobs: All supported types including DWG
            allowedMimeTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/jpg', 
                'image/png',
                'application/dwg',
                'application/acad',
                'image/vnd.dwg',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain'
            ];
            allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'dwg', 'xls', 'xlsx', 'txt'];
            routeDescription = 'PDF, DOC, DOCX, JPG, PNG, DWG, XLS, XLSX, TXT';
            maxFilesForRoute = 10;
        } else if (isProfileUpload) {
            // Profile: Documents and images
            allowedMimeTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/jpg', 
                'image/png'
            ];
            allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
            routeDescription = 'PDF, DOC, DOCX, JPG, PNG';
            maxFilesForRoute = 5;
        } else if (isMessageUpload) {
            // Messages: PDFs, documents, images, spreadsheets for invoices and project files
            allowedMimeTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/jpg',
                'image/png',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain',
                'application/zip',
                'application/x-zip-compressed'
            ];
            allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xls', 'xlsx', 'txt', 'zip'];
            routeDescription = 'PDF, DOC, DOCX, JPG, PNG, XLS, XLSX, TXT, ZIP';
            maxFilesForRoute = 20;
        } else {
            // Default: Conservative file types
            allowedMimeTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/png'
            ];
            allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'png'];
            routeDescription = 'PDF, DOC, DOCX, JPG, PNG';
            maxFilesForRoute = 10;
        }
        
        // Store max files in request for later validation
        req.maxFilesForRoute = maxFilesForRoute;
        
        // Check MIME type
        if (!allowedMimeTypes.includes(file.mimetype)) {
            console.log(`Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype} for route ${req.originalUrl}`);
            return cb(new Error(`File type not allowed for this upload. Supported formats: ${routeDescription}. Received: ${file.mimetype}`), false);
        }
        
        // Check file extension as additional validation
        const ext = file.originalname.toLowerCase().split('.').pop();
        if (!allowedExtensions.includes(ext)) {
            console.log(`Rejected file ${file.originalname}: Invalid extension .${ext} for route ${req.originalUrl}`);
            return cb(new Error(`File extension not allowed for this upload. Supported extensions: .${allowedExtensions.join(', ')}. File extension: .${ext}`), false);
        }
        
        console.log(`✅ Accepted file: ${file.originalname} (${file.mimetype}) for ${req.originalUrl}`);
        cb(null, true);
    }
});

// UPDATED: Single file upload function that uses the consistent storage utility
export async function uploadToFirebase(file, folder, userId = null) {
    try {
        console.log(`Uploading single file: ${file.originalname} to folder: ${folder}`);
        const files = [file];
        const uploadedFiles = await uploadMultipleFilesToFirebase(files, folder, userId);
        
        if (!uploadedFiles || uploadedFiles.length === 0) {
            throw new Error('No files were uploaded');
        }
        
        console.log(`✅ Single file upload successful: ${uploadedFiles[0].name}`);
        return uploadedFiles[0];
    } catch (error) {
        console.error(`❌ Single file upload failed:`, error);
        throw new Error(`Single file upload failed: ${error.message}`);
    }
}

// ENHANCED: Error handling middleware with detailed error messages
export const handleUploadError = (error, req, res, next) => {
    console.error('📤 Upload error occurred:', error);
    
    // Handle Multer-specific errors
    if (error instanceof multer.MulterError) {
        let errorMessage = 'Upload error occurred';
        let errorCode = 'UPLOAD_ERROR';
        
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                errorMessage = `File size too large. Maximum ${FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)}MB per file allowed.`;
                errorCode = 'FILE_SIZE_LIMIT';
                break;
                
            case 'LIMIT_FILE_COUNT':
                const maxFiles = req.maxFilesForRoute || FILE_UPLOAD_CONFIG.maxFiles;
                errorMessage = `Too many files. Maximum ${maxFiles} files allowed for this upload type.`;
                errorCode = 'FILE_COUNT_LIMIT';
                break;
                
            case 'LIMIT_UNEXPECTED_FILE':
                errorMessage = 'Unexpected file field in upload. Please check the form configuration.';
                errorCode = 'UNEXPECTED_FILE';
                break;
                
            case 'LIMIT_PART_COUNT':
                errorMessage = 'Too many form parts in the upload.';
                errorCode = 'TOO_MANY_PARTS';
                break;
                
            case 'LIMIT_FIELD_KEY':
                errorMessage = 'Field name too long.';
                errorCode = 'FIELD_NAME_TOO_LONG';
                break;
                
            case 'LIMIT_FIELD_VALUE':
                errorMessage = 'Field value too long.';
                errorCode = 'FIELD_VALUE_TOO_LONG';
                break;
                
            case 'LIMIT_FIELD_COUNT':
                errorMessage = 'Too many fields in the form.';
                errorCode = 'TOO_MANY_FIELDS';
                break;
                
            default:
                errorMessage = `Upload error: ${error.message}`;
                errorCode = 'MULTER_ERROR';
        }
        
        return res.status(400).json({
            success: false,
            error: errorMessage,
            errorCode: errorCode,
            details: error.field ? `Field: ${error.field}` : undefined
        });
    }
    
    // Handle file type validation errors
    if (error.message.includes('File type not allowed') || 
        error.message.includes('File extension not allowed') ||
        error.message.includes('File type could not be determined')) {
        return res.status(400).json({
            success: false,
            error: error.message,
            errorCode: 'INVALID_FILE_TYPE'
        });
    }
    
    // Handle Firebase/storage errors
    if (error.message.includes('Firebase upload failed') || 
        error.message.includes('Failed to upload') ||
        error.message.includes('upload failed') ||
        error.message.includes('Storage upload error')) {
        return res.status(500).json({
            success: false,
            error: 'File upload to cloud storage failed. Please try again.',
            errorCode: 'STORAGE_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    
    // Handle network/timeout errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        return res.status(408).json({
            success: false,
            error: 'Upload timed out. Please try again with a stable connection.',
            errorCode: 'UPLOAD_TIMEOUT'
        });
    }
    
    // Pass other errors to global error handler
    next(error);
};

// UPDATED: File requirements validation with route-specific limits
export const validateFileRequirements = (req, res, next) => {
    const files = req.files;
    
    // Determine context and limits
    const isQuoteUpload = req.originalUrl.includes('/quotes');
    const isEstimationUpload = req.originalUrl.includes('/estimation');
    const isJobUpload = req.originalUrl.includes('/jobs');
    const isProfileUpload = req.originalUrl.includes('/profile');
    
    let maxFiles;
    let uploadType;
    
    if (isEstimationUpload) {
        maxFiles = 10;
        uploadType = 'estimation';
    } else if (isQuoteUpload) {
        maxFiles = 5;
        uploadType = 'quote';
    } else if (isJobUpload) {
        maxFiles = 10;
        uploadType = 'job';
    } else if (isProfileUpload) {
        maxFiles = 5;
        uploadType = 'profile';
    } else {
        maxFiles = FILE_UPLOAD_CONFIG.maxFiles;
        uploadType = 'general';
    }
    
    console.log(`📋 Validating file requirements for ${uploadType} upload...`);
    
    // Allow no files for optional uploads (except estimations which require files)
    if (!files || files.length === 0) {
        if (isEstimationUpload) {
            return res.status(400).json({
                success: false,
                error: 'At least one PDF file is required for estimation requests.',
                errorCode: 'NO_FILES_PROVIDED'
            });
        }
        console.log('ℹ️  No files provided - continuing without files');
        return next();
    }
    
    // Check file count
    if (files.length > maxFiles) {
        console.log(`❌ Too many files: ${files.length} > ${maxFiles} for ${uploadType}`);
        return res.status(400).json({
            success: false,
            error: `Maximum ${maxFiles} files allowed for ${uploadType} uploads. You provided ${files.length} files.`,
            errorCode: 'TOO_MANY_FILES'
        });
    }
    
    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = FILE_UPLOAD_CONFIG.maxFileSize * maxFiles;
    
    if (totalSize > maxTotalSize) {
        const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
        const maxMB = (maxTotalSize / (1024 * 1024)).toFixed(0);
        console.log(`❌ Total size exceeds limit: ${totalMB}MB > ${maxMB}MB`);
        return res.status(400).json({
            success: false,
            error: `Total upload size (${totalMB}MB) exceeds maximum allowed (${maxMB}MB) for ${uploadType} uploads.`,
            errorCode: 'TOTAL_SIZE_LIMIT'
        });
    }
    
    console.log(`✅ File validation passed: ${files.length} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
    next();
};

// ENHANCED: Upload logging middleware
export const logUploadDetails = (req, res, next) => {
    if (req.files && req.files.length > 0) {
        console.log('\n=== 📤 UPLOAD DETAILS ===');
        console.log(`👤 User: ${req.user?.email || req.user?.name || 'Unknown'} (${req.user?.type || 'unknown type'})`);
        console.log(`🛣️  Route: ${req.method} ${req.originalUrl}`);
        console.log(`📁 Files: ${req.files.length}`);
        
        req.files.forEach((file, index) => {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            console.log(`   ${index + 1}. ${file.originalname}`);
            console.log(`      📏 Size: ${sizeMB}MB`);
            console.log(`      🏷️  Type: ${file.mimetype}`);
            console.log(`      📂 Field: ${file.fieldname}`);
        });
        
        console.log('========================\n');
    } else {
        console.log(`📤 No files in upload to ${req.originalUrl}`);
    }
    next();
};

// UPDATED: Comprehensive file validation with better error messages
export const validatePDFFiles = (req, res, next) => {
    const files = req.files;
    
    if (!files || files.length === 0) {
        console.log('ℹ️  No files provided for PDF validation');
        return next();
    }
    
    console.log(`📋 Validating ${files.length} files for PDF compliance...`);
    
    const isEstimationUpload = req.originalUrl.includes('/estimation');
    
    if (isEstimationUpload) {
        // Strict PDF-only validation for estimations
        for (const file of files) {
            if (file.mimetype !== 'application/pdf') {
                console.log(`❌ PDF validation failed: ${file.originalname} - MIME type: ${file.mimetype}`);
                return res.status(400).json({
                    success: false,
                    error: `File "${file.originalname}" must be a PDF. Only PDF files are accepted for estimation requests. Found: ${file.mimetype}`,
                    errorCode: 'INVALID_FILE_TYPE'
                });
            }
            
            const ext = file.originalname.toLowerCase().split('.').pop();
            if (ext !== 'pdf') {
                console.log(`❌ Extension validation failed: ${file.originalname} - extension: .${ext}`);
                return res.status(400).json({
                    success: false,
                    error: `File "${file.originalname}" must have .pdf extension. Found: .${ext}`,
                    errorCode: 'INVALID_FILE_EXTENSION'
                });
            }
        }
    } else {
        // Extended validation for jobs and quotes (already handled by fileFilter, but double-check)
        const allowedMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/dwg',
            'application/acad',
            'image/vnd.dwg',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];
        
        for (const file of files) {
            if (!allowedMimeTypes.includes(file.mimetype)) {
                console.log(`❌ File type validation failed: ${file.originalname} - MIME type: ${file.mimetype}`);
                return res.status(400).json({
                    success: false,
                    error: `File "${file.originalname}" type not supported. Supported formats: PDF, DOC, DOCX, JPG, PNG, DWG, XLS, XLSX, TXT. Found: ${file.mimetype}`,
                    errorCode: 'INVALID_FILE_TYPE'
                });
            }
        }
    }
    
    // Common size validation
    for (const file of files) {
        if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const maxMB = (FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)).toFixed(0);
            console.log(`❌ Size validation failed: ${file.originalname} - ${sizeMB}MB > ${maxMB}MB`);
            return res.status(400).json({
                success: false,
                error: `File "${file.originalname}" (${sizeMB}MB) exceeds the ${maxMB}MB size limit.`,
                errorCode: 'FILE_TOO_LARGE'
            });
        }
        
        console.log(`✅ File validated: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB, ${file.mimetype})`);
    }
    
    console.log('✅ All files passed validation');
    next();
};

// ENHANCED: Strict PDF-only validation for estimation tool
export const validatePDFFilesOnly = (req, res, next) => {
    const files = req.files;
    
    if (!files || files.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'At least one PDF file is required for estimation requests.',
            errorCode: 'NO_FILES_PROVIDED'
        });
    }
    
    console.log(`📋 Strict PDF validation for ${files.length} files...`);
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Check MIME type
        if (file.mimetype !== 'application/pdf') {
            console.log(`❌ PDF validation failed: ${file.originalname} - MIME: ${file.mimetype}`);
            return res.status(400).json({
                success: false,
                error: `File "${file.originalname}" is not a PDF. Only PDF files are allowed for estimation requests. Found: ${file.mimetype}`,
                errorCode: 'INVALID_FILE_TYPE'
            });
        }
        
        // Check extension
        const ext = file.originalname.toLowerCase().split('.').pop();
        if (ext !== 'pdf') {
            console.log(`❌ Extension validation failed: ${file.originalname} - ext: .${ext}`);
            return res.status(400).json({
                success: false,
                error: `File "${file.originalname}" must have .pdf extension. Found: .${ext}`,
                errorCode: 'INVALID_FILE_EXTENSION'
            });
        }
        
        // Check size
        if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const maxMB = (FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)).toFixed(0);
            console.log(`❌ Size validation failed: ${file.originalname} - ${sizeMB}MB > ${maxMB}MB`);
            return res.status(400).json({
                success: false,
                error: `File "${file.originalname}" (${sizeMB}MB) exceeds the ${maxMB}MB size limit.`,
                errorCode: 'FILE_TOO_LARGE'
            });
        }
        
        // Check if file has content
        if (file.size === 0) {
            console.log(`❌ Empty file detected: ${file.originalname}`);
            return res.status(400).json({
                success: false,
                error: `File "${file.originalname}" is empty. Please upload a valid PDF file.`,
                errorCode: 'EMPTY_FILE'
            });
        }
        
        console.log(`✅ PDF validated: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    }
    
    console.log('✅ All PDF files passed strict validation');
    next();
};

// NEW: Middleware to sanitize file names
export const sanitizeFileNames = (req, res, next) => {
    if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
            // Remove special characters and limit length
            const sanitized = file.originalname
                .replace(/[^a-zA-Z0-9.-]/g, '_')  // Replace special chars with underscore
                .replace(/_{2,}/g, '_')            // Replace multiple underscores with single
                .replace(/^_+|_+$/g, '')          // Remove leading/trailing underscores
                .substring(0, 100);               // Limit length
            
            // Ensure file has an extension
            if (!sanitized.includes('.')) {
                const ext = file.mimetype === 'application/pdf' ? '.pdf' : '.unknown';
                file.originalname = sanitized + ext;
            } else {
                file.originalname = sanitized;
            }
        });
    }
    next();
};

// NEW: Middleware to check storage quota (placeholder for future implementation)
export const checkStorageQuota = (req, res, next) => {
    // TODO: Implement storage quota checking based on user plan
    // For now, just log the request
    if (req.files && req.files.length > 0) {
        const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
        console.log(`📊 Storage usage check: ${(totalSize / (1024 * 1024)).toFixed(2)}MB for user ${req.user?.email || 'unknown'}`);
    }
    next();
};

// Re-export Firebase utilities for convenience
export { 
    uploadMultipleFilesToFirebase, 
    validateFileUpload, 
    deleteFileFromFirebase,
    FILE_UPLOAD_CONFIG
};

// UPDATED: Default export with all middleware functions
export default { 
    upload, 
    handleUploadError, 
    validateFileRequirements, 
    logUploadDetails, 
    validatePDFFiles,
    validatePDFFilesOnly,
    sanitizeFileNames,
    checkStorageQuota,
    uploadToFirebase,
    uploadMultipleFilesToFirebase,
    validateFileUpload,
    deleteFileFromFirebase,
    FILE_UPLOAD_CONFIG
};
