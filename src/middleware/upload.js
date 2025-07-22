// middleware/upload.js (Create this file if it doesn't exist, or update it)
import multer from 'multer';
import { adminStorage } from '../config/firebase.js'; // Import adminStorage from your config
import path from 'path';

// Multer storage configuration: Store file in memory as a Buffer
const multerStorage = multer.memoryStorage();

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Define allowed MIME types for security
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', // Example: allow images too
      'image/png'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word documents, JPG, PNG are allowed.'), false);
    }
  },
});

// Function to upload a file buffer to Firebase Storage
const uploadToFirebase = async (fileBuffer, fileName, destinationFolder) => {
    // Get the default bucket from adminStorage
    const bucket = adminStorage.bucket();
    const blob = bucket.file(`${destinationFolder}/${fileName}`);
    const blobStream = blob.createWriteStream({
        resumable: false, // For smaller files, resumable can be false
        metadata: {
            contentType: fileBuffer.mimetype // Use the original mimetype from Multer
        }
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
            console.error('Firebase upload stream error:', err);
            reject(new Error('Firebase upload failed: ' + err.message));
        });

        blobStream.on('finish', async () => {
            // Make the file publicly accessible (adjust if you need private files)
            await blob.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            resolve(publicUrl);
        });

        blobStream.end(fileBuffer.buffer); // Multer memoryStorage provides file.buffer
    });
};

export { upload, uploadToFirebase };