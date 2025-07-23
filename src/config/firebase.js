import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Load environment variables from your .env file
dotenv.config();

// Securely parse the service account key from environment variables
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

// Initialize the Firebase Admin App only if it hasn't been already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET // Add your storage bucket URL here
  });
}

// Initialize the Firestore database instance
const adminDb = admin.firestore();

// --- START: NEWLY ADDED ---
// Initialize the Firebase Storage instance
const adminStorage = admin.storage();
// --- END: NEWLY ADDED ---


// --- START: UPDATED EXPORTS ---
// Export both the database and storage instances for other files to use
export { adminDb, adminStorage };
// --- END: UPDATED EXPORTS ---