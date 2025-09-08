// src/routes/profile.js - Complete Profile management routes
import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb, adminStorage } from '../config/firebase.js';
import { sendEmail, sendProfileApprovalEmail } from '../utils/emailService.js';

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

// Helper function to upload file to Firebase Storage
async function uploadToFirebaseStorage(file, path) {
    try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(path);
        
        const stream = fileRef.createWriteStream({
            metadata: {
                contentType: file.mimetype,
            },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', async () => {
                try {
                    await fileRef.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
                    resolve(publicUrl);
                } catch (error) {
                    reject(error);
                }
            });
            stream.end(file.buffer);
        });
    } catch (error) {
        throw error;
    }
}

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

// Complete profile submission
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
            submittedAt: new Date().toISOString()
        };

        // Type-specific profile fields
        if (userType === 'designer') {
            // Validate required fields for designers
            if (!req.body.linkedinProfile || !req.body.skills) {
                return res.status(400).json({
                    success: false,
                    message: 'LinkedIn profile and skills are required for designers'
                });
            }

            // Designer profile fields
            profileData = {
                ...profileData,
                linkedinProfile: req.body.linkedinProfile || '',
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
            // Validate required fields for contractors
            if (!req.body.companyName || !req.body.linkedinProfile) {
                return res.status(400).json({
                    success: false,
                    message: 'Company name and LinkedIn profile are required for contractors'
                });
            }

            // Contractor profile fields
            profileData = {
                ...profileData,
                companyName: req.body.companyName || '',
                linkedinProfile: req.body.linkedinProfile || '',
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
            reviewNotes: ''
        };

        await adminDb.collection('profile_reviews').add(reviewRequest);

        // Send notification email to user
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
                            <p><strong>Note:</strong> Until approval, your account will have limited functionality. You'll be able to access the platform fully once approved.</p>
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

        // Restrict access until approved
        await adminDb.collection('users').doc(userId).update({
            canAccess: false
        });

        console.log(`Profile submitted for review: ${currentUserData.email}`);

        res.json({
            success: true,
            message: 'Profile submitted for review successfully',
            data: {
                status: 'pending',
                profileCompleted: true,
                message: 'Your profile is under review. You will receive an email once approved.'
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
                canAccess: userData.canAccess !== false,
                rejectionReason: userData.rejectionReason || null,
                userType: userData.type
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

// Update profile after approval (settings page)
router.put('/update', upload.fields([
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
        
        // Check if profile is approved
        if (currentUserData.profileStatus !== 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Profile must be approved before updates'
            });
        }

        let updateData = {
            updatedAt: new Date().toISOString()
        };

        // Update basic info
        if (req.body.name) updateData.name = req.body.name;

        // Type-specific updates
        if (userType === 'designer') {
            if (req.body.linkedinProfile) updateData.linkedinProfile = req.body.linkedinProfile;
            if (req.body.skills) updateData.skills = req.body.skills.split(',').map(s => s.trim());
            if (req.body.experience) updateData.experience = req.body.experience;
            if (req.body.education) updateData.education = req.body.education;
            if (req.body.specializations) updateData.specializations = req.body.specializations.split(',').map(s => s.trim());
            if (req.body.bio) updateData.bio = req.body.bio;
            if (req.body.hourlyRate) updateData.hourlyRate = parseFloat(req.body.hourlyRate);

            // Handle file updates
            if (req.files && req.files.resume && req.files.resume[0]) {
                const resumeFile = req.files.resume[0];
                const resumePath = `profiles/resumes/${userId}_${Date.now()}_${resumeFile.originalname}`;
                const resumeUrl = await uploadToFirebaseStorage(resumeFile, resumePath);
                
                updateData.resume = {
                    filename: resumeFile.originalname,
                    mimetype: resumeFile.mimetype,
                    size: resumeFile.size,
                    uploadedAt: new Date().toISOString(),
                    url: resumeUrl
                };
            }

        } else if (userType === 'contractor') {
            if (req.body.companyName) updateData.companyName = req.body.companyName;
            if (req.body.linkedinProfile) updateData.linkedinProfile = req.body.linkedinProfile;
            if (req.body.companyWebsite) updateData.companyWebsite = req.body.companyWebsite;
            if (req.body.businessType) updateData.businessType = req.body.businessType;
            if (req.body.yearEstablished) updateData.yearEstablished = parseInt(req.body.yearEstablished);
            if (req.body.companySize) updateData.companySize = req.body.companySize;
            if (req.body.description) updateData.description = req.body.description;
            if (req.body.address) updateData.address = req.body.address;
            if (req.body.phone) updateData.phone = req.body.phone;
        }

        // Update user profile
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

// Get profile form fields based on user type
router.get('/form-fields', async (req, res) => {
    try {
        const userType = req.user.type;
        
        let fields = [];
        
        if (userType === 'designer') {
            fields = [
                { name: 'linkedinProfile', type: 'url', label: 'LinkedIn Profile URL', required: true, placeholder: 'https://linkedin.com/in/yourprofile' },
                { name: 'skills', type: 'text', label: 'Skills (comma-separated)', required: true, placeholder: 'AutoCAD, Revit, Structural Analysis, Steel Design' },
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
                { name: 'linkedinProfile', type: 'url', label: 'LinkedIn Profile URL', required: true, placeholder: 'https://linkedin.com/company/yourcompany' },
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

export default router;
