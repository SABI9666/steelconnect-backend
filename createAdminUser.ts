// createAdminUser.js - Run this script once to create an admin user

import bcrypt from 'bcrypt';
import { adminDb } from './src/config/firebase.js'; // Adjust this path to match your firebase config location

async function createAdminUser() {
  try {
    const adminEmail = 'admin@steelconnect.com'; // Change to your desired email
    const adminPassword = 'AdminPass123!'; // Change to your desired password
    const adminName = 'System Administrator';

    // Check if admin already exists
    const existingAdmin = await adminDb.collection('users')
      .where('email', '==', adminEmail.toLowerCase())
      .get();

    if (!existingAdmin.empty) {
      console.log('❌ Admin user already exists with this email.');
      return;
    }

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

    // Save to database
    const adminRef = await adminDb.collection('users').add(adminUser);
    
    console.log('✅ Admin user created successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('ID:', adminRef.id);
    console.log('⚠️  Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
}

// Run the function
createAdminUser();