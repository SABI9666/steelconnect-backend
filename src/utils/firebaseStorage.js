// src/utils/firebaseStorage.js - Firebase Storage utility functions
import { adminStorage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload file to Firebase Storage
 * @param {Object} file - Multer file object
 * @param {string} path - Storage path (e.g., 'profiles/resumes/filename.pdf')
 * @returns {Promise<string>} - Download URL
 */
export async function uploadToFirebaseStorage(file, path) {
    try {
        if (!file || !file.buffer) {
            throw new Error('Invalid file object - no buffer found');
        }

        console.log(`Uploading file to Firebase Storage: ${path}`);
        
        // Get a reference to the storage bucket
        const bucket = adminStorage.bucket();
        
        // Create a file reference
        const fileRef = bucket.file(path);
        
        // Create a write stream
        const stream = fileRef.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    originalName: file.originalname,
                    uploadedAt: new Date().toISOString(),
                    fileId: uuidv4()
                }
            },
            resumable: false // For small files, disable resumable uploads for better performance
        });

        // Return a promise that resolves when upload is complete
        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error('Firebase Storage upload error:', error);
                reject(new Error(`Failed to upload file: ${error.message}`));
            });

            stream.on('finish', async () => {
                try {
                    // Make the file publicly readable (optional - adjust based on your security needs)
                    await fileRef.makePublic();
                    
                    // Get the download URL
                    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${path}`;
                    
                    console.log(`File uploaded successfully: ${downloadURL}`);
                    resolve(downloadURL);
                } catch (error) {
                    console.error('Error making file public or getting URL:', error);
                    reject(new Error(`Failed to get download URL: ${error.message}`));
                }
            });

            // Write the file buffer to the stream
            stream.end(file.buffer);
        });

    } catch (error) {
        console.error('Firebase Storage upload error:', error);
        throw new Error(`Failed to upload to Firebase Storage: ${error.message}`);
    }
}

/**
 * Delete file from Firebase Storage
 * @param {string} path - Storage path of the file to delete
 * @returns {Promise<void>}
 */
export async function deleteFromFirebaseStorage(path) {
    try {
        console.log(`Deleting file from Firebase Storage: ${path}`);
        
        const bucket = adminStorage.bucket();
        const file = bucket.file(path);
        
        await file.delete();
        
        console.log(`File deleted successfully: ${path}`);
    } catch (error) {
        console.error('Firebase Storage delete error:', error);
        throw new Error(`Failed to delete file: ${error.message}`);
    }
}

/**
 * Check if file exists in Firebase Storage
 * @param {string} path - Storage path of the file
 * @returns {Promise<boolean>}
 */
export async function fileExistsInStorage(path) {
    try {
        const bucket = adminStorage.bucket();
        const file = bucket.file(path);
        
        const [exists] = await file.exists();
        return exists;
    } catch (error) {
        console.error('Firebase Storage exists check error:', error);
        return false;
    }
}

/**
 * Get file metadata from Firebase Storage
 * @param {string} path - Storage path of the file
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadata(path) {
    try {
        const bucket = adminStorage.bucket();
        const file = bucket.file(path);
        
        const [metadata] = await file.getMetadata();
        return metadata;
    } catch (error) {
        console.error('Firebase Storage metadata error:', error);
        throw new Error(`Failed to get file metadata: ${error.message}`);
    }
}

/**
 * Generate a signed URL for private file access
 * @param {string} path - Storage path of the file
 * @param {number} expirationTime - Expiration time in minutes (default: 60)
 * @returns {Promise<string>} Signed URL
 */
export async function getSignedUrl(path, expirationTime = 60) {
    try {
        const bucket = adminStorage.bucket();
        const file = bucket.file(path);
        
        const options = {
            version: 'v4',
            action: 'read',
            expires: Date.now() + expirationTime * 60 * 1000, // Convert minutes to milliseconds
        };
        
        const [signedUrl] = await file.getSignedUrl(options);
        return signedUrl;
    } catch (error) {
        console.error('Firebase Storage signed URL error:', error);
        throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
}

/**
 * Upload multiple files to Firebase Storage
 * @param {Array} files - Array of multer file objects
 * @param {string} basePath - Base storage path
 * @returns {Promise<Array>} Array of upload results with URLs
 */
export async function uploadMultipleFiles(files, basePath) {
    try {
        const uploadPromises = files.map(async (file, index) => {
            const timestamp = Date.now();
            const uniqueId = uuidv4().substring(0, 8);
            const extension = file.originalname.split('.').pop();
            const fileName = `${timestamp}_${index}_${uniqueId}.${extension}`;
            const filePath = `${basePath}/${fileName}`;
            
            const downloadURL = await uploadToFirebaseStorage(file, filePath);
            
            return {
                originalName: file.originalname,
                fileName: fileName,
                path: filePath,
                url: downloadURL,
                mimetype: file.mimetype,
                size: file.size,
                uploadedAt: new Date().toISOString()
            };
        });
        
        return await Promise.all(uploadPromises);
    } catch (error) {
        console.error('Multiple file upload error:', error);
        throw new Error(`Failed to upload multiple files: ${error.message}`);
    }
}

/**
 * Validate file before upload
 * @param {Object} file - Multer file object
 * @param {Object} options - Validation options
 * @returns {boolean} True if valid
 */
export function validateFile(file, options = {}) {
    const {
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif'
        ]
    } = options;
    
    if (!file || !file.buffer) {
        throw new Error('No file provided');
    }
    
    if (file.size > maxSize) {
        throw new Error(`File size exceeds limit of ${maxSize / (1024 * 1024)}MB`);
    }
    
    if (!allowedMimes.includes(file.mimetype)) {
        throw new Error(`File type ${file.mimetype} not allowed`);
    }
    
    return true;
}