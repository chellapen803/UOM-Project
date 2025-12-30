# Firebase Setup Instructions

Your Firebase configuration has been added to the code. Here's what you need to do next:

## ✅ Frontend Configuration (Already Done)

Your Firebase config should be in `config/firebase.ts`. For production, you should use environment variables instead of hardcoding credentials.

### Optional: Create `.env` file (recommended for production)

Create a `.env` file in the root directory:

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
```

## 🔧 Backend Configuration (Required)

You need to set up Firebase Admin SDK for the backend to verify authentication tokens.

### Step 1: Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/project/your-project-id/settings/serviceaccounts/adminsdk)
2. Click **"Generate new private key"**
3. Download the JSON file (keep it secure!)

### Step 2: Configure Backend

**Option A: Use Environment Variable (Recommended for Vercel)**

1. Open the downloaded JSON file
2. Copy the entire JSON content
3. Create `backend/.env` file:
```env
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```
   (Replace with your actual JSON, all on one line)

**Option B: Use File Path (For Local Development)**

1. Place the downloaded JSON file in the project root (or backend directory)
2. Name it `serviceAccountKey.json`
3. Create `backend/.env` file:
```env
FIREBASE_SERVICE_ACCOUNT_PATH=../serviceAccountKey.json
```

### Step 3: Install Backend Dependencies

```bash
cd backend
npm install firebase-admin
```

## 🔐 Enable Authentication

1. Go to [Firebase Console → Authentication](https://console.firebase.google.com/project/your-project-id/authentication)
2. Click **"Get started"** if not already enabled
3. Go to **"Sign-in method"** tab
4. Enable **"Email/Password"** provider
5. Click **"Save"**

## 📝 Create Your First Superuser

1. Start your frontend: `npm run dev`
2. Sign up with your email and password
3. After signing up, run this command to make yourself a superuser:

```bash
cd backend
node scripts/createSuperuser.js your-email@example.com
```

Or manually in Firestore:
- Go to Firestore Database
- Click **"Start collection"**
- Collection ID: `users`
- Document ID: `<your-user-uid>` (get this from Authentication → Users)
- Add field: `role` = `"superuser"` (type: string)
- Add field: `email` = `"your-email@example.com"` (type: string)

## 🧪 Test the Setup

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `npm run dev`
3. Try to sign up/login
4. As a regular user, you should only see the Chat view
5. After making yourself a superuser, you should see Upload and Graph views

## 🚨 Troubleshooting

**"Error initializing Firebase Admin"**
- Make sure you've installed `firebase-admin`: `cd backend && npm install firebase-admin`
- Check that your `backend/.env` file has the correct `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_PATH`

**"Unauthorized: Invalid token"**
- Make sure Authentication is enabled in Firebase Console
- Check that the service account has proper permissions

**"Forbidden: Superuser access required"**
- Make sure you've set your role to `"superuser"` in Firestore
- The document should be in the `users` collection with your UID as the document ID

