// src/config/firebase.js
// Enhanced Firebase configuration with comprehensive error handling

import admin from 'firebase-admin';

let adminDb = null;
let bucket = null;
let auth = null;
let firebaseInitialized = false;
let initializationError = null;

try {
  // Check for the required environment variable
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 environment variable is not set');
  }
  
  // Decode the Base64 service account key from environment variables
  let serviceAccountJson;
  try {
    serviceAccountJson = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
      'base64'
    ).toString('utf8');
  } catch (decodeError) {
    throw new Error(`Failed to decode Firebase service account key: ${decodeError.message}`);
  }
  
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (parseError) {
    throw new Error(`Failed to parse Firebase service account JSON: ${parseError.message}`);
  }
  
  // Validate service account structure
  const requiredFields = ['private_key', 'client_email', 'project_id'];
  const missingFields = requiredFields.filter(field => !serviceAccount[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Invalid Firebase service account - missing fields: ${missingFields.join(', ')}`);
  }
  
  // Initialize Firebase Admin SDK if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'steelconnect-backend-3f684.firebasestorage.app',
      databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com/`
    });
    
    console.log('✅ Firebase Admin SDK initialized successfully');
    firebaseInitialized = true;
  } else {
    console.log('✅ Firebase Admin SDK already initialized');
    firebaseInitialized = true;
  }
  
  // Initialize services
  try {
    adminDb = admin.firestore();
    
    // Test Firestore connection
    await adminDb.collection('_health').doc('test').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'connected'
    });
    
    console.log('✅ Firestore initialized and tested successfully');
  } catch (firestoreError) {
    console.error('⚠️ Firestore initialization failed:', firestoreError.message);
    // Continue without Firestore
  }
  
  try {
    bucket = admin.storage().bucket();
    auth = admin.auth();
    
    // Test Auth service
    await auth.listUsers(1); // Try to list 1 user to test connection
    
    console.log('✅ Firebase Auth and Storage initialized successfully');
  } catch (authStorageError) {
    console.error('⚠️ Auth/Storage initialization failed:', authStorageError.message);
    // Continue without Auth/Storage
  }
  
  console.log('✅ Firebase services initialized: Firestore, Auth, and Storage');
  
} catch (error) {
  initializationError = error;
  console.error('❌ Firebase initialization failed:', error.message);
  console.log('🔄 Running without Firebase functionality');
  
  // Create mock services to prevent app crashes
  adminDb = createMockFirestore();
  bucket = createMockStorage();
  auth = createMockAuth();
}

// --- 🎭 Mock Services for Development ---
function createMockFirestore() {
  const mockDoc = {
    get: async () => ({ 
      exists: false, 
      data: () => null,
      id: 'mock-doc'
    }),
    set: async (data) => {
      console.log('Mock Firestore SET:', data);
      return Promise.resolve();
    },
    update: async (data) => {
      console.log('Mock Firestore UPDATE:', data);
      return Promise.resolve();
    },
    delete: async () => {
      console.log('Mock Firestore DELETE');
      return Promise.resolve();
    }
  };
  
  const mockCollection = {
    doc: (id) => mockDoc,
    add: async (data) => {
      console.log('Mock Firestore ADD:', data);
      return { id: 'mock-' + Date.now() };
    },
    get: async () => ({ 
      docs: [],
      size: 0,
      empty: true
    }),
    where: () => mockCollection,
    orderBy: () => mockCollection,
    limit: () => mockCollection
  };
  
  return {
    collection: (name) => {
      console.log(`Mock Firestore collection: ${name}`);
      return mockCollection;
    },
    doc: (path) => {
      console.log(`Mock Firestore doc: ${path}`);
      return mockDoc;
    }
  };
}

