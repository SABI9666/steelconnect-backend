import express from 'express';
import multer from 'multer';
import path from 'path';

// Import the configured adminStorage service from your firebase.js file
import { adminStorage } from '../config/firebase.js'; // Adjust path if needed

// (Optional) Import your Mongoose model for estimations if you have one
// import Estimation from '../models/estimation.js';

const router = express.Router();

// --- Configure Multer for in-memory file handling ---
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB file size limit
});

/**
 * @route   POST /api/estimation/upload
 * @desc    Uploads a drawing file for estimation to Firebase Storage
 * @access  Private (should be protected by auth middleware)
 */
router.post('/upload', upload.single('drawing'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    // --- 1. Upload the file to Firebase Storage ---
    const bucket = adminStorage.bucket();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = `estimations/drawing-${uniqueSuffix}${path.extname(req.file.originalname)}`;
    const fileUpload = bucket.file(fileName);

    // Create a write stream and upload the file buffer from memory
    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    blobStream.on('error', (error) => {
      throw new Error(`Upload failed: ${error.message}`);
    });

    blobStream.on('finish', async () => {
      // --- 2. Get the public URL of the uploaded file ---
      const [publicUrl] = await fileUpload.getSignedUrl({
        action: 'read',
        expires: '03-09-2491', // A far-future expiration date
      });

      // --- 3. Save the estimation details to your database ---
      // This is where you would save the publicUrl and other project
      // details (like projectName, userId, etc.) to your MongoDB.
      /*
      const newEstimation = new Estimation({
        projectName: req.body.projectName,
        userId: req.user.id, // from auth middleware
        drawingUrl: publicUrl,
        status: 'pending',
      });
      await newEstimation.save();
      */

      // --- 4. Send a success response to the client ---
      res.status(200).json({
        success: true,
        message: 'File uploaded successfully.',
        data: {
          fileName: fileName,
          url: publicUrl,
        },
      });
    });

    // End the stream by sending the file buffer
    blobStream.end(req.file.buffer);

  } catch (error) {
    console.error('Error in estimation file upload:', error);
    res.status(500).json({ success: false, error: 'Server error during file upload.' });
  }
});

export default router;
