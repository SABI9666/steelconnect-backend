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
    // FIX: The Admin SDK requires the bucket name in the 'project-id.appspot.com' format.
    storageBucket: 'steelconnect-backend-3f684.firebasestorage.app'
  });
}

// Export the initialized services
const adminDb = admin.firestore();
const adminStorage = admin.storage();
const adminAuth = admin.auth(); // FIX: Export auth for use in other files

export { admin, adminDb, adminStorage, adminAuth };

