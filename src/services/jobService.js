
import { adminDb } from '../firebase.js'; // Assumes your firebase config is at 'src/firebase.js'

/**
 * Fetches a single job document from the Firestore 'jobs' collection.
 * @param {string} jobId The ID of the job to fetch.
 * @returns {Promise<object|null>} The job data object or null if not found.
 */
export async function getJobById(jobId) {
    try {
        const docRef = adminDb.collection('jobs').doc(jobId);
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log(`Job with ID ${jobId} not found in Firestore.`);
            return null;
        }
        // Return the job data including its ID
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error("Error fetching job by ID from Firestore:", error);
        throw new Error("Could not fetch job data.");
    }
}