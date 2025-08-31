// server.js - SteelConnect Backend API Server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { Resend } from 'resend';

// Import existing routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js';

// Import Firebase services from external file
import { admin, adminDb, adminAuth, adminStorage } from './firebase.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Resend only if API key is available
let resend = null;
if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend email service initialized');
} else {
    console.warn('⚠️ RESEND_API_KEY not found - email notifications disabled');
}

console.log('🚀 SteelConnect Backend Starting...');

// --- Firebase Connection Check ---
try {
    console.log('🔥 Testing Firebase connection...');
    const testCollection = adminDb.collection('_health_check');
    await testCollection.doc('test').set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
    console.log('✅ Firebase Firestore connected successfully');
} catch (error) {
    console.error('❌ Firebase connection error:', error.message);
    // Don't exit - let the server start but log the error
}

// --- Enhanced CORS Configuration ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);

// Function to check if origin is allowed
const isOriginAllowed = (origin) => {
    if (!origin) return true; // Allow requests with no origin (mobile apps, etc.)
    
    // Check explicit allowed origins
    if (allowedOrigins.includes(origin)) return true;
    
    // Allow Vercel deployments
    if (origin.endsWith('.vercel.app')) return true;
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
    
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginResourcePolicy: { policy: "cross-origin" } 
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// --- Enhanced Request logging middleware ---
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const origin = req.headers.origin || 'No Origin';
    const auth = req.headers.authorization ? 'Bearer ***' : 'No Auth';
    
    console.log(`${timestamp} - ${req.method} ${req.url}`);
    console.log(`  Origin: ${origin} | Auth: ${auth}`);
    next();
});

// --- Health check route ---
app.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Backend is healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// --- Token Authentication Middleware ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    try {
        // FIX: Use admin.auth() instead of adminAuth
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// --- Middleware to attach Firebase services to req ---
app.use((req, res, next) => {
    req.firebase = {
        admin,
        adminDb,
        adminAuth,
        adminStorage
    };
    next();
});

// --- Register Existing Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);

// --- IMPLEMENT MISSING ROUTES ---

// 1. Profile Route (PUT /api/profile)
const profileRouter = express.Router();

profileRouter.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        res.json({ success: true, data: userDoc.data() });
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

profileRouter.put('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const profileData = {
            ...req.body,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await adminDb.collection('users').doc(userId).set(profileData, { merge: true });
        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

app.use('/api/profile', profileRouter);
console.log('✅ Profile routes registered');

// 2. Notifications Routes
const notificationsRouter = express.Router();

notificationsRouter.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const limit = parseInt(req.query.limit) || 20;
        
        const snapshot = await adminDb.collection('notifications')
            .where('recipientId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
            
        const notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || null
        }));
        
        res.json({ success: true, data: notifications });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});

notificationsRouter.post('/', authenticateToken, async (req, res) => {
    try {
        const { recipientId, title, message, type = 'info' } = req.body;
        
        if (!recipientId || !title || !message) {
            return res.status(400).json({ error: 'Missing required fields: recipientId, title, message' });
        }
        
        const notification = {
            recipientId,
            title,
            message,
            type,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: req.user.uid
        };
        
        const docRef = await adminDb.collection('notifications').add(notification);
        res.json({ success: true, id: docRef.id, message: 'Notification created successfully.' });
    } catch (error) {
        console.error("Error creating notification:", error);
        res.status(500).json({ error: 'Failed to create notification.' });
    }
});

notificationsRouter.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.uid;
        
        // Verify the notification belongs to the user
        const notificationDoc = await adminDb.collection('notifications').doc(id).get();
        if (!notificationDoc.exists || notificationDoc.data().recipientId !== userId) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        await adminDb.collection('notifications').doc(id).update({
            read: true,
            readAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (error) {
        console.error("Error updating notification:", error);
        res.status(500).json({ error: 'Failed to update notification.' });
    }
});

notificationsRouter.delete('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const snapshot = await adminDb.collection('notifications')
            .where('recipientId', '==', userId)
            .get();
        
        if (snapshot.empty) {
            return res.json({ success: true, message: 'No notifications to delete.' });
        }
        
        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        res.json({ success: true, message: `${snapshot.docs.length} notifications deleted.` });
    } catch (error) {
        console.error("Error deleting notifications:", error);
        res.status(500).json({ error: 'Failed to delete notifications.' });
    }
});

app.use('/api/notifications', notificationsRouter);
console.log('✅ Notification routes registered');

// 3. Login Notification Route (POST /api/auth/notify-login)
const authNotifyRouter = express.Router();

authNotifyRouter.post('/notify-login', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required.' });
        }
        
        if (!resend) {
            console.warn('⚠️ Resend not configured - login notification skipped');
            return res.json({ success: true, message: 'Login notification skipped (email service not configured).' });
        }

        const loginTime = new Date().toLocaleString();
        const userAgent = req.headers['user-agent'] || 'Unknown device';
        const ip = req.ip || req.connection.remoteAddress || 'Unknown IP';
        
        await resend.emails.send({
            from: 'SteelConnect Security <noreply@steelconnect.com>', // Replace with your verified domain
            to: email,
            subject: 'New Login to Your SteelConnect Account',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">New Login Detected</h2>
                    <p>Hi ${name},</p>
                    <p>We detected a new login to your SteelConnect account:</p>
                    <ul>
                        <li><strong>Time:</strong> ${loginTime}</li>
                        <li><strong>Device:</strong> ${userAgent}</li>
                        <li><strong>IP Address:</strong> ${ip}</li>
                    </ul>
                    <p>If this was not you, please secure your account immediately by changing your password.</p>
                    <p>Best regards,<br>The SteelConnect Team</p>
                </div>
            `,
        });

        res.json({ success: true, message: 'Login notification sent successfully.' });
    } catch (error) {
        console.error('Error sending login notification:', error);
        res.status(500).json({ error: 'Could not send notification email.' });
    }
});

// Mount the auth notification routes
app.use('/api/auth', authNotifyRouter);
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
    
    // Firebase errors
    if (error.code && error.code.includes('auth/')) {
        return res.status(401).json({ error: 'Authentication error: ' + error.message });
    }
    
    res.status(error.status || 500).json({ 
        error: error.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
    });
});

// --- Enhanced 404 handler ---
app.use('*', (req, res) => {
    const timestamp = new Date().toISOString();
    const origin = req.headers.origin || 'No Origin';
    
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    console.log(`    Origin: ${origin}`);
    
    res.status(404).json({ 
        error: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: timestamp
    });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎉 SteelConnect Backend Server Started Successfully!`);
    console.log(`🔗 Server running on: http://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📱 CORS origins configured: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'Development mode (all Vercel/localhost origins allowed)'}`);
    console.log(`🔥 Firebase Admin initialized: ${admin.apps.length > 0 ? '✅' : '❌'}`);
    console.log(`💾 Database: Firebase Firestore`);
});
