// src/config/firebase.js - Complete configuration with secure file handling
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
    maxFileSize: 50 * 1024 * 1024, // 50MB per file (supports large PDF drawings/blueprints)
    maxFiles: 20, // Maximum 20 files per upload (bulk estimation support)
    allowedMimeTypes: ['application/pdf'], // For estimations - strict PDF only
    allowedExtensions: ['.pdf'], // For estimations - strict PDF only
    storagePath: 'uploads/',

    // Additional configs for different upload types
    quotesConfig: {
        maxFileSize: 50 * 1024 * 1024,
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
        maxFileSize: 50 * 1024 * 1024,
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

// UPDATED: Upload single file to Firebase Storage with secure access
export async function uploadToFirebaseStorage(file, path, metadata = {}) {
    try {
        console.log(`Uploading file to Firebase Storage: ${path}`);
        
        const bucket = storage.bucket();
        const fileRef = bucket.file(path);
        
        // Create upload stream with proper metadata for access control
        const stream = fileRef.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    originalName: file.originalname,
                    uploadedAt: new Date().toISOString(),
                    // Add access control metadata
                    ...metadata
                }
            },
            resumable: false
        });
        
        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error('Firebase Storage upload error:', error);
                reject(new Error(`Failed to upload file: ${error.message}`));
            });
            
            stream.on('finish', async () => {
                try {
                    console.log(`File uploaded successfully to: ${path}`);
                    
                    // Return file info for secure access (no public URL)
                    resolve({
                        path: path,
                        name: file.originalname,
                        originalname: file.originalname,
                        size: file.size,
                        mimetype: file.mimetype,
                        uploadedAt: new Date().toISOString(),
                        // Generate a temporary signed URL for immediate access if needed
                        url: await generateSignedUrl(path, 60) // 1 hour temp URL
                    });
                } catch (error) {
                    console.error('Error finishing upload:', error);
                    reject(new Error(`Failed to complete upload: ${error.message}`));
                }
            });
            
            stream.end(file.buffer);
        });
    } catch (error) {
        console.error('Firebase Storage upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }
}

// UPDATED: Upload multiple files with secure access
export async function uploadMultipleFilesToFirebase(files, folder, userId = null) {
    if (!files || !Array.isArray(files) || files.length === 0) {
        return [];
    }
    
    const uploadPromises = files.map(async (file, index) => {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${index}_${file.originalname}`;
        const fullPath = userId 
            ? `${folder}/${userId}/${fileName}`
            : `${folder}/${fileName}`;
        
        // Add metadata for access control
        const metadata = {
            uploadedBy: userId,
            fileIndex: index,
            uploadBatch: timestamp
        };
        
        return uploadToFirebaseStorage(file, fullPath, metadata);
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

// NEW: Generate signed URLs for secure file access
export async function generateSignedUrl(filePath, expirationMinutes = 15, responseDisposition = 'attachment') {
    try {
        const bucket = storage.bucket();
        const file = bucket.file(filePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        // Generate signed URL with expiration
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + (expirationMinutes * 60 * 1000),
            responseDisposition: responseDisposition
        });
        
        console.log(`Generated signed URL for ${filePath}, expires in ${expirationMinutes} minutes`);
        return signedUrl;
    } catch (error) {
        console.error('Error generating signed URL:', error);
        throw new Error(`Failed to generate download URL: ${error.message}`);
    }
}

// NEW: Validate contractor access to file
export async function validateContractorAccess(filePath, contractorEmail, contractorId) {
    try {
        const bucket = storage.bucket();
        const file = bucket.file(filePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            return false;
        }
        
        // Get file metadata
        const [metadata] = await file.getMetadata();
        const fileMetadata = metadata.metadata || {};
        
        // Check if contractor has access through metadata
        const hasMetadataAccess = 
            fileMetadata.contractorEmail === contractorEmail ||
            fileMetadata.contractorId === contractorId ||
            fileMetadata.uploadedBy === contractorId;
        
        // Check if contractor has access through file path
        const hasPathAccess = 
            filePath.includes(contractorId) ||
            filePath.includes(contractorEmail.replace('@', '_').replace('.', '_'));
        
        return hasMetadataAccess || hasPathAccess;
    } catch (error) {
        console.error('Error validating contractor access:', error);
        return false;
    }
}

// NEW: Get file metadata
export async function getFileMetadata(filePath) {
    try {
        const bucket = storage.bucket();
        const file = bucket.file(filePath);
        
        const [metadata] = await file.getMetadata();
        return {
            size: metadata.size,
            contentType: metadata.contentType,
            created: metadata.timeCreated,
            updated: metadata.updated,
            metadata: metadata.metadata || {}
        };
    } catch (error) {
        console.error('Error getting file metadata:', error);
        throw new Error(`Failed to get file metadata: ${error.message}`);
    }
}

// UPDATED: Validate file upload requirements
export function validateFileUpload(files, maxFiles = 10) {
    if (!files || files.length === 0) {
        throw new Error('No files provided');
    }
    
    if (files.length > maxFiles) {
        throw new Error(`Too many files. Maximum ${maxFiles} files allowed, received ${files.length}`);
    }
    
    const maxSize = FILE_UPLOAD_CONFIG.maxFileSize;
    const allowedTypes = FILE_UPLOAD_CONFIG.allowedMimeTypes;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (file.size > maxSize) {
            throw new Error(`File "${file.originalname}" size exceeds maximum allowed size of 15MB. File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        }
        
        if (!allowedTypes.includes(file.mimetype)) {
            throw new Error(`File "${file.originalname}" type not allowed: ${file.mimetype}. Only PDF files are allowed for estimations.`);
        }
        
        // Additional extension check
        const ext = file.originalname.toLowerCase().split('.').pop();
        if (ext !== 'pdf') {
            throw new Error(`File "${file.originalname}" must have .pdf extension. Found: .${ext}`);
        }
    }
    
    return true;
}

// UPDATED: Delete file from Firebase Storage
export async function deleteFileFromFirebase(filePath) {
    try {
        const bucket = storage.bucket();
        const file = bucket.file(filePath);
        
        // Check if file exists before trying to delete
        const [exists] = await file.exists();
        if (!exists) {
            console.log(`File already deleted or doesn't exist: ${filePath}`);
            return true;
        }
        
        await file.delete();
        console.log(`File deleted successfully: ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error deleting file from Firebase Storage:', error);
        throw new Error(`File deletion failed: ${error.message}`);
    }
}

// NEW: Batch delete files
export async function batchDeleteFiles(filePaths) {
    const deletePromises = filePaths.map(path => deleteFileFromFirebase(path));
    
    try {
        await Promise.allSettled(deletePromises);
        console.log(`Batch deletion completed for ${filePaths.length} files`);
    } catch (error) {
        console.error('Batch deletion error:', error);
        throw error;
    }
}

// NEW: Create secure download link with access validation
export async function createSecureDownloadLink(filePath, userEmail, userId, expirationMinutes = 15) {
    try {
        // First validate access
        const hasAccess = await validateContractorAccess(filePath, userEmail, userId);
        if (!hasAccess) {
            throw new Error('Access denied to this file');
        }
        
        // Generate signed URL
        const signedUrl = await generateSignedUrl(filePath, expirationMinutes);
        
        // Get file metadata for additional info
        const metadata = await getFileMetadata(filePath);
        
        return {
            downloadUrl: signedUrl,
            expiresIn: expirationMinutes * 60 * 1000,
            expiresAt: new Date(Date.now() + (expirationMinutes * 60 * 1000)).toISOString(),
            fileSize: metadata.size,
            contentType: metadata.contentType,
            filename: metadata.metadata.originalName || filePath.split('/').pop()
        };
    } catch (error) {
        console.error('Error creating secure download link:', error);
        throw error;
    }
}

export { admin };
export default admin;
