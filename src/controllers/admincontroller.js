import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js'; // Ensure you have this configured

// --- ADMIN AUTHENTICATION ---
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const usersRef = adminDb.collection('users');
        const userSnapshot = await usersRef.where('email', '==', email.toLowerCase().trim()).where('role', '==', 'admin').limit(1).get();

        if (userSnapshot.empty) {
            return res.status(401).json({ error: 'Invalid credentials or not an admin.' });
        }

        const adminUserDoc = userSnapshot.docs[0];
        const adminUserData = adminUserDoc.data();

        const isMatch = await bcrypt.compare(password, adminUserData.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const payload = {
            userId: adminUserDoc.id,
            email: adminUserData.email,
            role: adminUserData.role
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '1d' });

        res.status(200).json({
            message: 'Admin login successful',
            token: token
        });

    } catch (error) {
        console.error('ADMIN LOGIN ERROR:', error);
        res.status(500).json({ error: 'Server error during admin login.' });
    }
};


// --- DASHBOARD ---
export const getDashboardStats = async (req, res) => {
    try {
        const usersPromise = adminDb.collection('users').get();
        const jobsPromise = adminDb.collection('jobs').get();
        const quotesPromise = adminDb.collection('quotes').get();
        const messagesPromise = adminDb.collection('messages').get(); // Assuming 'messages' collection

        const [usersSnapshot, jobsSnapshot, quotesSnapshot, messagesSnapshot] = await Promise.all([
            usersPromise,
            jobsPromise,
            quotesPromise,
            messagesPromise
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers: usersSnapshot.size,
                totalJobs: jobsSnapshot.size,
                totalQuotes: quotesSnapshot.size,
                totalMessages: messagesSnapshot.size,
            }
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats." });
    }
};

// --- USER MANAGEMENT ---
export const getAllUsers = async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...data } = doc.data(); // Exclude password
            return { id: doc.id, ...data };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error("Error fetching all users:", error);
        res.status(500).json({ error: "Failed to fetch users." });
    }
};

// --- CONTENT MANAGEMENT ---
export const getAllJobs = async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, jobs });
    } catch (error) {
        console.error("Error fetching all jobs:", error);
        res.status(500).json({ error: "Failed to fetch jobs." });
    }
};

export const getAllQuotes = async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, quotes });
    } catch (error) {
        console.error("Error fetching all quotes:", error);
        res.status(500).json({ error: "Failed to fetch quotes." });
    }
};

export const getAllMessages = async (req, res) => {
    try {
        // This is a simplified example. A real implementation might involve more complex queries.
        const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').limit(100).get();
        const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, messages });
    } catch (error) {
        console.error("Error fetching all messages:", error);
        res.status(500).json({ error: "Failed to fetch messages." });
    }
};


// --- FEATURE MANAGEMENT ---
export const createSubscription = async (req, res) => {
    try {
        const { userId, value, type } = req.body;
        if (!userId || !value || !type) {
            return res.status(400).json({ error: "User ID, value, and type are required." });
        }

        const subscriptionData = {
            userId,
            value: parseFloat(value),
            type,
            createdAt: new Date().toISOString(),
            status: 'active'
        };

        await adminDb.collection('subscriptions').add(subscriptionData);
        res.status(201).json({ success: true, message: 'Subscription created successfully.' });

    } catch (error) {
        console.error("Error creating subscription:", error);
        res.status(500).json({ error: "Failed to create subscription." });
    }
};

export const uploadResultForContractor = async (req, res) => {
    try {
        const { contractorId } = req.body;
        const resultFile = req.file; // From multer middleware

        if (!contractorId || !resultFile) {
            return res.status(400).json({ error: "Contractor ID and a file are required." });
        }

        // In a real app, you would upload the file to a storage service (like Firebase Storage)
        // and save the URL in the database.
        const fileUrl = resultFile.path; // Placeholder for actual file URL

        const resultData = {
            contractorId,
            fileUrl,
            uploadedAt: new Date().toISOString(),
            fileName: resultFile.originalname
        };

        await adminDb.collection('results').add(resultData);

        // You could also trigger a notification to the contractor here.

        res.status(201).json({ success: true, message: 'Result uploaded successfully.', data: resultData });

    } catch (error) {
        console.error("Error uploading result:", error);
        res.status(500).json({ error: "Failed to upload result." });
    }
};
