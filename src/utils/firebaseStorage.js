// src/utils/firebaseStorage.js - FIXED Firebase Storage Upload Utility
import { storage } from '../config/firebase.js'; // Fixed: Changed from adminStorage to storage

/**
 * Upload file to Firebase Storage
 * @param {Object} file - Multer file object
 * @param {string} path - Storage path for the file
 * @returns {Promise<Object>} - File object with public URL and metadata
 */
export async function uploadToFirebaseStorage(file, path) {
    try {
        console.log(`Uploading file to Firebase Storage: ${path}`);
        
        if (!file || !file.buffer) {
            throw new Error('Invalid file object - missing buffer');
        }
        
        if (!file.mimetype) {
            console.warn(`File ${file.originalname || 'unknown'} missing MIME type, attempting to detect...`);
            // Try to detect MIME type from extension
            const ext = (file.originalname || '').toLowerCase().split('.').pop();
            const mimeMap = {
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'txt': 'text/plain',
                'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            };
            file.mimetype = mimeMap[ext] || 'application/octet-stream';
            console.log(`Detected MIME type: ${file.mimetype} for extension: ${ext}`);
        }
        
        const bucket = storage.bucket();
        const fileRef = bucket.file(path);
        
        // Create upload stream with proper metadata
        const stream = fileRef.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    originalName: file.originalname || 'unknown',
                    uploadedAt: new Date().toISOString(),
                    fileSize: file.size?.toString() || '0'
                }
            },
            resumable: false // For smaller files, disable resumable uploads
        });
        
        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error('Firebase Storage upload error:', error);
                reject(new Error(`Failed to upload file: ${error.message}`));
            });
            
            stream.on('finish', async () => {
                try {
                    // Make file publicly accessible
                    await fileRef.makePublic();
                    
                    // Generate public URL
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
                    
                    // FIXED: Return consistent object structure
                    const fileData = {
                        name: file.originalname || 'unknown',
                        originalname: file.originalname || 'unknown',
                        url: publicUrl,
                        downloadURL: publicUrl, // For compatibility
                        size: file.size || 0,
                        mimetype: file.mimetype,
                        type: file.mimetype,
                        path: path,
                        filename: path,
                        uploadedAt: new Date().toISOString()
                    };
                    
                    console.log(`File uploaded successfully: ${publicUrl}`);
                    resolve(fileData);
                } catch (error) {
                    console.error('Error making file public:', error);
                    reject(new Error(`Failed to make file public: ${error.message}`));
                }
            });
            
            // Write file buffer to stream
            stream.end(file.buffer);
        });
    } catch (error) {
        console.error('Firebase Storage upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }
}

/**
 * Upload multiple files to Firebase Storage
 * @param {Array} files - Array of multer file objects
 * @param {string} basePath - Base storage path
 * @param {string} userId - Optional user ID for path organization
 * @returns {Promise<Array>} - Array of file objects with public URLs
 */
export async function uploadMultipleFilesToFirebase(files, basePath, userId = null) {
    if (!files || !Array.isArray(files) || files.length === 0) {
        console.log('No files provided for upload');
        return [];
    }
    
    console.log(`Starting upload of ${files.length} files to ${basePath}`);
    
    const uploadPromises = files.map(async (file, index) => {
        try {
            // FIXED: Better file naming with timestamp and sanitization
            const timestamp = Date.now();
            const sanitizedName = (file.originalname || `file_${index}`)
                .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
                .replace(/_{2,}/g, '_'); // Replace multiple underscores with single
            
            const fileName = `${timestamp}_${index}_${sanitizedName}`;
            const fullPath = userId 
                ? `${basePath}/${userId}/${fileName}`
                : `${basePath}/${fileName}`;
            
            console.log(`Uploading file ${index + 1}/${files.length}: ${file.originalname} -> ${fullPath}`);
            
            return await uploadToFirebaseStorage(file, fullPath);
        } catch (error) {
            console.error(`Failed to upload file ${file.originalname || 'unknown'}:`, error);
            throw new Error(`Failed to upload file ${file.originalname || 'unknown'}: ${error.message}`);
        }
    });
    
    try {
        const uploadedFiles = await Promise.all(uploadPromises);
        console.log(`Successfully uploaded ${uploadedFiles.length} files`);
        return uploadedFiles;
    } catch (error) {
        console.error('Multiple file upload error:', error);
        throw new Error(`Failed to upload multiple files: ${error.message}`);
    }
}

/**
 * FIXED: Enhanced file validation
 * @param {Object|Array} files - Multer file object(s)
 * @param {number} maxFiles - Maximum number of files allowed
 * @returns {boolean} - Returns true if valid, throws error if invalid
 */
export function validateFileUpload(files, maxFiles = 20) {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedMimeTypes = [
        'application/pdf',
        'application/octet-stream',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/tiff',
        'image/bmp',
        'text/plain',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
        'application/x-rar-compressed',
        'application/x-zip-compressed',
        'application/acad',
        'application/x-acad',
        'application/x-autocad',
        'image/vnd.dwg',
        'image/x-dwg'
    ];
    const allowedExtensions = ['pdf', 'dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'txt', 'rtf', 'zip', 'rar'];

    // Handle single file or array of files
    const fileArray = Array.isArray(files) ? files : [files];

    if (fileArray.length > maxFiles) {
        throw new Error(`Too many files. Maximum ${maxFiles} files allowed, but ${fileArray.length} were provided.`);
    }

    for (const file of fileArray) {
        if (!file) {
            throw new Error('Invalid file object provided');
        }

        if (file.size > maxSize) {
            throw new Error(`File size exceeds maximum allowed size of 50MB. File "${file.originalname || 'unknown'}" size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        }

        // Handle missing MIME type - detect from extension
        if (!file.mimetype) {
            const ext = (file.originalname || '').toLowerCase().split('.').pop();
            const mimeMap = {
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'tif': 'image/tiff',
                'tiff': 'image/tiff',
                'bmp': 'image/bmp',
                'txt': 'text/plain',
                'csv': 'text/csv',
                'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'dwg': 'application/octet-stream',
                'dxf': 'application/octet-stream',
                'zip': 'application/zip',
                'rar': 'application/x-rar-compressed',
                'rtf': 'text/plain'
            };

            if (mimeMap[ext]) {
                file.mimetype = mimeMap[ext];
                console.log(`Auto-detected MIME type: ${file.mimetype} for file: ${file.originalname}`);
            } else {
                throw new Error(`Could not determine file type for "${file.originalname}". Please ensure the file has a valid extension.`);
            }
        }

        // Validate by extension first (more reliable than MIME type for construction files)
        const ext = (file.originalname || '').toLowerCase().split('.').pop();
        if (allowedExtensions.includes(ext)) {
            // Extension is valid - allow even if MIME type is unusual
            // (browsers often send wrong MIME types for DWG, DXF, etc.)
            if (!allowedMimeTypes.includes(file.mimetype)) {
                console.warn(`[VALIDATE] Unusual MIME type ${file.mimetype} for .${ext} file "${file.originalname}" - allowing based on extension`);
            }
        } else if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new Error(`File type not allowed for "${file.originalname}". Supported: PDF, DWG, DXF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG, TIF, TXT, ZIP, RAR`);
        }
    }

    console.log(`File validation passed for ${fileArray.length} file(s)`);
    return true;
}

/**
 * Delete file from Firebase Storage
 * @param {string} filePath - Full path to the file in storage
 * @returns {Promise<boolean>} - Returns true if deleted successfully
 */
export async function deleteFileFromFirebase(filePath) {
    try {
        if (!filePath) {
            throw new Error('File path is required for deletion');
        }
        
        const bucket = storage.bucket();
        await bucket.file(filePath).delete();
        console.log(`File deleted successfully: ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error deleting file from Firebase Storage:', error);
        throw new Error(`File deletion failed: ${error.message}`);
    }
}

/**
 * ADDED: Get signed download URL for a file
 * @param {string} filePath - Full path to the file in storage  
 * @returns {Promise<string>} - Signed download URL
 */
export async function getSignedDownloadUrl(filePath) {
    try {
        if (!filePath) {
            throw new Error('File path is required');
        }
        
        const bucket = storage.bucket();
        const file = bucket.file(filePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            throw new Error('File does not exist');
        }
        
        // Generate signed URL valid for 1 hour
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });
        
        return signedUrl;
    } catch (error) {
        console.error('Error generating signed URL:', error);
        throw new Error(`Failed to generate download URL: ${error.message}`);
    }
}
