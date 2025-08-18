import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- Admin Login Route ---
router.post('/login/admin', async (req, res) => {
  try {
    console.log('--- NEW ADMIN LOGIN ATTEMPT ---');
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Login failed: Missing email or password.');
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    console.log(`Step 1: Received login request for email: ${email}`);

    // Method 1: Environment Variable Admin (This part is for a backup admin)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword && email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
      console.log('✅ Success via environment variable admin.');
      // ... same token logic as before
      // ...
      return res.status(200).json({ /* ... user data ... */ });
    }
    console.log('Step 2: Not an environment variable admin. Checking Firestore...');


    // Method 2: Database Admin Check (This is the primary method)
    if (!adminDb) {
      console.error('❌ FATAL: adminDb is not available! Check firebase.js initialization.');
      return res.status(500).json({ error: 'Database service is not available.' });
    }
    
    console.log('Step 3: Querying the "users" collection...');
    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef
      .where('email', '==', email.toLowerCase().trim())
      .where('type', '==', 'admin')
      .limit(1)
      .get();
    
    console.log(`Step 4: Firestore query completed. Found ${userSnapshot.size} matching document(s).`);

    if (userSnapshot.empty) {
      console.log('❌ Login failed: No user found in Firestore with that email and type="admin".');
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    console.log('Step 5: User document found. Checking password...');
    const adminDoc = userSnapshot.docs[0];
    const adminData = adminDoc.data();

    const isMatch = await bcrypt.compare(password, adminData.password);

    if (!isMatch) {
      console.log('❌ Login failed: Password does not match.');
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    console.log('✅ Step 6: Password matches! Login successful.');
    
    // Create JWT payload and send response...
    const payload = {
      userId: adminDoc.id,
      email: adminData.email,
      type: 'admin',
      name: adminData.name,
      role: 'admin'
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your_default_secret_key_change_in_production',
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Admin login successful',
      success: true,
      token: token,
      user: {
        id: adminDoc.id,
        name: adminData.name,
        email: adminData.email,
        type: 'admin',
        role: 'admin',
      }
    });

  } catch (error) {
    console.error('🔴 CATASTROPHIC ERROR in /login/admin route:', error);
    res.status(500).json({ 
      error: 'A server error occurred during admin login.',
      details: error.message
    });
  }
});


// ... (rest of your registration and regular user login routes)


export default router;
