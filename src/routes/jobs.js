import express from 'express';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- GET ALL JOBS ---
// This endpoint will be called by the frontend to display all available jobs.
router.get('/', async (req, res) => {
    try {
        const jobsRef = adminDb.collection('jobs');
        const snapshot = await jobsRef.orderBy('createdAt', 'desc').get();

        if (snapshot.empty) {
            return res.status(200).json([]); // Return empty array if no jobs
        }

        const jobs = [];
        snapshot.forEach(doc => {
            jobs.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(jobs);
    } catch (error) {
        console.error('ERROR FETCHING JOBS:', error);
        res.status(500).json({ error: 'Failed to fetch jobs.' });
    }
});

// --- POST A NEW JOB ---
// This endpoint will be called when a contractor submits the "Post Job" form.
router.post('/', async (req, res) => {
    try {
        const { title, description, budget, deadline, skills, userId, userFullName } = req.body;

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
            status: 'active',
            createdAt: new Date().toISOString(),
        };

        const jobsRef = adminDb.collection('jobs');
        const docRef = await jobsRef.add(newJob);

        res.status(201).json({ message: 'Job posted successfully!', jobId: docRef.id });

    } catch (error) {
        console.error('ERROR POSTING JOB:', error);
        res.status(500).json({ error: 'Failed to post new job.' });
    }
});

export default router;