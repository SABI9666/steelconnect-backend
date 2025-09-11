// src/utils/firebaseStorage.js - Firebase Storage Upload Utility
import { adminStorage } from '../config/firebase.js';

/**
 * Upload file to Firebase Storage
 * @param {Object} file - Multer file object
 * @param {string} path - Storage path for the file
 * @returns {Promise<string>} - Public URL of uploaded file
 */
export async function uploadToFirebaseStorage(file, path) {
    try {
        console.log(`Uploading file to Firebase Storage: ${path}`);
        
        const bucket = adminStorage.bucket();
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
