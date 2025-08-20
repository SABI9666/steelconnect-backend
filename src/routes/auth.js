import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- Admin Login Route ---
router.post('/login/admin', async (req, res) => {
    try {
        console.log('--- ADMIN LOGIN ATTEMPT ---');
        const { email, password } = req.body;

        if (!email || !password) {
            console.log('❌ Login failed: Missing email or password.');
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required.' 
            });
        }
        
        console.log(`Admin login attempt: ${email}`);

        // Method 1: Environment Variable Admin (Backup)
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        
        if (adminEmail && adminPassword && email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
            console.log('✅ Environment admin login successful');
            
            const payload = {
                userId: 'env_admin',
                email: adminEmail,
                type: 'admin',
                name: 'Environment Admin',
                role: 'admin'
            };
            
            const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '24h' });
            
            console.log('Admin login successful (temporary auth):', adminEmail);
            
            return res.status(200).json({
                message: 'Admin login successful',
                success: true,
                token: token,
                user: { 
                    id: 'env_admin', 
                    userId: 'env_admin',
                    name: 'Environment Admin', 
                    email: adminEmail, 
                    type: 'admin', 
                    role: 'admin' 
                }
            });
        }
        
        console.log('Not environment admin, checking database...');

        // Method 2: Database Admin Check
        if (!adminDb) {
            console.error('❌ FATAL: adminDb is not available!');
            return res.status(500).json({ 
                success: false,
                error: 'Database service is not available.' 
            });
        }

        const usersRef = adminDb.collection('users');
        const userSnapshot = await usersRef
            .where('email', '==', email.toLowerCase().trim())
            .where('type', '==', 'admin')
            .limit(1)
            .get();

        console.log(`Firestore query completed. Found ${userSnapshot.size} admin user(s).`);
        
        if (userSnapshot.empty) {
            console.log('❌ No admin user found in database');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid admin credentials.' 
            });
        }

        const adminDoc = userSnapshot.docs[0];
        const adminData = adminDoc.data();

        const isMatch = await bcrypt.compare(password, adminData.password);
        if (!isMatch) {
            console.log('❌ Password mismatch for admin');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid admin credentials.' 
            });
        }

        console.log('✅ Database admin login successful');
        
        const payload = {
            userId: adminDoc.id,
            email: adminData.email,
            type: 'admin',
            name: adminData.name,
            role: 'admin'
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '24h' });
        
        return res.status(200).json({
            message: 'Admin login successful',
            success: true,
            token: token,
            user: { 
                id: adminDoc.id, 
                userId: adminDoc.id,
                name: adminData.name, 
                email: adminData.email, 
                type: 'admin', 
                role: 'admin' 
            }
        });

    } catch (error) {
        console.error('❌ ADMIN LOGIN ERROR:', error);
        res.status(500).json({
            success: false,
            error: 'A server error occurred during admin login.',
            details: error.message
        });
    }
});

// --- Regular User Registration ---
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, type } = req.body;

        console.log(`Registration attempt: ${email} as ${type}`);

        if (!email || !password || !name || !type) {
            return res.status(400).json({ 
                success: false,
                error: 'Email, password, name, and type are required.' 
            });
        }
        
        if (type !== 'contractor' && type !== 'designer') {
            return res.status(400).json({ 
                success: false,
                error: 'User type must be either "contractor" or "designer".' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                error: 'Password must be at least 6 characters long.' 
            });
        }

        const existingUser = await adminDb.collection('users').where('email', '==', email.toLowerCase()).get();
        if (!existingUser.empty) {
            return res.status(409).json({ 
                success: false,
                error: 'User with this email already exists.' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            name: name.trim(),
            type,
            role: 'user',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            subscription: { status: 'inactive', endDate: null }
        };

        const userRef = await adminDb.collection('users').add(newUser);
        const { password: _, ...userToReturn } = newUser;

        const payload = { 
            userId: userRef.id, 
            email: newUser.email, 
            type: newUser.type, 
            name: newUser.name,
            role: newUser.role
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '7d' });

        console.log(`✅ User registered successfully: ${email} (ID: ${userRef.id})`);

        res.status(201).json({
            message: 'User registered successfully.',
            success: true,
            token,
            user: { 
                id: userRef.id, 
                userId: userRef.id,
                ...userToReturn 
            }
        });

    } catch (error) {
        console.error('❌ REGISTRATION ERROR:', error);
        res.status(500).json({ 
            success: false,
            error: 'An error occurred during registration.' 
        });
    }
});

// --- Regular User Login ---
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log(`Login attempt: ${email}`);

        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required.' 
            });
        }

        const userSnapshot = await adminDb.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .where('type', 'in', ['contractor', 'designer'])
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            console.log(`❌ No user found: ${email}`);
            return res.status(401).json({ 
                success: false,
                error: 'Invalid credentials.' 
            });
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        if (userData.status === 'suspended') {
            console.log(`❌ Account suspended: ${email}`);
            return res.status(403).json({ 
                success: false,
                error: 'Your account has been suspended.' 
            });
        }

        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch) {
            console.log(`❌ Password mismatch: ${email}`);
            return res.status(401).json({ 
                success: false,
                error: 'Invalid credentials.' 
            });
        }

        const payload = { 
            userId: userDoc.id, 
            email: userData.email, 
            type: userData.type, 
            name: userData.name,
            role: userData.role || 'user'
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '7d' });

        console.log(`✅ Login successful: ${email} (ID: ${userDoc.id}, Type: ${userData.type})`);

        res.status(200).json({
            message: 'Login successful',
            success: true,
            token: token,
            user: {
                id: userDoc.id,
                userId: userDoc.id,
                name: userData.name,
                email: userData.email,
                type: userData.type,
                role: userData.role || 'user'
            }
        });

    } catch (error) {
        console.error('❌ LOGIN ERROR:', error);
        res.status(500).json({ 
            success: false,
            error: 'An error occurred during login.' 
        });
    }
});

export default router;
