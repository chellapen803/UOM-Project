/**
 * Script to create or update a user to superuser role
 * 
 * Usage:
 *   node scripts/createSuperuser.js <user-email>
 * 
 * Or set the email as environment variable:
 *   USER_EMAIL=admin@example.com node scripts/createSuperuser.js
 */

import admin from '../config/firebaseAdmin.js';
import dotenv from 'dotenv';

dotenv.config();

const db = admin.firestore();

async function createSuperuser(email) {
  if (!email) {
    console.error('Error: Email is required');
    console.log('Usage: node scripts/createSuperuser.js <user-email>');
    process.exit(1);
  }

  try {
    // Find user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    console.log(`Found user: ${email} (UID: ${uid})`);

    // Update or create user document in Firestore
    const userRef = db.collection('users').doc(uid);
    await userRef.set({
      email: email,
      role: 'superuser',
      displayName: userRecord.displayName || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`✅ Successfully set ${email} as superuser!`);
    console.log(`   User can now access upload and graph views.`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ Error: User with email ${email} not found`);
      console.log('   Make sure the user has signed up first.');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// Get email from command line argument or environment variable
const email = process.argv[2] || process.env.USER_EMAIL;

createSuperuser(email);

