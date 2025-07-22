const { db, admin } = require('../config/firebase');
const { uploadToFirebase } = require('../middleware/upload');

const createQuote = async (req, res, next) => {
  try {
    if (req.user.type !== 'designer') {
      return res.status(403).json({ success: false, message: 'Only designers can submit quotes.' });
    }
    const { jobId, quoteAmount, timeline, description } = req.body;
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Associated RFQ not found.' });
    }

    let attachments = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToFirebase(file, 'quote-proposals'));
      attachments = await Promise.all(uploadPromises);
    }

    const quoteData = {
      jobId,
      jobTitle: jobDoc.data().title,
      designerId: req.user.id,
      designerName: req.user.name,
      contractorId: jobDoc.data().posterId,
      quoteAmount: parseFloat(quoteAmount),
      timeline: parseInt(timeline),
      description,
      attachments,
      status: 'submitted',
      createdAt: new Date(),
    };

    const quoteRef = await db.collection('quotes').add(quoteData);
    await jobRef.update({ quotesCount: admin.firestore.FieldValue.increment(1) });
    
    res.status(201).json({ success: true, message: 'Quote submitted successfully', quote: { id: quoteRef.id, ...quoteData } });
  } catch (error) {
    next(error);
  }
};

const getQuotesForJob = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists || jobDoc.data().posterId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        const quotesSnapshot = await db.collection('quotes').where('jobId', '==', jobId).orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, quotes });
    } catch (error) {
        next(error);
    }
};

module.exports = { createQuote, getQuotesForJob };