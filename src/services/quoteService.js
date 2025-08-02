import { adminDb } from '../firebase.js'; // Assumes your firebase config is at 'src/firebase.js'

/**
 * Fetches a single quote document from the Firestore 'quotes' collection.
 * @param {string} quoteId The ID of the quote to fetch.
 * @returns {Promise<object|null>} The quote data object or null if not found.
 */
export async function getQuoteById(quoteId) {
    try {
        const docRef = adminDb.collection('quotes').doc(quoteId);
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log(`Quote with ID ${quoteId} not found in Firestore.`);
            return null;
        }
        // Return the quote data including its ID
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error("Error fetching quote by ID from Firestore:", error);
        throw new Error("Could not fetch quote data.");
    }
}