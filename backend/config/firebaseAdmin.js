import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenv.config();

// Initialize Firebase Admin SDK
// You can either use a service account JSON file or environment variables
let firebaseAdmin;

if (!admin.apps.length) {
  try {
    // Option 1: Use service account from environment variable (for Vercel/serverless)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      firebaseAdmin = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    // Option 2: Use service account file (for local development)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Read the service account file synchronously
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const serviceAccountPath = resolve(__dirname, '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      firebaseAdmin = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    // Option 3: Use default credentials (for Google Cloud environments)
    else {
      firebaseAdmin = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    throw error;
  }
} else {
  firebaseAdmin = admin.app();
}

export default firebaseAdmin;

