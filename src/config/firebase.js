import admin from 'firebase-admin';

// Check for the required environment variable
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
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
    // CORRECTED: Use the .appspot.com URL for the storage bucket name
    storageBucket: 'steelconnect-backend-3f684.firebasestorage.app'
  });
}

// Export the initialized services
const adminDb = admin.firestore();
// CREATED: Get the default bucket instance from storage
const bucket = admin.storage().bucket();

// EXPORTED: Added 'bucket' to the export list
export { admin, adminDb, bucket };
