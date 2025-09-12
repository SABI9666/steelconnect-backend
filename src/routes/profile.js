// src/routes/profile.js - Complete fixed profile routes file with admin comments support
import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Simple email notification function (placeholder)
async function sendEmail({ to, subject, html }) {
    try {
        console.log(`Email would be sent to: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log('Email functionality not implemented yet');
        return { success: true, message: 'Email logged (not sent)' };
    } catch (error) {
        console.error('Email service error:', error);
        return { success: false, error: error.message };
    }
}

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
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

// UPDATED: Get profile status with admin comments
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
                canAccess: userData.canAccess !== false,
                userType: userData.type,
                profileData: userData.profileData || {},
                lastUpdated: userData.updatedAt,
                // Include admin comments if they exist
                adminComments: userData.adminComments || null,
                hasAdminComments: userData.hasAdminComments || false,
                rejectionReason: userData.rejectionReason || null,
                approvedAt: userData.approvedAt || null,
                rejectedAt: userData.rejectedAt || null,
                approvedBy: userData.approvedBy || null,
                rejectedBy: userData.rejectedBy || null,
                // Include blocking status for messaging
                isBlocked: userData.isBlocked || false,
                canSendMessages: userData.canSendMessages !== false,
                blockedReason: userData.blockedReason || null
            }
        });
        
    } catch (error) {
        console.error('Error fetching profile status:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile status'
        });
    }
});

// Complete profile submission - UPDATED VALIDATION
router.put('/complete', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'certificates', maxCount: 5 }
]), async (req, res) => {
    try {
        const userId = req.user.userId;
        const userType = req.user.type;
        
        console.log(`Profile completion for user ${userId} (${userType})`);
        
        // Get current user data
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const currentUserData = userDoc.data();
        
        // Base profile data
        let profileData = {
            profileCompleted: true,
            profileStatus: 'pending',
            updatedAt: new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            // Clear any previous rejection data on resubmission
            rejectionReason: null,
            rejectedAt: null,
            rejectedBy: null,
            // Clear admin comments on new submission (admin will add new ones if needed)
            adminComments: null,
            hasAdminComments: false
        };

        // Type-specific profile fields with UPDATED VALIDATION
        if (userType === 'designer') {
            // UPDATED: Only skills are required for designers
            if (!req.body.skills) {
                return res.status(400).json({
                    success: false,
                    message: 'Skills are required for designers'
                });
            }

            // Designer profile fields
            profileData = {
                ...profileData,
                linkedinProfile: req.body.linkedinProfile || '', // Optional now
                skills: req.body.skills ? req.body.skills.split(',').map(s => s.trim()) : [],
                experience: req.body.experience || '',
                education: req.body.education || '',
                specializations: req.body.specializations ? req.body.specializations.split(',').map(s => s.trim()) : [],
                bio: req.body.bio || '',
                hourlyRate: req.body.hourlyRate ? parseFloat(req.body.hourlyRate) : null
            };

            // Handle file uploads for designers
            if (req.files) {
                if (req.files.resume && req.files.resume[0]) {
                    const resumeFile = req.files.resume[0];
                    try {
                        const resumePath = `profiles/resumes/${userId}_${Date.now()}_${resumeFile.originalname}`;
                        const resumeUrl = await uploadToFirebaseStorage(resumeFile, resumePath);
                        
                        profileData.resume = {
                            filename: resumeFile.originalname,
                            mimetype: resumeFile.mimetype,
                            size: resumeFile.size,
                            uploadedAt: new Date().toISOString(),
                            url: resumeUrl
                        };
                    } catch (uploadError) {
                        console.error('Resume upload error:', uploadError);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to upload resume'
                        });
                    }
                }

                if (req.files.certificates && req.files.certificates.length > 0) {
                    try {
                        profileData.certificates = [];
                        for (let i = 0; i < req.files.certificates.length; i++) {
                            const cert = req.files.certificates[i];
                            const certPath = `profiles/certificates/${userId}_${Date.now()}_${i}_${cert.originalname}`;
                            const certUrl = await uploadToFirebaseStorage(cert, certPath);
                            
                            profileData.certificates.push({
                                filename: cert.originalname,
                                mimetype: cert.mimetype,
                                size: cert.size,
                                uploadedAt: new Date().toISOString(),
                                url: certUrl
                            });
                        }
                    } catch (uploadError) {
                        console.error('Certificate upload error:', uploadError);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to upload certificates'
                        });
                    }
                }
            }
        } else if (userType === 'contractor') {
            // UPDATED: Only company name is required for contractors
            if (!req.body.companyName) {
                return res.status(400).json({
                    success: false,
                    message: 'Company name is required for contractors'
                });
            }

            // Contractor profile fields
            profileData = {
                ...profileData,
                companyName: req.body.companyName || '',
                linkedinProfile: req.body.linkedinProfile || '', // Optional now
                companyWebsite: req.body.companyWebsite || '',
                businessType: req.body.businessType || '',
                yearEstablished: req.body.yearEstablished ? parseInt(req.body.yearEstablished) : null,
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
            reviewNotes: '',
            adminComments: null
        };

        await adminDb.collection('profile_reviews').add(reviewRequest);

        // Send notification email to user (placeholder - just log for now)
        try {
            await sendEmail({
                to: currentUserData.email,
                subject: 'Profile Submitted for Review - SteelConnect',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
                            <h1>Profile Submission Confirmation</h1>
                        </div>
                        <div style="padding: 30px;">
                            <h2>Dear ${currentUserData.name},</h2>
                            <p>Your ${userType} profile has been successfully submitted for review. Our admin team will review your profile within 24-48 hours.</p>
                            <p>You will receive an email notification once your profile is approved.</p>
                            <p><strong>Note:</strong> You can continue using the platform with limited functionality until approval.</p>
                            <br>
                            <p>Thank you for joining SteelConnect!</p>
                            <p>The SteelConnect Team</p>
                        </div>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Failed to send profile submission email:', emailError);
        }

        console.log(`Profile submitted for review: ${currentUserData.email}`);

        res.json({
            success: true,
            message: 'Profile submitted for review successfully',
            data: {
                status: 'pending',
                profileCompleted: true,
                message: 'Your profile is under review. You have limited access until approved.'
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

// Updated form fields - Make LinkedIn optional
router.get('/form-fields', async (req, res) => {
    try {
        const userType = req.user.type;
        
        let fields = [];
        
        if (userType === 'designer') {
            fields = [
                { name: 'skills', type: 'text', label: 'Skills (comma-separated)', required: true, placeholder: 'AutoCAD, Revit, Structural Analysis, Steel Design' },
                { name: 'linkedinProfile', type: 'url', label: 'LinkedIn Profile URL', required: false, placeholder: 'https://linkedin.com/in/yourprofile' },
                { name: 'experience', type: 'textarea', label: 'Years of Experience', required: false, placeholder: 'Describe your professional experience...' },
                { name: 'education', type: 'textarea', label: 'Education Background', required: false, placeholder: 'Your educational qualifications...' },
                { name: 'specializations', type: 'text', label: 'Specializations (comma-separated)', required: false, placeholder: 'Seismic Design, Bridge Engineering, High-rise Structures' },
                { name: 'bio', type: 'textarea', label: 'Professional Bio', required: false, placeholder: 'Brief professional summary...' },
                { name: 'hourlyRate', type: 'number', label: 'Hourly Rate (USD)', required: false, placeholder: '75' },
                { name: 'resume', type: 'file', label: 'Resume (PDF/DOC)', required: true, accept: '.pdf,.doc,.docx' },
                { name: 'certificates', type: 'file', label: 'Certificates (Optional)', required: false, multiple: true, accept: '.pdf,.jpg,.png' }
            ];
        } else if (userType === 'contractor') {
            fields = [
                { name: 'companyName', type: 'text', label: 'Company Name', required: true, placeholder: 'Your Company LLC' },
                { name: 'linkedinProfile', type: 'url', label: 'LinkedIn Profile URL', required: false, placeholder: 'https://linkedin.com/company/yourcompany' },
                { name: 'companyWebsite', type: 'url', label: 'Company Website', required: false, placeholder: 'https://yourcompany.com' },
                { name: 'businessType', type: 'select', label: 'Business Type', required: false, options: ['Construction', 'Engineering', 'Architecture', 'Consulting', 'Other'] },
                { name: 'yearEstablished', type: 'number', label: 'Year Established', required: false, placeholder: '2010' },
                { name: 'companySize', type: 'select', label: 'Company Size', required: false, options: ['1-10', '11-50', '51-200', '201-500', '500+'] },
                { name: 'description', type: 'textarea', label: 'Company Description', required: false, placeholder: 'Brief description of your company...' },
                { name: 'address', type: 'textarea', label: 'Business Address', required: false, placeholder: 'Your business address...' },
                { name: 'phone', type: 'tel', label: 'Business Phone', required: false, placeholder: '+1 (555) 123-4567' }
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

// UPDATED: Get current user's profile data with admin comments
router.get('/data', async (req, res) => {
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
        const { password, ...profileData } = userData;
        
        res.json({
            success: true,
            data: {
                ...profileData,
                id: userId,
                // Ensure admin comments are included
                adminComments: userData.adminComments || null,
                hasAdminComments: userData.hasAdminComments || false,
                rejectionReason: userData.rejectionReason || null,
                profileStatus: userData.profileStatus || 'incomplete'
            }
        });
        
    } catch (error) {
        console.error('Error fetching profile data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile data'
        });
    }
});

// Update specific profile fields
router.patch('/update', async (req, res) => {
    try {
        const userId = req.user.userId;
        const updateData = req.body;
        
        // Remove sensitive fields that users shouldn't be able to modify
        delete updateData.password;
        delete updateData.type;
        delete updateData.profileStatus;
        delete updateData.canAccess;
        delete updateData.isBlocked;
        delete updateData.canSendMessages;
        delete updateData.adminComments; // Users can't modify admin comments
        delete updateData.hasAdminComments;
        delete updateData.approvedBy;
        delete updateData.rejectedBy;
        delete updateData.blockedBy;
        
        // Add timestamp
        updateData.updatedAt = new Date().toISOString();
        
        await adminDb.collection('users').doc(userId).update(updateData);
        
        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
});

// NEW: Get admin feedback/comments for user
router.get('/admin-feedback', async (req, res) => {
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
                hasAdminComments: userData.hasAdminComments || false,
                adminComments: userData.adminComments || null,
                profileStatus: userData.profileStatus || 'incomplete',
                rejectionReason: userData.rejectionReason || null,
                approvedAt: userData.approvedAt || null,
                rejectedAt: userData.rejectedAt || null,
                lastReviewDate: userData.approvedAt || userData.rejectedAt || null
            }
        });
        
    } catch (error) {
        console.error('Error fetching admin feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching admin feedback'
        });
    }
});

export default router;
