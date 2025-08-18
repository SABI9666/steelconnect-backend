import admin from 'firebase-admin';

let adminDb;
const serviceAccountKeyBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;

if (!serviceAccountKeyBase64) {
  console.error('🔴 FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 environment variable is not set.');
} else {
  try {
    const serviceAccountJson = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(serviceAccountJson);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'steelconnect-backend-3f684.firebasestorage.app',
        databaseURL: 'https://steelconnect-backend-3f684.firebaseio.com'
      });
      console.log('✅ Firebase Admin SDK initialized successfully.');
    }
    adminDb = admin.firestore();
  } catch (error) {
    console.error('🔴 FATAL ERROR: Failed to initialize Firebase Admin SDK.', error.message);
  }
}
export { adminDb };
