// src/config/firebase.js
// Firebase configuration compatible with all your existing code

import admin from 'firebase-admin';

let firebaseInitialized = false;
let adminDb = null;
let adminStorage = null;
let bucket = null;

try {
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
      storageBucket: 'steelconnect-backend-3f684.firebasestorage.app'
    });
    
    console.log('✅ Firebase Admin SDK initialized successfully');
    firebaseInitialized = true;
  } else {
    firebaseInitialized = true;
  }

  // Initialize services
  adminDb = admin.firestore();
  adminStorage = admin.storage();
  bucket = adminStorage.bucket(); // This is what upload middleware expects
  
  console.log('✅ Firebase services initialized: Firestore and Storage');
  
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  firebaseInitialized = false;
  
  // Create minimal mocks to prevent crashes
  adminDb = null;
  adminStorage = null;
  bucket = null;
}

// Helper function for upload middleware
export const isFirebaseEnabled = () => firebaseInitialized;

// Export the initialized services - compatible with both your server and upload middleware
export { 
  admin, 
  adminDb, 
  adminStorage,
  bucket  // This is what upload middleware needs
};

// Export status for debugging
export const firebaseStatus = {
  initialized: firebaseInitialized,
  hasFirestore: !!adminDb,
  hasStorage: !!adminStorage,
  hasBucket: !!bucket,
  projectId: firebaseInitialized ? admin.app().options.projectId : null
};
