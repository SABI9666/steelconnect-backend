// config/firebase.js (Update this file)
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
// import { getAuth } from 'firebase-admin/auth'; // Only if you plan server-side Firebase Auth

// Ensure dotenv.config() is called at the very top of server.js
// so these process.env variables are available here.

let firebaseAdminApp;
let db;
let adminStorage;
// let adminAuth;

try {
  if (!getApps().length) { // Check if app is already initialized
    // Decode the base64 service account key from environment variable
    const serviceAccountKey = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8')
    );

    firebaseAdminApp = initializeApp({
      credential: cert(serviceAccountKey),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
  } else {
    firebaseAdminApp = getApp(); // If already initialized, get the existing app
  }

  db = getFirestore(firebaseAdminApp);
  adminStorage = getStorage(firebaseAdminApp);
  // adminAuth = getAuth(firebaseAdminApp);

} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  // Depending on your error handling strategy, you might want to exit or log more verbosely.
}


export { db, firebaseAdminApp, adminStorage /*, adminAuth */ };
