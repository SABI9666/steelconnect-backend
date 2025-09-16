// src/utils/firebaseStorage.js - Firebase Storage Upload Utility
import { storage } from '../config/firebase.js'; // Fixed: Changed from adminStorage to storage

/**
 * Upload file to Firebase Storage
 * @param {Object} file - Multer file object
 * @param {string} path - Storage path for the file
 * @returns {Promise<string>} - Public URL of uploaded file
 */
export async function uploadToFirebaseStorage(file, path) {
    try {
        console.log(`Uploading file to Firebase Storage: ${path}`);
        
        const bucket = storage.bucket();
        const fileRef = bucket.file(path);
        
        // Create upload stream
        const stream = fileRef.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    originalName: file.originalname,
                    uploadedAt: new Date().toISOString()
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
                    
                    console.log(`File uploaded successfully: ${publicUrl}`);
                    resolve(publicUrl);
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
 * @returns {Promise<Array>} - Array of public URLs
 */
export async function uploadMultipleFilesToFirebase(files, basePath, userId = null) {
    if (!files || !Array.isArray(files) || files.length === 0) {
        return [];
    }
    
    const uploadPromises = files.map((file, index) => {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${index}_${file.originalname}`;
        const fullPath = userId 
            ? `${basePath}/${userId}/${fileName}`
            : `${basePath}/${fileName}`;
        
        return uploadToFirebaseStorage(file, fullPath);
    });
    
    try {
        const uploadedUrls = await Promise.all(uploadPromises);
        console.log(`Successfully uploaded ${uploadedUrls.length} files`);
        return uploadedUrls;
    } catch (error) {
        console.error('Multiple file upload error:', error);
        throw new Error(`Failed to upload multiple files: ${error.message}`);
    }
}

/**
 * Validate file upload requirements
 * @param {Object} file - Multer file object
 * @returns {boolean} - Returns true if valid, throws error if invalid
 */
export function validateFileUpload(file) {
    const maxSize = 15 * 1024 * 1024; // 15MB
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'text/plain'
    ];
    
    if (file.size > maxSize) {
        throw new Error(`File size exceeds maximum allowed size of 15MB. File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
        throw new Error(`File type not allowed: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    return true;
}

/**
 * Delete file from Firebase Storage
 * @param {string} filePath - Full path to the file in storage
 * @returns {Promise<boolean>} - Returns true if deleted successfully
 */
export async function deleteFileFromFirebase(filePath) {
    try {
        const bucket = storage.bucket();
        await bucket.file(filePath).delete();
        console.log(`File deleted successfully: ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error deleting file from Firebase Storage:', error);
        throw new Error(`File deletion failed: ${error.message}`);
    }
}
