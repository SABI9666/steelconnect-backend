import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Load environment variables from your .env file
dotenv.config();

// Securely parse the service account key from environment variables
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

// Initialize the Firebase Admin App only if it hasn't been already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Initialize the Firestore database instance
const adminDb = admin.firestore();

// Export the database instance for other files to use
export { adminDb };