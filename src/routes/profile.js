// src/routes/profile.js - Profile Management Routes
import express from 'express';
import multer from 'multer';
import { authenticateToken, requireCompleteProfile } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';
import { sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

// Get profile status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.user.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        
        res.json({
            success: true,
            data: {
                profileCompleted: userData.profileCompleted || false,
                profileStatus: userData.profileStatus || 'incomplete',
                canAccess: userData.canAccess !== false,
                profileData: userData.profileData || {},
                uploadedFiles: userData.uploadedFiles || []
            }
        });

    } catch (error) {
        console.error('Error getting profile status:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting profile status',
            error: error.message
        });
    }
});

// Complete profile with file uploads
router.put('/complete', authenticateToken, upload.array('files', 10), async (req, res) => {
    try {
        const userId = req.user.userId;
        const userType = req.user.type;
        const files = req.files || [];
        
        console.log(`Profile completion for user ${userId} (${userType})`);
        
        // Parse profile data from request body
        const profileData = {
            ...req.body,
            completedAt: new Date().toISOString(),
            submittedAt: new Date().toISOString()
        };

        // Upload files to Firebase Storage
        const uploadedFiles = [];
        if (files.length > 0) {
            for (const file of files) {
                try {
                    const filePath = `profiles/${userId}/${Date.now()}_${file.originalname}`;
                    const fileUrl = await uploadToFirebaseStorage(file, filePath);
                    
                    uploadedFiles.push({
                        name: file.originalname,
                        url: fileUrl,
                        size: file.size,
                        type: file.mimetype,
                        uploadedAt: new Date().toISOString()
                    });
                } catch (uploadError) {
                    console.error('File upload error:', uploadError);
                    // Continue with other files
                }
            }
        }

        // Update user profile in database
        await adminDb.collection('users').doc(userId).update({
            profileData: profileData,
            uploadedFiles: uploadedFiles,
            profileCompleted: true,
            profileStatus: 'pending',
            submittedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        console.log(`Profile submitted for review: ${userId}`);

        res.json({
            success: true,
            message: 'Profile submitted successfully for admin review',
            data: {
                profileStatus: 'pending',
                uploadedFiles: uploadedFiles.length
            }
        });

    } catch (error) {
        console.error('Error completing profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error completing profile',
            error: error.message
        });
    }
});

// Get user's uploaded files
router.get('/files', authenticateToken, async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.user.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        const uploadedFiles = userData.uploadedFiles || [];

        res.json({
            success: true,
            data: {
                files: uploadedFiles
            }
        });

    } catch (error) {
        console.error('Error getting profile files:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting profile files',
            error: error.message
        });
    }
});

export default router;
