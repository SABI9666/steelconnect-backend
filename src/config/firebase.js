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

    // Validate storage bucket configuration
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!storageBucket) {
        console.error('⚠️  WARNING: FIREBASE_STORAGE_BUCKET environment variable is not set. File uploads will fail!');
    } else {
        console.log(`Firebase Storage bucket: ${storageBucket}`);
    }

    admin.initializeApp({
        credential: credential,
        storageBucket: storageBucket
    });
}

// Export Firebase services
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const storage = getStorage();

// Validate bucket is accessible at startup
try {
    const bucket = storage.bucket();
    console.log(`Firebase Storage initialized: bucket="${bucket.name}"`);
    if (!bucket.name) {
        console.error('⚠️  WARNING: Firebase Storage bucket name is empty. Set FIREBASE_STORAGE_BUCKET env var. File uploads will fail!');
    }
} catch (bucketErr) {
    console.error('⚠️  WARNING: Firebase Storage bucket initialization failed:', bucketErr.message);
}

// File upload configuration
export const FILE_UPLOAD_CONFIG = {
    maxFileSize: 50 * 1024 * 1024, // 50MB per file (supports large PDF drawings/blueprints)
    maxFiles: 20, // Maximum 20 files per upload (bulk estimation support)
    allowedMimeTypes: [
        'application/pdf',
        'application/octet-stream',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv', 'text/plain',
        'image/jpeg', 'image/png', 'image/tiff', 'image/bmp',
        'application/zip', 'application/x-rar-compressed',
        'application/acad', 'application/x-acad', 'application/x-autocad',
        'image/vnd.dwg', 'image/x-dwg'
    ],
    allowedExtensions: ['.pdf', '.dwg', '.dxf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.txt', '.rtf', '.zip', '.rar'],
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
        // Validate file object
        if (!file || !file.buffer) {
            throw new Error(`Invalid file object - missing buffer for ${file?.originalname || 'unknown'}`);
        }

        console.log(`[FIREBASE-UPLOAD] Uploading file: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB, ${file.mimetype}) to path: ${path}`);

        const bucket = storage.bucket();
        if (!bucket.name) {
            throw new Error('Firebase Storage bucket is not configured. Check FIREBASE_STORAGE_BUCKET environment variable.');
        }

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
            // Timeout protection: reject if upload takes longer than 60 seconds
            const uploadTimeout = setTimeout(() => {
                stream.destroy();
                reject(new Error(`Upload timed out for ${file.originalname} after 60 seconds`));
            }, 60000);

            stream.on('error', (error) => {
                clearTimeout(uploadTimeout);
                console.error('Firebase Storage upload error:', error);
                reject(new Error(`Failed to upload file: ${error.message}`));
            });

            stream.on('finish', () => {
                clearTimeout(uploadTimeout);
                console.log(`[FIREBASE-UPLOAD] File uploaded successfully to: ${path}`);

                // Skip signed URL generation during upload - URLs are generated
                // on-demand when files are downloaded. This avoids an extra network
                // roundtrip (exists check + getSignedUrl) that can hang or timeout.
                resolve({
                    path: path,
                    name: file.originalname,
                    originalname: file.originalname,
                    size: file.size,
                    mimetype: file.mimetype,
                    uploadedAt: new Date().toISOString(),
                    url: null // Generated on-demand via secure download endpoints
                });
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

// Helper: wrap a promise with a timeout
function withTimeout(promise, ms, label = 'Operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
    ]);
}

// NEW: Generate signed URLs for secure file access
export async function generateSignedUrl(filePath, expirationMinutes = 15, responseDisposition = 'attachment') {
    try {
        const bucket = storage.bucket();
        const file = bucket.file(filePath);

        // Generate signed URL with expiration (with 15s timeout to prevent hanging)
        const [signedUrl] = await withTimeout(
            file.getSignedUrl({
                action: 'read',
                expires: Date.now() + (expirationMinutes * 60 * 1000),
                responseDisposition: responseDisposition
            }),
            15000,
            `Signed URL generation for ${filePath}`
        );

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
    const allowedExtensions = ['pdf', 'dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'txt', 'rtf', 'zip', 'rar'];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > maxSize) {
            throw new Error(`File "${file.originalname}" size exceeds maximum allowed size of 50MB. File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        }

        // Validate by extension (browsers may send inconsistent MIME types for DWG, DXF, etc.)
        const ext = file.originalname.toLowerCase().split('.').pop();
        if (!allowedExtensions.includes(ext)) {
            throw new Error(`File "${file.originalname}" type .${ext} is not supported. Allowed: PDF, DWG, DXF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG, TIF, TXT, ZIP, RAR`);
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
