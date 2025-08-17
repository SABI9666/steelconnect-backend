/ createAdminUser.js - Run this script once to create an admin user
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import Firebase Admin SDK
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function createAdminUser() {
  try {
    console.log('🔥 Initializing Firebase...');
    
    // Initialize Firebase Admin SDK
    const app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });

    const db = getFirestore(app);
    console.log('✅ Firebase initialized successfully');

    const adminEmail = 'cn.sabin623@gmail.com';
    const adminPassword = 'Sabin@9666';
    const adminName = 'System Administrator';

    console.log('🔍 Checking if admin user already exists...');

    // Check if admin already exists
    const existingAdmin = await db.collection('users')
      .where('email', '==', adminEmail.toLowerCase())
      .get();

    if (!existingAdmin.empty) {
      console.log('❌ Admin user already exists with this email.');
      console.log('📋 Existing admin details:');
      existingAdmin.forEach(doc => {
        const data = doc.data();
        console.log(`   ID: ${doc.id}`);
        console.log(`   Email: ${data.email}`);
        console.log(`   Type: ${data.type}`);
        console.log(`   Active: ${data.isActive}`);
      });
      return;
    }

    console.log('🔐 Hashing password...');
    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Create admin user object
    const adminUser = {
      email: adminEmail.toLowerCase().trim(),
      password: hashedPassword,
      name: adminName.trim(),
      type: 'admin', // This is crucial!
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };

    console.log('💾 Saving admin user to Firebase...');
    // Save to database
    const adminRef = await db.collection('users').add(adminUser);
    
    console.log('✅ Admin user created successfully!');
    console.log('📋 Admin user details:');
    console.log('   Email:', adminEmail);
    console.log('   Password:', adminPassword);
    console.log('   Firebase ID:', adminRef.id);
    console.log('   Type: admin');
    console.log('⚠️  Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  }
}

// Run the function
createAdminUser();
