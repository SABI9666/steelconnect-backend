import express from 'express';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// GET ALL JOBS
router.get('/', async (req, res) => {
    try {
        const jobsRef = adminDb.collection('jobs');
        // Temporarily removed sorting to test the query
        const snapshot = await jobsRef.get(); 
        
        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(jobs);
    } catch (error) {
        console.error("ERROR FETCHING JOBS:", error);
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
        const newJob = { title, description, budget, deadline, skills: skills || [], posterId: userId, posterName: userFullName, attachment: attachment || '', link: link || '', status: 'active', createdAt: new Date().toISOString() };
        const docRef = await adminDb.collection('jobs').add(newJob);
        res.status(201).json({ message: 'Job posted successfully!', jobId: docRef.id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to post new job.' });
    }
});

// DELETE A JOB
router.delete('/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const jobRef = adminDb.collection('jobs').doc(jobId);
        const doc = await jobRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        const { attachment } = doc.data();
        if (attachment) {
            const filePath = path.join('uploads', path.basename(attachment));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await jobRef.delete();
        res.status(200).json({ message: 'Job and attachment deleted successfully.' });
    } catch (error) {
        console.error("DELETE JOB ERROR:", error);
        res.status(500).json({ error: 'Failed to delete job.' });
    }
});

export default router;