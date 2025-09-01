import express from 'express';
import { authenticateToken, isContractor } from '../middleware/auth.js'; // Adjust path if needed
// You will need a controller to handle the logic
// import { getMyEstimations, createEstimationRequest } from '../controllers/estimationController.js';

const router = express.Router();

// Mock controller functions for demonstration
// Replace these with your actual controller logic
const getMyEstimations = async (req, res) => {
    // Logic to fetch estimations for the logged-in contractor (req.user.id)
    res.json({ estimations: [{ projectTitle: 'Sample Project', status: 'Pending', _id: '123' }] });
};

const createEstimationRequest = async (req, res) => {
    // Logic to handle file uploads and create a new estimation request
    console.log(req.body); // form fields
    console.log(req.files); // uploaded files
    res.json({ success: true, message: 'Estimation created successfully.' });
};

// GET /api/contractor/estimations
router.get('/estimations', authenticateToken, isContractor, getMyEstimations);

// POST /api/contractor/estimations
router.post('/estimations', authenticateToken, isContractor, createEstimationRequest);


// FIX: Use a default export at the end of the file
export default router;
