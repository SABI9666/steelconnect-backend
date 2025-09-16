// src/config/firebase.js - Clean configuration with Base64 service account support
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

export { admin };
export default admin;
