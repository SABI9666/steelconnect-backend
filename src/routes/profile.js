// src/routes/profile.js - Profile management routes
import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG are allowed.'), false);
        }
    }
});

// Apply authentication to all routes
router.use(authenticateToken);

// Get current user profile
router.get('/me', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.user.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        const { password, ...userProfile } = userData;
        
        res.json({
            success: true,
            data: {
                ...userProfile,
                id: userDoc.id
            }
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile'
        });
    }
});

// Update profile (with file uploads)
router.put('/complete', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'certificates', maxCount: 5 }
]), async (req, res) => {
    try {
        const userId = req.user.userId;
        const userType = req.user.type;
        
        // Get current user data
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const currentUserData = userDoc.data();
        
        // Prepare profile data based on user type
        let profileData = {
            profileCompleted: true,
            profileStatus: 'pending', // pending, approved, rejected
            updatedAt: new Date().toISOString(),
            submittedAt: new Date().toISOString()
        };

        if (userType === 'designer') {
            // Designer profile fields
            profileData = {
                ...profileData,
                linkedinProfile: req.body.linkedinProfile || '',
                skills: req.body.skills ? req.body.skills.split(',').map(s => s.trim()) : [],
                experience: req.body.experience || '',
                education: req.body.education || '',
                specializations: req.body.specializations ? req.body.specializations.split(',').map(s => s.trim()) : [],
                bio: req.body.bio || ''
            };

            // Handle file uploads for designers
            if (req.files) {
                if (req.files.resume && req.files.resume[0]) {
                    const resumeFile = req.files.resume[0];
                    // In a real implementation, upload to cloud storage (AWS S3, Google Cloud Storage, etc.)
                    // For now, we'll store file metadata
                    profileData.resume = {
                        filename: resumeFile.originalname,
                        mimetype: resumeFile.mimetype,
                        size: resumeFile.size,
                        uploadedAt: new Date().toISOString(),
                        // In production, store the actual file URL after uploading to cloud storage
                        url: `/uploads/resumes/${userId}_${Date.now()}_${resumeFile.originalname}`
                    };
                }

                if (req.files.certificates && req.files.certificates.length > 0) {
                    profileData.certificates = req.files.certificates.map((cert, index) => ({
                        filename: cert.originalname,
                        mimetype: cert.mimetype,
                        size: cert.size,
                        uploadedAt: new Date().toISOString(),
                        // In production, store the actual file URL after uploading to cloud storage
                        url: `/uploads/certificates/${userId}_${Date.now()}_${index}_${cert.originalname}`
                    }));
                }
            }
        } else if (userType === 'contractor') {
            // Contractor profile fields
            profileData = {
                ...profileData,
                companyName: req.body.companyName || '',
                linkedinProfile: req.body.linkedinProfile || '',
                companyWebsite: req.body.companyWebsite || '',
                businessType: req.body.businessType || '',
                yearEstablished: req.body.yearEstablished || '',
                companySize: req.body.companySize || '',
                description: req.body.description || '',
                address: req.body.address || '',
                phone: req.body.phone || ''
            };
        }

        // Update user profile
        await adminDb.collection('users').doc(userId).update(profileData);

        // Create profile review request for admin
        const reviewRequest = {
            userId: userId,
            userEmail: currentUserData.email,
            userName: currentUserData.name,
            userType: userType,
            profileData: profileData,
            status: 'pending',
            createdAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null,
            reviewNotes: ''
        };

        await adminDb.collection('profile_reviews').add(reviewRequest);

        // Send notification email to user
        try {
            await sendEmail({
                to: currentUserData.email,
                subject: 'Profile Submitted for Review - SteelConnect',
                html: `
                    <h2>Profile Submission Confirmation</h2>
                    <p>Dear ${currentUserData.name},</p>
                    <p>Your profile has been successfully submitted for review. Our admin team will review your profile within 24-48 hours.</p>
                    <p>You will receive an email notification once your profile is approved.</p>
                    <p>Until approval, your account will have limited functionality.</p>
                    <br>
                    <p>Thank you for joining SteelConnect!</p>
                    <p>The SteelConnect Team</p>
                `
            });
        } catch (emailError) {
            console.error('Failed to send profile submission email:', emailError);
            // Don't fail the request if email fails
        }

        // Update user's canAccess flag
        await adminDb.collection('users').doc(userId).update({
            canAccess: false // Restrict access until approved
        });

        res.json({
            success: true,
            message: 'Profile submitted for review successfully',
            data: {
                status: 'pending',
                profileCompleted: true
            }
        });

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
});

// Check profile status
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
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
                canAccess: userData.canAccess !== false, // Default to true for backward compatibility
                rejectionReason: userData.rejectionReason || null
            }
        });
    } catch (error) {
        console.error('Error checking profile status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking profile status'
        });
    }
});

// Get profile form fields based on user type
router.get('/form-fields', async (req, res) => {
    try {
        const userType = req.user.type;
        
        let fields = [];
        
        if (userType === 'designer') {
            fields = [
                { name: 'linkedinProfile', type: 'url', label: 'LinkedIn Profile', required: true },
                { name: 'skills', type: 'text', label: 'Skills (comma-separated)', required: true },
                { name: 'experience', type: 'textarea', label: 'Experience', required: true },
                { name: 'education', type: 'textarea', label: 'Education', required: true },
                { name: 'specializations', type: 'text', label: 'Specializations (comma-separated)', required: false },
                { name: 'bio', type: 'textarea', label: 'Professional Bio', required: true },
                { name: 'resume', type: 'file', label: 'Resume (PDF/DOC)', required: true, accept: '.pdf,.doc,.docx' },
                { name: 'certificates', type: 'file', label: 'Certificates (Optional)', required: false, multiple: true, accept: '.pdf,.jpg,.png' }
            ];
        } else if (userType === 'contractor') {
            fields = [
                { name: 'companyName', type: 'text', label: 'Company Name', required: true },
                { name: 'linkedinProfile', type: 'url', label: 'LinkedIn Profile', required: true },
                { name: 'companyWebsite', type: 'url', label: 'Company Website', required: false },
                { name: 'businessType', type: 'select', label: 'Business Type', required: true, options: ['Construction', 'Engineering', 'Architecture', 'Consulting', 'Other'] },
                { name: 'yearEstablished', type: 'number', label: 'Year Established', required: false },
                { name: 'companySize', type: 'select', label: 'Company Size', required: false, options: ['1-10', '11-50', '51-200', '201-500', '500+'] },
                { name: 'description', type: 'textarea', label: 'Company Description', required: true },
                { name: 'address', type: 'textarea', label: 'Business Address', required: false },
                { name: 'phone', type: 'tel', label: 'Business Phone', required: false }
            ];
        }
        
        res.json({
            success: true,
            data: {
                userType,
                fields
            }
        });
    } catch (error) {
        console.error('Error fetching form fields:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching form fields'
        });
    }
});

export default router;