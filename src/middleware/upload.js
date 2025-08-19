import multer from 'multer';
import { bucket } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// 1. Configure multer to use memory storage.
// This holds the file in a buffer instead of saving it to disk.
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // You can add file type validation here if you want
    cb(null, true);
  }
});

// 2. Middleware to upload the file from the memory buffer to Firebase Storage
const uploadToFirebase = (req, res, next) => {
  // If there's no file, skip to the next middleware
  if (!req.file) {
    return next();
  }

  const originalName = req.file.originalname;
  const extension = path.extname(originalName);
  // Create a unique filename for Firebase Storage
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
    req.file.firebaseError = err; // Attach error to request object
    next(err);
  });

  blobStream.on('finish', async () => {
    // The file has been successfully uploaded.
    try {
      // Make the file public to get a shareable URL
      await blob.makePublic();
    } catch (error) {
      console.error("Error making file public:", error);
      return res.status(500).json({ success: false, message: "Failed to make file public." });
    }

    // Construct the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

    // 3. Attach the URL and path to the request object
    // so the next function (your controller) can access it.
    req.file.publicUrl = publicUrl;
    req.file.firebasePath = blob.name; // Save the path for future deletions

    next();
  });

  // End the stream by writing the file's buffer
  blobStream.end(req.file.buffer);
};


// Error handling middleware for Multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${error.message}`,
      error: error.code
    });
  } else if (error) {
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred during file upload.',
      error: error.message
    });
  }
  next();
};

export { multerUpload, uploadToFirebase, handleUploadError };
