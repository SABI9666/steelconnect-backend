// --- LOGIN ROUTE WITH DETAILED LOGGING ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('1. LOGIN PROCESS STARTED for:', email);

    if (!email || !password) {
      console.log('Error: Email or password missing.');
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    console.log('2. Input validation passed.');

    const usersRef = adminDb.collection('users');
    console.log('3. Searching for user in Firestore...');
    const userSnapshot = await usersRef.where('email', '==', email).limit(1).get();

    if (userSnapshot.empty) {
      console.log('Error: User not found in database.');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    console.log('4. User found.');

    const userData = userSnapshot.docs[0].data();
    const userDocId = userSnapshot.docs[0].id;

    console.log('5. Comparing submitted password with stored hash...');
    const isMatch = await bcrypt.compare(password, userData.password);

    if (!isMatch) {
      console.log('Error: Password comparison failed. Passwords do not match.');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    console.log('6. Passwords match! Login successful.');

    // Note: You should generate and return a JWT token here for a real application
    
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: userDocId,
        fullName: userData.fullName,
        email: userData.email,
        role: userData.role
      }
    });

  } catch (error) {
    console.error('CRITICAL LOGIN ERROR:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});