import express from 'express'; // Corrected
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Get all jobs endpoint - to be implemented' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create job endpoint - to be implemented' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get job ${req.params.id} endpoint - to be implemented` });
});

export default router; // Corrected
