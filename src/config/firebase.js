import admin from 'firebase-admin';

let adminDb;
let adminStorage;

// Get the secret key from environment variables
const serviceAccountKeyBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;

// We must check if the key exists BEFORE trying to use it
if (!serviceAccountKeyBase64) {
  // This log will appear if the environment variable is missing
  console.error('🔴 FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 environment variable is not set.');

} else {
  try {
    // Decode the key
    const serviceAccountJson = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(serviceAccountJson);

    // Initialize the app ONLY if it's not already been initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // CORRECTED: Use the standard .appspot.com address for the bucket
        storageBucket: 'steelconnect-backend-3f684.firebasestorage.app',
        // ADDED: Explicitly set the database URL for a stable connection
        databaseURL: 'https://steelconnect-backend-3f684.firebaseio.com'
      });
      // This is the message you WANT to see in your logs
      console.log('✅ Firebase Admin SDK initialized successfully.');
    }

    // Assign the services to our exports
    adminDb = admin.firestore();
    adminStorage = admin.storage();

  } catch (error) {
    // This log will appear if the key is invalid or malformed
    console.error('🔴 FATAL ERROR: Failed to initialize Firebase Admin SDK. Check your service account key.', error.message);
  }
}

// Export the services for other files (like auth.js and admin.js) to use
export { admin, adminDb, adminStorage };
