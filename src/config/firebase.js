import admin from 'firebase-admin';

// This should be your project ID from your Firebase project settings
const projectId = process.env.FIREBASE_PROJECT_ID; 

// Check for the required environment variables
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
}
if (!projectId) {
   throw new Error('FIREBASE_PROJECT_ID is not set in environment variables.');
}

// Decode the Base64 service account key from environment variables
const serviceAccountJson = Buffer.from(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
  'base64'
).toString('utf8');

const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${projectId}.appspot.com` // Important for Firebase Storage
  });
}

// Export the initialized services
const adminDb = admin.firestore();
const adminStorage = admin.storage();

export { admin, adminDb, adminStorage };