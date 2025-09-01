import express from 'express';
import { authenticateToken, isContractor } from '../middleware/auth.js';

const router = express.Router();

const getMyEstimations = async (req, res) => {
    const contractorEmail = req.params.email; // Get email from URL parameter
    // Logic to fetch estimations for the contractor with this email
    res.json({ estimations: [{ projectTitle: 'Sample Project', status: 'Pending', _id: '123' }] });
};

const createEstimationRequest = async (req, res) => {
    // Logic to handle file uploads and create a new estimation request
    console.log(req.body);
    console.log(req.files);
    res.json({ success: true, message: 'Estimation created successfully.' });
};

// Update routes to match frontend calls
// GET /api/estimation/contractor/:email
router.get('/contractor/:email', authenticateToken, isContractor, getMyEstimations);

// POST /api/estimation/contractor/submit
router.post('/contractor/submit', authenticateToken, isContractor, createEstimationRequest);

export default router;
