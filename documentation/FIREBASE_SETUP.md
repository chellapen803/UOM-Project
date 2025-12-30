# Firebase Authentication Setup Guide

This guide will help you set up Firebase Authentication for the NeuroGraph application.

## Prerequisites

1. A Firebase project (create one at https://console.firebase.google.com/)
2. Firebase Authentication enabled in your Firebase project
3. Firestore Database enabled

## Step 1: Frontend Configuration

### 1.1 Get Firebase Configuration

1. Go to Firebase Console → Project Settings → General
2. Scroll down to "Your apps" section
3. Click on the web app icon (`</>`) or add a new web app
4. Copy the Firebase configuration object

### 1.2 Set Environment Variables

Create a `.env` file in the root directory with your Firebase config:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

## Step 2: Backend Configuration

### 2.1 Create Service Account

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file (keep it secure!)

### 2.2 Set Backend Environment Variables

For **local development**, you have two options:

**Option A: Use service account file path**
```env
FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/serviceAccountKey.json
```

**Option B: Use service account JSON as environment variable** (recommended for Vercel/serverless)
```env
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

For **Vercel deployment**, use Option B and add `FIREBASE_SERVICE_ACCOUNT` to your Vercel environment variables.

## Step 3: Enable Authentication Methods

1. Go to Firebase Console → Authentication → Sign-in method
2. Enable "Email/Password" provider
3. (Optional) Enable other providers as needed

## Step 4: Set Up Firestore Security Rules

Go to Firebase Console → Firestore Database → Rules and add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read their own data
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can only read/write their own chat messages
    match /chats/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Only authenticated users can read/write (fallback for other collections)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 5: Create a Superuser

After creating your first user account, you need to manually set their role to `superuser` in Firestore:

1. Go to Firebase Console → Firestore Database
2. Create a collection named `users`
3. Create a document with the user's UID (from Authentication)
4. Add a field `role` with value `"superuser"`

Alternatively, you can use the Firebase Console to update an existing user document.

### Example User Document Structure:

```
Collection: users
Document ID: <user-uid>
Fields:
  - email: "admin@example.com"
  - role: "superuser"
  - displayName: "Admin User"
  - createdAt: <timestamp>
  - updatedAt: <timestamp>
```

## Step 6: Install Backend Dependencies

```bash
cd backend
npm install firebase-admin
```

## Step 7: Test the Setup

1. Start your development server
2. Try to sign up with a new account
3. Check Firestore to see if the user document was created
4. Manually set one user's role to `superuser` in Firestore
5. Log in as the superuser and verify you can access the upload page
6. Log in as a regular user and verify you can only access the chat

## Troubleshooting

### "Firebase: Error (auth/configuration-not-found)"
- Make sure all environment variables are set correctly
- Check that your `.env` file is in the root directory
- Restart your development server after adding environment variables

### "Unauthorized: Invalid token"
- Check that Firebase Admin SDK is properly configured
- Verify the service account JSON is correct
- Ensure the service account has proper permissions

### "Forbidden: Superuser access required"
- Verify the user's role is set to `"superuser"` in Firestore
- Check that the user document exists in the `users` collection
- Ensure the document ID matches the user's UID from Authentication

### Backend can't find Firebase Admin
- Make sure `firebase-admin` is installed in the backend directory
- Verify the service account configuration in `backend/config/firebaseAdmin.js`
- Check environment variables are loaded correctly

## Security Notes

1. **Never commit** your service account JSON file or `.env` file to version control
2. Add `.env` and `serviceAccountKey.json` to `.gitignore`
3. Use environment variables for all sensitive configuration
4. Regularly rotate your service account keys
5. Use Firestore security rules to protect your data

## Role Management

To change a user's role:

1. Go to Firestore Database
2. Navigate to `users` collection
3. Find the user document (by UID)
4. Update the `role` field to either `"user"` or `"superuser"`

You can also create a script to manage roles programmatically if needed.

