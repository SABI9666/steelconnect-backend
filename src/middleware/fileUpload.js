// New file: src/middleware/fileUpload.js
import multer from 'multer';
import { bucket } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// This multer instance will process the file into memory
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// This middleware takes the file from memory and uploads it to Firebase
const uploadToFirebase = (req, res, next) => {
  if (!req.file) {
    return next(); // If no file, skip to the next function
  }

  const originalName = req.file.originalname;
  const extension = path.extname(originalName);
  const fileName = `uploads/${uuidv4()}${extension}`;

  const blob = bucket.file(fileName);
  const blobStream = blob.createWriteStream({
    resumable: false,
    metadata: {
      contentType: req.file.mimetype,
    },
  });

  blobStream.on('error', (err) => {
    console.error("Firebase upload stream error:", err);
    next(err);
  });

  blobStream.on('finish', async () => {
    try {
      // Make the file publicly accessible
      await blob.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      
      // Attach the URL to the request for the controller to use
      req.file.publicUrl = publicUrl;
      req.file.firebasePath = blob.name; // For future deletions
      next();
    } catch (error) {
      console.error("Error making file public:", error);
      next(error);
    }
  });

  blobStream.end(req.file.buffer);
};

export { multerUpload, uploadToFirebase };
