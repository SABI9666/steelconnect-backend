import express from 'express';

const router = express.Router();

// GET /firebase/config - Get Firebase configuration
router.get('/config', (req, res) => {
  // Return Firebase config (without sensitive keys)
  res.json({
    message: 'Firebase configuration',
    config: {
      apiKey: process.env.FIREBASE_API_KEY || 'your-api-key',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'your-project.firebaseapp.com',
      projectId: process.env.FIREBASE_PROJECT_ID || 'your-project-id',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'your-project.appspot.com',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
      appId: process.env.FIREBASE_APP_ID || 'your-app-id'
    }
  });
});

// POST /firebase/token/verify - Verify Firebase ID token
router.post('/token/verify', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }
    
    // Here you would verify the Firebase ID token
    // const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Mock response for now
    res.json({
      message: 'Token verified successfully',
      user: {
        uid: 'firebase-user-123',
        email: 'user@example.com',
        verified: true
      }
    });
    
  } catch (error) {
    console.error('Firebase token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /firebase/notifications/send - Send push notification
router.post('/notifications/send', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    
    if (!token || !title || !body) {
      return res.status(400).json({ 
        error: 'Token, title, and body are required' 
      });
    }
    
    // Here you would send the notification using Firebase Admin SDK
    // const message = {
    //   notification: { title, body },
    //   data: data || {},
    //   token
    // };
    // const response = await admin.messaging().send(message);
    
    // Mock response for now
    res.json({
      message: 'Notification sent successfully',
      messageId: 'mock-message-id-' + Date.now()
    });
    
  } catch (error) {
    console.error('Firebase notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// GET /firebase/users/:uid - Get Firebase user info
router.get('/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    
    // Here you would get user from Firebase Auth
    // const userRecord = await admin.auth().getUser(uid);
    
    // Mock response for now
    res.json({
      message: 'Firebase user info',
      user: {
        uid,
        email: 'user@example.com',
        displayName: 'Test User',
        photoURL: null,
        emailVerified: true,
        creationTime: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Firebase get user error:', error);
    res.status(404).json({ error: 'User not found' });
  }
});

export default router;
