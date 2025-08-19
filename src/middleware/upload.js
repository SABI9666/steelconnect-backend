import multer from 'multer';
// FIXED: Import 'bucket' directly from your firebase config
import { bucket } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const multerStorage = multer.memoryStorage();

// This multer instance is used to process the file in memory
export const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
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
      cb(new Error('Invalid file type.'), false);
    }
  },
});

// This is a helper function to upload a file buffer to Firebase
export const uploadToFirebase = (file, destinationFolder) => {
  // FIXED: No need to call adminStorage.bucket() since we import bucket directly
  const uniqueSuffix = `${uuidv4()}${path.extname(file.originalname)}`;
  const blob = bucket.file(`${destinationFolder}/${uniqueSuffix}`);
  const blobStream = blob.createWriteStream({
    resumable: false,
    metadata: { contentType: file.mimetype }
  });

  return new Promise((resolve, reject) => {
    blobStream.on('error', (err) => {
      console.error('Firebase upload stream error:', err);
      reject(new Error('File upload failed: ' + err.message));
    });

    blobStream.on('finish', async () => {
      try {
        await blob.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        // Also return the path for future deletions
        resolve({
            url: publicUrl,
            path: blob.name
        });
      } catch (error) {
        console.error('Failed to make file public:', error);
        reject(new Error('Failed to get public URL: ' + error.message));
      }
    });
    blobStream.end(file.buffer);
  });
};
