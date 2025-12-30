import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
// Use environment variables if available, otherwise use hardcoded values for development
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAdzsQX5Q8yAsB51lno9OjunSieaOV-oGI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "comptia-security-plus-chatbot.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "comptia-security-plus-chatbot",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "comptia-security-plus-chatbot.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "311344258712",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:311344258712:web:cb3c47956c1a172eb27aed",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;

