import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb, adminStorage } from '../config/firebase.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import multer from 'multer';
import { Resend } from 'resend';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// Multer setup for handling file uploads in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit per file
});


// --- User Registration ---
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, type } = req.body;
    if (!email || !password || !name || !type) {
      return res.status(400).json({ error: 'All fields are required.', success: false });
    }
    if (type !== 'contractor' && type !== 'designer') {
      return res.status(400).json({ error: 'Invalid user type.', success: false });
    }
    const existingUser = await adminDb.collection('users').where('email', '==', email.toLowerCase()).get();
    if (!existingUser.empty) {
      return res.status(409).json({ error: 'User with this email already exists.', success: false });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name: name.trim(),
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };
    const userRef = await adminDb.collection('users').add(newUser);
    res.status(201).json({ message: 'User registered successfully.', success: true, userId: userRef.id });
  } catch (error) {
    console.error('REGISTRATION ERROR:', error);
    res.status(500).json({ error: 'An error occurred during registration.', success: false });
  }
});


// --- Regular User Login with Email Notification ---
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.', success: false });
        }
        const usersRef = adminDb.collection('users');
        const userSnapshot = await usersRef
            .where('email', '==', email.toLowerCase().trim())
            .where('type', 'in', ['contractor', 'designer'])
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            return res.status(401).json({ error: 'Invalid credentials.', success: false });
        }
        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();
        if (userData.isActive === false) {
            return res.status(401).json({ error: 'Account is deactivated.', success: false });
        }
        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.', success: false });
        }
        await userDoc.ref.update({ lastLoginAt: new Date().toISOString() });

        const payload = { userId: userDoc.id, email: userData.email, type: userData.type, name: userData.name };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_default_secret_key', { expiresIn: '7d' });

        // --- Send login notification email via Resend ---
        if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
            try {
                await resend.emails.send({
                    from: `SteelConnect <${process.env.RESEND_FROM_EMAIL}>`,
                    to: userData.email,
                    subject: 'New Login to Your SteelConnect Account',
                    html: `<p>Hi ${userData.name},</p><p>We detected a new login to your account at ${new Date().toLocaleString()}. If this was not you, please secure your account immediately.</p>`,
                });
                console.log(`✅ Login notification sent to ${userData.email}`);
            } catch (emailError) {
                console.error('❌ Failed to send login notification email:', emailError);
            }
        } else {
            console.warn('⚠️ RESEND_API_KEY or RESEND_FROM_EMAIL not set. Skipping login notification.');
        }

        const { password: _, ...userToReturn } = userData;
        res.status(200).json({
            message: 'Login successful',
            success: true,
            token: token,
            user: { id: userDoc.id, ...userToReturn }
        });
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ error: 'An error occurred during login.', success: false });
    }
});

// --- Get Current User Profile ---
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.user.userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found.', success: false });
        }
        const { password, ...userProfile } = userDoc.data();
        res.status(200).json({ success: true, user: { id: userDoc.id, ...userProfile } });
    } catch (error) {
        console.error('PROFILE ERROR:', error);
        res.status(500).json({ error: 'Error fetching profile.', success: false });
    }
});


// --- UPDATE User Profile (Contractor & Designer) ---
router.put('/profile', authMiddleware, upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'certificates' }
]), async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRef = adminDb.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        const userData = userDoc.data();
        const updateData = { updatedAt: new Date().toISOString() };
        
        if (req.body.name) updateData.name = req.body.name.trim();

        const uploadFile = async (file, path) => {
            const bucket = adminStorage.bucket();
            const blob = bucket.file(path);
            const blobStream = blob.createWriteStream({ metadata: { contentType: file.mimetype } });
            return new Promise((resolve, reject) => {
                blobStream.on('error', reject);
                blobStream.on('finish', async () => {
                    await blob.makePublic();
                    resolve(blob.publicUrl());
                });
                blobStream.end(file.buffer);
            });
        };

        if (userData.type === 'contractor') {
            if (req.body.companyName) updateData.companyName = req.body.companyName;
            if (req.body.linkedInUrl) updateData.linkedInUrl = req.body.linkedInUrl;
        } else if (userData.type === 'designer') {
            if (req.body.skills) {
                try {
                    updateData.skills = JSON.parse(req.body.skills);
                } catch { /* ignore invalid JSON */ }
            }
            if (req.files && req.files.resume) {
                const resumeFile = req.files.resume[0];
                const filePath = `profiles/${userId}/resume/${Date.now()}-${resumeFile.originalname}`;
                updateData.resumeUrl = await uploadFile(resumeFile, filePath);
            }
            if (req.files && req.files.certificates) {
                const existingCerts = userData.certificates || [];
                const uploadPromises = req.files.certificates.map(file => {
                    const filePath = `profiles/${userId}/certificates/${Date.now()}-${file.originalname}`;
                    return uploadFile(file, filePath).then(url => ({
                        url,
                        name: file.originalname,
                        uploadedAt: new Date().toISOString()
                    }));
                });
                const newCerts = await Promise.all(uploadPromises);
                updateData.certificates = [...existingCerts, ...newCerts];
            }
        }
        
        await userRef.update(updateData);
        const updatedUserDoc = await userRef.get();
        const { password, ...userProfile } = updatedUserDoc.data();
        
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            data: { id: updatedUserDoc.id, ...userProfile },
        });
    } catch (error) {
        console.error('PROFILE UPDATE ERROR:', error);
        res.status(500).json({ success: false, error: 'An error occurred while updating profile.' });
    }
});


export default router;
