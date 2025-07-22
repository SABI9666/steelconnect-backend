// routes/uploads.js (Create this new file)
import express from 'express';
import { upload, uploadToFirebase } from '../middleware/upload.js';
import { verifyToken } from './auth.js'; // Assuming verifyToken is in auth.js

const router = express.Router();

// Route for actual file uploads
router.post('/file', verifyToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    // Determine the folder in Firebase Storage based on context (e.g., 'job-attachments', 'quote-proposals')
    // The frontend should send a 'context' field in the FormData (e.g., 'job', 'quote')
    const context = req.body.context || 'general';
    let destinationFolder;
    if (context === 'job') {
      destinationFolder = 'job-attachments';
    } else if (context === 'quote') {
      destinationFolder = 'quote-proposals';
    } else {
      destinationFolder = 'misc-uploads';
    }

    // Create a unique filename to prevent clashes
    const filename = `${Date.now()}-${req.file.originalname.replace(/\s/g, '_')}`; // Replace spaces for better URLs

    const fileUrl = await uploadToFirebase(req.file, filename, destinationFolder);

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      originalName: req.file.originalname,
      url: fileUrl,
      // You might want to also save this URL to your Firestore document here
      // e.g., add it to the 'attachments' array of a job or quote document
    });
  } catch (error) {
    console.error('Upload route error:', error);
    next(error); // Pass error to your global error handler in server.js
  }
});

// Route for submitting external links (no file upload needed)
router.post('/link', verifyToken, async (req, res, next) => {
  try {
    const { url, context } = req.body; // context could be 'job' or 'quote'

    if (!url || !/^https?:\/\/.+/.test(url)) { // Basic URL validation
      return res.status(400).json({ message: 'Invalid URL provided.' });
    }

    res.status(201).json({
      success: true,
      message: 'Link submitted successfully',
      submittedUrl: url,
      context: context || 'general',
      // You might want to save this link to your Firestore document here
    });
  } catch (error) {
    console.error('Link submission route error:', error);
    next(error);
  }
});

export default router;