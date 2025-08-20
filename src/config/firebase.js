// src/config/firebase.js
// Enhanced Firebase configuration with proper error handling

import admin from 'firebase-admin';

let adminDb = null;
let bucket = null;
let firebaseInitialized = false;

try {
  // Check for the required environment variable
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
    console.log('⚠️ FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set. Firebase will be disabled.');
    throw new Error('Firebase service account key not configured');
  }

  // Decode the Base64 service account key from environment variables
  const serviceAccountJson = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
    'base64'
  ).toString('utf8');
  
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  // Validate service account structure
  if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
    throw new Error('Invalid Firebase service account configuration');
  }

  // Initialize Firebase Admin SDK if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'steelconnect-backend-3f684.firebasestorage.app'
    });
    
    console.log('✅ Firebase Admin SDK initialized successfully');
    firebaseInitialized = true;
  }

  // Initialize services
  adminDb = admin.firestore();
  bucket = admin.storage().bucket();
  
  console.log('✅ Firebase services initialized: Firestore and Storage');

} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.log('🔄 Running without Firebase functionality');
  
  // Create mock services to prevent app crashes
  adminDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false }),
        set: async () => console.log('Mock Firestore operation'),
        update: async () => console.log('Mock Firestore operation'),
        delete: async () => console.log('Mock Firestore operation')
      }),
      add: async () => console.log('Mock Firestore operation'),
      get: async () => ({ docs: [] })
    })
  };
  
  bucket = {
    file: () => ({
      save: async () => console.log('Mock Storage operation'),
      delete: async () => console.log('Mock Storage operation'),
      getSignedUrl: async () => ['mock-url']
    }),
    upload: async () => console.log('Mock Storage operation')
  };
}

// Helper functions
export const isFirebaseEnabled = () => firebaseInitialized;

export const getFirebaseAdmin = () => {
  if (!firebaseInitialized) {
    throw new Error('Firebase is not initialized. Check your configuration.');
  }
  return admin;
};

// Safe operations that won't crash if Firebase is disabled
export const safeFirestoreOperation = async (operation) => {
  try {
    if (!firebaseInitialized) {
      console.log('⚠️ Firebase not available, skipping Firestore operation');
      return null;
    }
    return await operation(adminDb);
  } catch (error) {
    console.error('Firestore operation failed:', error.message);
    return null;
  }
};

export const safeStorageOperation = async (operation) => {
  try {
    if (!firebaseInitialized) {
      console.log('⚠️ Firebase not available, skipping Storage operation');
      return null;
    }
    return await operation(bucket);
  } catch (error) {
    console.error('Storage operation failed:', error.message);
    return null;
  }
};

// Export the initialized services (or mocks)
export { admin, adminDb, bucket };

// Export a status object for debugging
export const firebaseStatus = {
  initialized: firebaseInitialized,
  hasFirestore: !!adminDb,
  hasStorage: !!bucket,
  projectId: firebaseInitialized ? admin.app().options.projectId : null
};
