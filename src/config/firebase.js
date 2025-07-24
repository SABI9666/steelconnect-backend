// src/config/firebase.js

import admin from 'firebase-admin';

// Check if the environment variable for the Firebase key exists.
// This is the key you set on Render.
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  throw new Error('The Firebase service account key is not set in your environment variables. Please add FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 to your environment.');
}

// Decode the Base64 encoded service account key.
const serviceAccountJson = Buffer.from(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
  'base64'
).toString('utf8');

// Parse the decoded JSON string into a JavaScript object.
const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize the Firebase Admin SDK, but only if it hasn't been initialized already.
// This prevents errors during hot-reloading in development.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Export the Firestore database instance so other files can use it.
const adminDb = admin.firestore();

export { adminDb };