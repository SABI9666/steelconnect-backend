import express from 'express';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// GET ALL JOBS
router.get('/', async (req, res) => {
    try {
        const jobsRef = adminDb.collection('jobs');
        const snapshot = await jobsRef.orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            return res.status(200).json([]);
        }
        const jobs = [];
        snapshot.forEach(doc => {
            jobs.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch jobs.' });
    }
});

// POST A NEW JOB
router.post('/', async (req, res) => {
    try {
        const { title, description, budget, deadline, skills, userId, userFullName, attachment, link } = req.body;
        if (!title || !description || !budget || !deadline || !userId) {
            return res.status(400).json({ error: 'Missing required job fields.' });
        }
        const newJob = {
            title,
            description,
            budget,
            deadline,
            skills: skills || [],
            posterId: userId,
            posterName: userFullName,
            attachment: attachment || '',
            link: link || '',
            status: 'active',
            createdAt: new Date().toISOString(),
        };
        const docRef = await adminDb.collection('jobs').add(newJob);
        res.status(201).json({ message: 'Job posted successfully!', jobId: docRef.id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to post new job.' });
    }
});

// You would add a POST route for quotes here, for example:
// router.post('/:jobId/quotes', ...);

export default router;