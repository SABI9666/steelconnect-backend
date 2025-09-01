import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticate } from '../middleware/auth.js'; // Assuming you have auth middleware

// Get a reference to the Firestore database
// This assumes Firebase Admin SDK has been initialized in your main server file
const db = getFirestore();

// Controller function to get estimations for a specific contractor
const getEstimationsByContractorEmail = async (req, res) => {
    try {
        const { email } = req.params;
        console.log(`✅ Fetching estimations for contractor email from Firestore: ${email}`);

        const estimationsRef = db.collection('estimations');
        const snapshot = await estimationsRef.where('contractorEmail', '==', email).get();

        if (snapshot.empty) {
            console.log(`ℹ️ No estimations found for contractor ${email}`);
            // Return an empty array instead of 404 to handle cases where a user has no estimations yet
            return res.json({ success: true, estimations: [] });
        }

        const estimations = [];
        snapshot.forEach(doc => {
            estimations.push({ id: doc.id, ...doc.data() });
        });

        res.json({ success: true, estimations });

    } catch (error) {
        console.error('❌ Error in getEstimationsByContractorEmail:', error);
        res.status(500).json({ success: false, error: 'Server error while fetching estimations.' });
    }
};

// Controller function to create a new estimation
const createEstimation = async (req, res) => {
    try {
        console.log('✅ Creating a new estimation in Firestore...');
        const { projectTitle, contractorEmail } = req.body; // Add other fields as needed
        
        // Basic validation
        if (!projectTitle || !contractorEmail) {
            return res.status(400).json({ success: false, error: 'Missing required fields.' });
        }

        const newEstimation = {
            projectTitle,
            contractorEmail,
            status: 'Submitted', // Default status
            createdAt: new Date().toISOString(),
            // You can add other fields from req.body here
        };

        const docRef = await db.collection('estimations').add(newEstimation);
        
        res.status(201).json({ 
            success: true, 
            message: 'Estimation created successfully.',
            estimationId: docRef.id 
        });

    } catch (error) {
        console.error('❌ Error in createEstimation:', error);
        res.status(500).json({ success: false, error: 'Server error while creating estimation.' });
    }
};


const router = express.Router();

// --- Firestore-backed Routes ---
// This route will now correctly handle requests like:
// GET /api/estimation/contractor/cn.sabin623@gmail.com
router.get('/contractor/:email', authenticate, getEstimationsByContractorEmail);

// Route to handle new estimation submissions
// POST /api/estimation/
router.post('/', authenticate, createEstimation);


export default router;

