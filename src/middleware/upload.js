import multer from 'multer';
import { adminStorage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const multerStorage = multer.memoryStorage();

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

export const uploadToFirebase = (file, destinationFolder) => {
  const bucket = adminStorage.bucket();
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
        resolve(publicUrl);
      } catch (error) {
        // FIX: Changed 'err' to 'error' to match the catch block variable
        console.error('Failed to make file public:', error);
        reject(new Error('Failed to get public URL: ' + error.message));
      }
    });
    blobStream.end(file.buffer);
  });
};
