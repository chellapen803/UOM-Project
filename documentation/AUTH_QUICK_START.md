# Authentication Quick Start

## Overview

The SecurityPlus Bot application now uses Firebase Authentication with role-based access control:

- **Regular Users**: Can access the chat interface
- **Superusers**: Can access chat, upload documents, and view the graph

## Quick Setup

### 1. Install Dependencies

```bash
# Frontend (already installed)
npm install firebase

# Backend
cd backend
npm install firebase-admin
```

### 2. Configure Environment Variables

**Frontend** (`.env` in root):
```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

**Backend** (`.env` in `backend/`):
```env
# Option 1: Service account JSON as string (recommended for Vercel)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Option 2: Path to service account file (for local dev)
FIREBASE_SERVICE_ACCOUNT_PATH=../serviceAccountKey.json
```

### 3. Create Your First Superuser

After signing up with your first account:

```bash
cd backend
node scripts/createSuperuser.js your-email@example.com
```

Or manually in Firestore:
- Collection: `users`
- Document ID: `<user-uid-from-authentication>`
- Field: `role` = `"superuser"`

## Features

✅ Email/Password authentication  
✅ Role-based access control (user/superuser)  
✅ Protected frontend routes  
✅ Protected backend API endpoints  
✅ Automatic token refresh  
✅ Password reset functionality  

## Protected Routes

### Frontend
- **Upload Page**: Superuser only
- **Graph View**: Superuser only
- **Chat**: All authenticated users

### Backend
- `/api/graph/save`: Superuser only
- `/api/documents/save`: Superuser only
- `/api/graph/load`: Authenticated users
- `/api/documents/list`: Authenticated users
- `/api/rag/chat`: Authenticated users
- `/api/rag/query`: Authenticated users

## User Management

### Create Superuser
```bash
node backend/scripts/createSuperuser.js email@example.com
```

### Change User Role
Update the `role` field in Firestore `users` collection:
- `"user"` - Regular user
- `"superuser"` - Admin access

## Troubleshooting

**"Unauthorized: No token provided"**
- User needs to log in first

**"Forbidden: Superuser access required"**
- User's role in Firestore must be `"superuser"`

**"Firebase: Error (auth/configuration-not-found)"**
- Check all frontend environment variables are set
- Restart dev server after adding env vars

For detailed setup instructions, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)

