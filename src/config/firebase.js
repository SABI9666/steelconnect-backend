import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Check for the required environment variable for the service account key
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
}

// Decode the Base64 service account key
const serviceAccountJson = Buffer.from(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
  'base64'
).toString('utf8');

const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Use the storage bucket from your .env file for better configuration
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET 
  });
}

// Export the initialized services
const adminDb = admin.firestore();
const adminStorage = admin.storage();

export { admin, adminDb, adminStorage };