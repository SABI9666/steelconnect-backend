import express from 'express';
import {
  createJob,
  getAllJobs,
  getJobById,
  deleteJob,
  getJobsByUserId // <-- Import the new controller
} from '../controllers/jobController.js';
import { authenticateToken, isContractor } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.get('/', getAllJobs);
router.get('/:id', getJobById);

// Protected routes
router.get('/user/:userId', authenticateToken, getJobsByUserId); // <-- Add the new route

router.post(
  '/', 
  authenticateToken, 
  isContractor, 
  upload.single('attachment'),
  createJob
);

router.delete('/:id', authenticateToken, isContractor, deleteJob);

export default router;