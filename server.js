// server.js - Complete Server with Admin + All Portals
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 SteelConnect Complete Server Starting...');
console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);

// --- Middleware Setup ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(origin => origin.trim());

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || 
            origin.endsWith('.vercel.app') || 
            origin.includes('localhost') ||
            origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" not in allowed list`);
            if (process.env.NODE_ENV !== 'production') {
                callback(null, true); // Allow all in development
            } else {
                callback(null, false); // Strict in production
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(helmet({ 
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Request Logging ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.get('Origin') || 'No origin'}`);
    next();
});

// --- Database Connection Simulation ---
// Note: Replace this with your actual database setup
let dbConnected = false;
const simulateDbConnection = () => {
    if (process.env.MONGODB_URI) {
        // Add your MongoDB connection here
        console.log('✅ Database connection simulated (replace with actual MongoDB)');
        dbConnected = true;
    } else {
        console.warn('⚠️ MONGODB_URI not found - running without database');
    }
};
simulateDbConnection();

// --- JWT Authentication Middleware ---
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            error: 'Admin access required' 
        });
    }
    next();
};

// --- ROOT & HEALTH ROUTES ---
app.get('/', (req, res) => {
    res.json({ 
        message: 'SteelConnect Complete Backend API',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            admin: '✅ Available',
            auth: '✅ Available', 
            jobs: '✅ Available',
            quotes: '✅ Available',
            messages: '✅ Available',
            estimation: '✅ Available'
        },
        endpoints: {
            health: '/health',
            api: '/api',
            admin: '/api/admin/*',
            auth: '/api/auth/*',
            jobs: '/api/jobs/*',
            quotes: '/api/quotes/*',
            messages: '/api/messages/*',
            estimation: '/api/estimation/*'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'SteelConnect Backend is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        database: dbConnected ? 'Connected' : 'Disconnected',
        version: '1.0.0'
    });
});

app.get('/api', (req, res) => {
    res.json({
        message: 'SteelConnect API v1.0.0',
        status: 'operational',
        available_endpoints: [
            'POST /api/auth/login',
            'POST /api/auth/register', 
            'GET /api/admin/dashboard',
            'GET /api/admin/users',
            'GET /api/jobs',
            'GET /api/quotes',
            'GET /api/messages',
            'POST /api/estimation/calculate'
        ],
        documentation: 'https://your-docs-url.com'
    });
});

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }

        // TODO: Replace with actual user authentication
        // For now, create a mock admin user
        let user;
        if (email === 'admin@steelconnect.com' && password === 'admin123') {
            user = {
                id: 'admin_001',
                name: 'Admin User',
                email: 'admin@steelconnect.com',
                role: 'admin'
            };
        } else if (email === 'user@steelconnect.com' && password === 'user123') {
            user = {
                id: 'user_001',
                name: 'Regular User',
                email: 'user@steelconnect.com',
                role: 'user'
            };
        } else {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role }, 
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            user: user,
            token: token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error during login' 
        });
    }
});

app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name, email, and password are required' 
            });
        }

        // TODO: Replace with actual user registration logic
        const newUser = {
            id: 'user_' + Date.now(),
            name: name,
            email: email,
            role: 'user',
            createdAt: new Date().toISOString()
        };

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: newUser,
            token: token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error during registration' 
        });
    }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, (req, res) => {
    try {
        // TODO: Replace with actual database queries
        const stats = {
            totalUsers: 156,
            totalMessages: 1240,
            totalQuotes: 89,
            totalJobs: 45,
            recentActivity: [
                { type: 'user_registered', message: 'New user registered', timestamp: new Date().toISOString() },
                { type: 'quote_submitted', message: 'New quote submitted', timestamp: new Date().toISOString() }
            ]
        };

        res.json({ 
            success: true,
            stats: stats,
            message: 'Dashboard data retrieved successfully'
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load dashboard data' 
        });
    }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        // TODO: Replace with actual database query
        const mockUsers = [
            {
                id: 'user_001',
                name: 'John Doe',
                email: 'john@example.com',
                role: 'user',
                status: 'active',
                createdAt: '2024-01-15T10:30:00Z'
            },
            {
                id: 'admin_001',
                name: 'Admin User',
                email: 'admin@steelconnect.com',
                role: 'admin',
                status: 'active',
                createdAt: '2024-01-01T00:00:00Z'
            },
            {
                id: 'user_002',
                name: 'Jane Smith',
                email: 'jane@example.com',
                role: 'user',
                status: 'suspended',
                createdAt: '2024-01-20T14:45:00Z'
            }
        ];

        res.json({ 
            success: true,
            users: mockUsers,
            total: mockUsers.length
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load users' 
        });
    }
});

app.put('/api/admin/users/:id/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Status must be "active" or "suspended"' 
            });
        }

        // TODO: Update user status in database
        console.log(`Updating user ${id} status to ${status}`);

        res.json({ 
            success: true,
            message: `User status updated to ${status}`,
            userId: id,
            newStatus: status
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update user status' 
        });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        
        // TODO: Delete user from database
        console.log(`Deleting user ${id}`);

        res.json({ 
            success: true,
            message: 'User deleted successfully',
            deletedUserId: id
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete user' 
        });
    }
});

app.get('/api/admin/quotes', authenticateToken, requireAdmin, (req, res) => {
    try {
        // TODO: Replace with actual database query
        const mockQuotes = [
            {
                id: 'quote_001',
                clientName: 'ABC Construction',
                clientEmail: 'contact@abc-construction.com',
                projectDescription: 'Steel frame for warehouse',
                totalCost: 45000,
                status: 'pending',
                createdAt: '2024-01-20T09:15:00Z'
            },
            {
                id: 'quote_002', 
                clientName: 'XYZ Builders',
                clientEmail: 'info@xyz-builders.com',
                projectDescription: 'Residential steel beams',
                totalCost: 28000,
                status: 'approved',
                createdAt: '2024-01-18T14:30:00Z'
            }
        ];

        res.json({ 
            success: true,
            quotes: mockQuotes,
            total: mockQuotes.length
        });
    } catch (error) {
        console.error('Get quotes error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load quotes' 
        });
    }
});

app.put('/api/admin/quotes/:id/approve', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        
        // TODO: Update quote status in database
        console.log(`Approving quote ${id} by ${req.user.email}`);

        res.json({ 
            success: true,
            message: 'Quote approved successfully',
            approvedQuoteId: id
        });
    } catch (error) {
        console.error('Approve quote error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to approve quote' 
        });
    }
});

app.put('/api/admin/quotes/:id/reject', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        // TODO: Update quote status in database
        console.log(`Rejecting quote ${id} by ${req.user.email}, reason: ${reason}`);

        res.json({ 
            success: true,
            message: 'Quote rejected',
            rejectedQuoteId: id,
            reason: reason || 'No reason provided'
        });
    } catch (error) {
        console.error('Reject quote error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reject quote' 
        });
    }
});

app.get('/api/admin/system-stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        res.json({
            success: true,
            stats: {
                serverUptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform,
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('System stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get system stats' 
        });
    }
});

// --- OTHER PORTAL ROUTES ---

// Jobs Routes
app.get('/api/jobs', (req, res) => {
    res.json({
        success: true,
        message: 'Jobs portal is working',
        jobs: [
            { id: 'job_001', title: 'Steel Fabricator', location: 'Mumbai', type: 'full-time' },
            { id: 'job_002', title: 'Welding Engineer', location: 'Delhi', type: 'contract' }
        ]
    });
});

app.post('/api/jobs', authenticateToken, (req, res) => {
    const { title, description, location } = req.body;
    res.status(201).json({
        success: true,
        message: 'Job created successfully',
        job: { id: 'job_' + Date.now(), title, description, location }
    });
});

// Quotes Routes  
app.get('/api/quotes', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Quotes portal is working',
        quotes: [
            { id: 'quote_001', project: 'Warehouse Steel Frame', amount: 45000 },
            { id: 'quote_002', project: 'Residential Beams', amount: 28000 }
        ]
    });
});

app.post('/api/quotes', (req, res) => {
    const { clientName, projectDescription, requirements } = req.body;
    res.status(201).json({
        success: true,
        message: 'Quote request submitted successfully',
        quoteId: 'quote_' + Date.now(),
        clientName,
        projectDescription
    });
});

// Messages Routes
app.get('/api/messages', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Messages portal is working', 
        messages: [
            { id: 'msg_001', from: 'client@example.com', subject: 'Project Inquiry', date: '2024-01-20' },
            { id: 'msg_002', from: 'vendor@example.com', subject: 'Material Quote', date: '2024-01-19' }
        ]
    });
});

app.post('/api/messages', (req, res) => {
    const { to, subject, message } = req.body;
    res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        messageId: 'msg_' + Date.now()
    });
});

// Estimation Routes
app.post('/api/estimation/calculate', (req, res) => {
    try {
        const { material, quantity, dimensions } = req.body;
        
        // Simple estimation calculation
        const baseRate = 50; // per unit
        const totalCost = quantity * baseRate;
        
        res.json({
            success: true,
            estimation: {
                material,
                quantity,
                dimensions,
                baseRate,
                totalCost,
                currency: 'INR',
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Estimation calculation failed'
        });
    }
});

// --- ERROR HANDLING ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
            success: false, 
            error: 'File too large. Maximum size is 50MB.' 
        });
    }
    
    res.status(error.status || 500).json({ 
        success: false, 
        error: error.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
    });
});

// --- 404 HANDLER ---
app.use('*', (req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`,
        method: req.method,
        availableRoutes: {
            auth: ['POST /api/auth/login', 'POST /api/auth/register'],
            admin: ['GET /api/admin/dashboard', 'GET /api/admin/users', 'GET /api/admin/quotes'],
            jobs: ['GET /api/jobs', 'POST /api/jobs'],
            quotes: ['GET /api/quotes', 'POST /api/quotes'],
            messages: ['GET /api/messages', 'POST /api/messages'],
            estimation: ['POST /api/estimation/calculate']
        },
        timestamp: new Date().toISOString()
    });
});

