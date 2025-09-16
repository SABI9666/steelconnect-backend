// src/config/firebase.js - Clean configuration without circular imports
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
}

// Export Firebase services
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const storage = getStorage(); // Changed from adminStorage to storage for consistency

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

export default admin;
