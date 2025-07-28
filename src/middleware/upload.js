// src/middleware/upload.js (Corrected)
import multer from 'multer';
import { adminStorage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Use memory storage to handle the file as a buffer before uploading to Firebase
const multerStorage = multer.memoryStorage();

// Middleware to handle the file upload from the client
export const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB file size limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word, and Image files are allowed.'), false);
    }
  },
});

// Helper function to upload the file buffer from multer to Firebase Storage
export const uploadToFirebase = (file, destinationFolder) => {
  const bucket = adminStorage.bucket();
  
  // Create a unique filename to prevent overwrites
  const uniqueSuffix = `${uuidv4()}${path.extname(file.originalname)}`;
  const blob = bucket.file(`${destinationFolder}/${uniqueSuffix}`);
  
  const blobStream = blob.createWriteStream({
    resumable: false,
    metadata: {
      contentType: file.mimetype
    }
  });

  return new Promise((resolve, reject) => {
    blobStream.on('error', (err) => {
      console.error('Firebase upload stream error:', err);
      reject(new Error('File upload failed: ' + err.message));
    });

    blobStream.on('finish', async () => {
      try {
        // Make the file public to get a shareable URL
        await blob.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        resolve(publicUrl);
      } catch (error) {
         console.error('Failed to make file public:', err);
         reject(new Error('Failed to get public URL: ' + err.message));
      }
    });

    // End the stream with the file's buffer
    blobStream.end(file.buffer);
  });
};