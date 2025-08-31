// server.js - FULLY UPDATED AND FUNCTIONAL
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Resend } from 'resend'; // Import Resend

// Import existing routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js';

// Import Firebase services and middleware helpers
import { adminDb, adminAuth } from './firebase.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;
const resend = new Resend(process.env.RESEND_API_KEY); // Initialize Resend

console.log('🚀 SteelConnect Backend Starting...');

// --- Database Connection ---
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB connected'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
} else {
    console.warn('⚠️ MONGODB_URI not found in environment variables');
}

// --- Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// --- Request logging middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Health check route ---
app.get('/health', (req, res) => res.json({ success: true, message: 'Backend is healthy' }));

// --- Token Authentication Middleware ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        req.user = await adminAuth.verifyIdToken(token);
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// --- Register Existing Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);

// --- IMPLEMENT MISSING ROUTES ---

// 1. Profile Route (PUT /api/profile)
const profileRouter = express.Router();
profileRouter.put('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const profileData = req.body; // e.g., { companyName, linkedInUrl, skills, etc. }
        await adminDb.collection('users').doc(userId).set(profileData, { merge: true });
        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});
app.use('/api/profile', profileRouter);
console.log('✅ Profile routes registered');

// 2. Notifications Routes (GET /api/notifications, etc.)
const notificationsRouter = express.Router();
notificationsRouter.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const snapshot = await adminDb.collection('notifications')
            .where('recipientId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: notifications });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});
notificationsRouter.delete('/', authenticateToken, async (req, res) => {
     try {
        const userId = req.user.uid;
        const snapshot = await adminDb.collection('notifications').where('recipientId', '==', userId).get();
        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting notifications:", error);
        res.status(500).json({ error: 'Failed to delete notifications.' });
    }
});
app.use('/api/notifications', notificationsRouter);
console.log('✅ Notification routes registered');

// 3. Login Notification Route (POST /api/auth/notify-login)
authRoutes.post('/notify-login', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required.' });
        }

        await resend.emails.send({
            from: 'SteelConnect Security <security@yourdomain.com>', // Replace with your verified Resend domain
            to: email,
            subject: 'New Login to Your SteelConnect Account',
            html: `<p>Hi ${name},</p><p>We detected a new login to your account on ${new Date().toLocaleString()}. If this was not you, please secure your account immediately.</p>`,
        });

        res.json({ success: true, message: 'Login notification sent.' });
    } catch (error) {
        console.error('Error sending login notification:', error);
        res.status(500).json({ error: 'Could not send notification email.' });
    }
});
console.log('✅ Login notification route added');


// --- Error handling middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS policy violation' });
    }
    res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
});

// --- 404 handler ---
app.use('*', (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎉 SteelConnect Backend Server Started on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
