import admin from 'firebase-admin';

console.log('🔥 Initializing Firebase Admin SDK...');

// Check for the required environment variable
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
}

try {
  // Decode the Base64 service account key from environment variables
  const serviceAccountJson = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
    'base64'
  ).toString('utf8');
  
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  // Validate service account has required fields
  if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('Invalid service account key - missing required fields');
  }
  
  console.log(`🔥 Service account loaded for project: ${serviceAccount.project_id}`);
  
  // Initialize Firebase Admin SDK if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Use the correct storage bucket format
      storageBucket: `${serviceAccount.project_id}.appspot.com`
    });
    console.log('✅ Firebase Admin SDK initialized successfully');
  } else {
    console.log('ℹ️ Firebase Admin SDK already initialized');
  }
  
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  throw error;
}

// Export the initialized services
const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage();

console.log('✅ Firebase services exported successfully');

export { admin, adminDb, adminAuth, adminStorage };
