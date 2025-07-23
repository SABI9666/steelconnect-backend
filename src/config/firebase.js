import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Load environment variables from your .env file
dotenv.config();

// --- START: UPDATED CREDENTIAL HANDLING ---
// Read the Base64 encoded key from the new environment variable
const firebaseKeyBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;

// Decode the Base64 string back into a normal JSON string
const serviceAccountJson = Buffer.from(firebaseKeyBase64, 'base64').toString('utf-8');

// Parse the decoded JSON string
const serviceAccount = JSON.parse(serviceAccountJson);
// --- END: UPDATED CREDENTIAL HANDLING ---


// Initialize the Firebase Admin App only if it hasn't been already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

// Initialize and export the services
const adminDb = admin.firestore();
const adminStorage = admin.storage();

export { adminDb, adminStorage };