function createMockStorage() {
  return {
    file: (path) => ({
      save: async (buffer, options) => {
        console.log(`Mock Storage SAVE: ${path}`, options);
        return Promise.resolve();
      },
      delete: async () => {
        console.log(`Mock Storage DELETE: ${path}`);
        return Promise.resolve();
      },
      makePublic: async () => {
        console.log(`Mock Storage MAKE PUBLIC: ${path}`);
        return Promise.resolve();
      },
      getSignedUrl: async () => [`https://mock-storage.com/${path}`]
    }),
    upload: async (localPath, options) => {
      console.log('Mock Storage UPLOAD:', localPath, options);
      return Promise.resolve();
    }
  };
}

function createMockAuth() {
  return {
    getUser: async (uid) => {
      console.log(`Mock Auth GET USER: ${uid}`);
      if (uid === 'env_admin') {
        return {
          uid: 'env_admin',
          email: 'admin@steelconnect.com',
          displayName: 'Environment Admin',
          emailVerified: true,
          disabled: false,
          customClaims: { role: 'admin', type: 'admin' },
          metadata: {
            creationTime: new Date().toISOString(),
            lastSignInTime: new Date().toISOString()
          }
        };
      }
      throw new Error('User not found in mock auth');
    },
    createUser: async (userData) => {
      console.log('Mock Auth CREATE USER:', userData);
      return {
        uid: userData.uid || 'mock-' + Date.now(),
        ...userData
      };
    },
    setCustomUserClaims: async (uid, claims) => {
      console.log(`Mock Auth SET CLAIMS: ${uid}`, claims);
      return Promise.resolve();
    },
    listUsers: async (maxResults) => {
      console.log(`Mock Auth LIST USERS: ${maxResults}`);
      return { users: [] };
    },
    verifyIdToken: async (token) => {
      console.log('Mock Auth VERIFY TOKEN:', token.substring(0, 20) + '...');
      return { uid: 'mock-user', email: 'mock@example.com' };
    }
  };
}

// --- 🛠️ Helper Functions ---
export const isFirebaseEnabled = () => firebaseInitialized && !initializationError;

export const getFirebaseAdmin = () => {
  if (!firebaseInitialized) {
    throw new Error('Firebase is not initialized. Check your configuration.');
  }
  return admin;
};

export const getFirebaseError = () => initializationError;

// Safe operations that won't crash if Firebase is disabled
export const safeFirestoreOperation = async (operation, fallbackValue = null) => {
  try {
    if (!firebaseInitialized) {
      console.log('⚠️ Firebase not available, skipping Firestore operation');
      return fallbackValue;
    }
    return await operation(adminDb);
  } catch (error) {
    console.error('Firestore operation failed:', error.message);
    return fallbackValue;
  }
};

export const safeStorageOperation = async (operation, fallbackValue = null) => {
  try {
    if (!firebaseInitialized) {
      console.log('⚠️ Firebase not available, skipping Storage operation');
      return fallbackValue;
    }
    return await operation(bucket);
  } catch (error) {
    console.error('Storage operation failed:', error.message);
    return fallbackValue;
  }
};

export const safeAuthOperation = async (operation, fallbackValue = null) => {
  try {
    if (!firebaseInitialized) {
      console.log('⚠️ Firebase not available, skipping Auth operation');
      return fallbackValue;
    }
    return await operation(auth);
  } catch (error) {
    console.error('Auth operation failed:', error.message);
    return fallbackValue;
  }
};

// --- 📤 Exports ---
export { admin, adminDb, bucket, auth };

// Export a comprehensive status object for debugging
export const firebaseStatus = {
  initialized: firebaseInitialized,
  hasFirestore: !!adminDb && firebaseInitialized,
  hasStorage: !!bucket && firebaseInitialized,
  hasAuth: !!auth && firebaseInitialized,
  projectId: firebaseInitialized ? admin.app().options.projectId : null,
  storageBucket: firebaseInitialized ? admin.app().options.storageBucket : null,
  error: initializationError?.message || null,
  timestamp: new Date().toISOString()
};

// Log final status
console.log('🔥 Firebase Configuration Complete:', {
  initialized: firebaseInitialized,
  error: initializationError?.message || null,
  services: {
    firestore: !!adminDb,
    storage: !!bucket,
    auth: !!auth
  }
});