// --- EXPORT FOR VERCEL ---
module.exports = app;

// --- LOCAL DEVELOPMENT SERVER ---
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('🎉 SteelConnect Complete Server Started Successfully!');
        console.log(`📍 Server running on port ${PORT}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`⏰ Started at: ${new Date().toISOString()}`);
        
        console.log('\n📋 Environment Check:');
        console.log(`   MongoDB: ${process.env.MONGODB_URI ? '✅ Configured' : '⚠️ Missing (using mock data)'}`);
        console.log(`   JWT Secret: ${process.env.JWT_SECRET ? '✅ Configured' : '⚠️ Using fallback'}`);
        console.log(`   CORS Origin: ${process.env.CORS_ORIGIN ? '✅ Configured' : '⚠️ Using defaults'}`);
        
        console.log('\n🔗 Test these endpoints:');
        console.log(`   Health: http://localhost:${PORT}/health`);
        console.log(`   API Info: http://localhost:${PORT}/api`);
        console.log(`   Login: POST http://localhost:${PORT}/api/auth/login`);
        console.log(`   Admin Dashboard: GET http://localhost:${PORT}/api/admin/dashboard`);
        console.log('');
        console.log('📧 Test login credentials:');
        console.log('   Admin: admin@steelconnect.com / admin123');
        console.log('   User: user@steelconnect.com / user123');
        console.log('');
    });
}
