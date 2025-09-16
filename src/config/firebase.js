// firebase.js - Updated with enhanced file upload configuration
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
    storageBucket: 'steelconnect-backend-3f684.firebasestorage.app'
  });
}

// Enhanced file upload configuration
export const FILE_UPLOAD_CONFIG = {
  maxFiles: 10,
  maxFileSize: 15 * 1024 * 1024, // 15MB in bytes
  allowedMimeTypes: ['application/pdf'],
  allowedExtensions: ['.pdf'],
  uploadPaths: {
    jobs: 'job-attachments',
    estimations: 'estimation-files',
    results: 'estimation-results',
    profiles: 'profile-documents'
  }
};

// Enhanced file upload utility
export async function uploadMultipleFilesToFirebase(files, folder, userId = null) {
  const uploadedFiles = [];
  const bucket = adminStorage.bucket();
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Validate file
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(`File ${file.originalname}: Only PDF files are allowed`);
    }
    
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(`File ${file.originalname}: File size (${sizeMB}MB) exceeds 15MB limit`);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.round(Math.random() * 1E9);
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const userPath = userId ? `${userId}/` : '';
    const filename = `${folder}/${userPath}${timestamp}-${randomId}-${safeFileName}`;
    
    try {
      const fileRef = bucket.file(filename);
      
      const stream = fileRef.createWriteStream({
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userId || 'unknown',
            fileSize: file.size.toString()
          }
        }
      });
      
      const uploadPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', async () => {
          try {
            await fileRef.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            
            resolve({
              filename: filename,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              url: publicUrl,
              uploadedAt: new Date().toISOString(),
              path: filename
            });
          } catch (error) {
            reject(error);
          }
        });
        stream.end(file.buffer);
      });
      
      const uploadedFile = await uploadPromise;
      uploadedFiles.push(uploadedFile);
      
      console.log(`✅ File uploaded (${i + 1}/${files.length}): ${file.originalname}`);
      
    } catch (uploadError) {
      console.error(`❌ Failed to upload ${file.originalname}:`, uploadError);
      throw new Error(`Failed to upload ${file.originalname}: ${uploadError.message}`);
    }
  }
  
  return uploadedFiles;
}

// Utility to delete file from Firebase Storage
export async function deleteFileFromFirebase(filePath) {
  try {
    const bucket = adminStorage.bucket();
    const file = bucket.file(filePath);
    await file.delete();
    console.log(`✅ File deleted: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete file ${filePath}:`, error);
    return false;
  }
}

// Utility to validate file upload request
export function validateFileUpload(files, maxFiles = FILE_UPLOAD_CONFIG.maxFiles) {
  if (!files || files.length === 0) {
    throw new Error('At least one file is required');
  }
  
  if (files.length > maxFiles) {
    throw new Error(`Maximum ${maxFiles} files allowed. You uploaded ${files.length} files.`);
  }
  
  // Validate each file
  for (const file of files) {
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(`File ${file.originalname}: Only PDF files are allowed`);
    }
    
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(`File ${file.originalname}: File size (${sizeMB}MB) exceeds 15MB limit`);
    }
  }
  
  return true;
}

// Export the initialized services
const adminDb = admin.firestore();
const adminStorage = admin.storage();

export { admin, adminDb, adminStorage };
