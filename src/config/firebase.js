import admin from 'firebase-admin';

// Check for the required environment variable
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
  console.warn('⚠️  Firebase will not be available. Consider setting up Firebase or using mock database.');
}

let adminDb, adminStorage;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
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
    }

    // Export the initialized services
    adminDb = admin.firestore();
    adminStorage = admin.storage();
    
    console.log('✅ Firebase Admin SDK initialized successfully');
  } else {
    throw new Error('Firebase configuration not available');
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  
  // Create a mock database for development if Firebase fails
  console.log('⚠️  Creating mock database for development...');
  
  class MockCollection {
    constructor(name) {
      this.name = name;
      this.data = new Map();
    }
    
    async add(data) {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      this.data.set(id, { ...data, id });
      return { id };
    }
    
    where(field, operator, value) {
      return {
        get: async () => {
          const results = [];
          for (const [id, doc] of this.data.entries()) {
            if (operator === '==' && doc[field] === value) {
              results.push({
                id,
                data: () => doc,
                exists: true
              });
            }
          }
          return { 
            empty: results.length === 0,
            docs: results,
            size: results.length
          };
        },
        limit: (num) => {
          return {
            get: async () => {
              const results = [];
              let count = 0;
              for (const [id, doc] of this.data.entries()) {
                if (count >= num) break;
                if (operator === '==' && doc[field] === value) {
                  results.push({
                    id,
                    data: () => doc,
                    exists: true,
                    ref: {
                      update: async (updateData) => {
                        this.data.set(id, { ...doc, ...updateData });
                      }
                    }
                  });
                  count++;
                }
              }
              return { 
                empty: results.length === 0,
                docs: results,
                size: results.length
              };
            }
          };
        }
      };
    }
    
    doc(id) {
      return {
        get: async () => {
          const data = this.data.get(id);
          return {
            exists: !!data,
            id,
            data: () => data
          };
        },
        update: async (updateData) => {
          const existing = this.data.get(id);
          if (existing) {
            this.data.set(id, { ...existing, ...updateData });
          }
        }
      };
    }
  }
  
  class MockDb {
    constructor() {
      this.collections = new Map();
    }
    
    collection(name) {
      if (!this.collections.has(name)) {
        this.collections.set(name, new MockCollection(name));
      }
      return this.collections.get(name);
    }
  }
  
  adminDb = new MockDb();
  adminStorage = null;
  console.log('✅ Mock database created for development');
}

export { admin, adminDb, adminStorage };