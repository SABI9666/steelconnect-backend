// src/config/firebase.js - Complete configuration with all required functions
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin
if (!admin.apps.length) {
    let credential;
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
        // Production: Use Base64 encoded service account key
        try {
            const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
            const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
            const serviceAccount = JSON.parse(serviceAccountJson);
            
            credential = admin.credential.cert(serviceAccount);
            console.log('Firebase initialized with Base64 service account key');
        } catch (error) {
            console.error('Error parsing Base64 service account:', error);
            throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 format');
        }
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        // Development: Use individual environment variables
        credential = admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        });
        console.log('Firebase initialized with individual environment variables');
    } else {
        throw new Error('Firebase credentials not found. Please set either FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 or individual Firebase environment variables.');
    }

    admin.initializeApp({
        credential: credential,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
}

// Export Firebase services
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const storage = getStorage();

// File upload configuration
export const FILE_UPLOAD_CONFIG = {
    maxFileSize: 15 * 1024 * 1024, // 15MB per file
    maxFiles: 10, // Maximum 10 files per upload
    allowedMimeTypes: ['application/pdf'], // For estimations - strict PDF only
    allowedExtensions: ['.pdf'], // For estimations - strict PDF only
    storagePath: 'uploads/',
    
    // Additional configs for different upload types
    quotesConfig: {
        maxFileSize: 15 * 1024 * 1024,
        maxFiles: 5,
        allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ]
    },
    
    jobsConfig: {
        maxFileSize: 15 * 1024 * 1024,
        maxFiles: 10,
        allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'application/dwg',
            'application/acad',
            'image/vnd.dwg'
        ]
    }
};

// ADDED: Upload multiple files to Firebase Storage
export async function uploadMultipleFilesToFirebase(files, folder, userId = null) {
    if (!files || !Array.isArray(files) || files.length === 0) {
        return [];
    }
    
    const uploadPromises = files.map((file, index) => {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${index}_${file.originalname}`;
        const fullPath = userId 
            ? `${folder}/${userId}/${fileName}`
            : `${folder}/${fileName}`;
        
        return uploadToFirebaseStorage(file, fullPath);
    });
    
    try {
        const uploadedUrls = await Promise.all(uploadPromises);
        console.log(`Successfully uploaded ${uploadedUrls.length} files`);
        return uploadedUrls.map(url => ({
            name: files[uploadedUrls.indexOf(url)]?.originalname || 'Unknown File',
            originalname: files[uploadedUrls.indexOf(url)]?.originalname || 'Unknown File',
            url: url,
            downloadURL: url,
            uploadedAt: new Date().toISOString(),
            size: files[uploadedUrls.indexOf(url)]?.size || 0
        }));
    } catch (error) {
        console.error('Multiple file upload error:', error);
        throw new Error(`Failed to upload multiple files: ${error.message}`);
    }
}

// ADDED: Upload single file to Firebase Storage
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

// ADDED: Validate file upload requirements
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

// ADDED: Delete file from Firebase Storage
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

export { admin };
export default admin;
