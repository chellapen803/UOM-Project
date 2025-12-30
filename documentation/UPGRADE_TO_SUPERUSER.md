# How to Upgrade a User to Superuser (Admin)

There are two ways to upgrade a user to superuser role in Firebase:

## Method 1: Using Firebase Console (Visual Guide)

### Step 1: Get the User's UID

1. Go to [Firebase Console → Authentication → Users](https://console.firebase.google.com/project/comptia-security-plus-chatbot/authentication/users)
2. Find the user you want to upgrade
3. Click on the user to see their details
4. **Copy the UID** (it looks like: `abc123def456ghi789...`)

### Step 2: Create/Update User Document in Firestore

1. Go to [Firestore Database](https://console.firebase.google.com/project/comptia-security-plus-chatbot/firestore)
2. Check if a `users` collection exists:
   - If it exists, skip to step 3
   - If it doesn't exist, click **"+ Start collection"**

3. **If creating new collection:**
   - Collection ID: `users`
   - Click **"Next"**
   - Document ID: Paste the **UID** you copied
   - Click **"Next"**

4. **Add fields:**
   - Field name: `email`
     - Type: `string`
     - Value: `user@example.com` (the user's email)
   - Click **"Add field"**
   - Field name: `role`
     - Type: `string`
     - Value: `superuser` ⚠️ **Important: Must be exactly "superuser"**
   - Click **"Add field"** (optional)
   - Field name: `createdAt`
     - Type: `timestamp`
     - Value: Click to set current time
   - Click **"Save"**

5. **If collection already exists:**
   - Click on the `users` collection
   - Click **"+ Add document"**
   - Document ID: Paste the **UID**
   - Add the same fields as above
   - Click **"Save"**

### Step 3: Verify

- The document should appear in the `users` collection
- The `role` field should show `superuser`
- The user should now have admin access after logging in again

---

## Method 2: Using Command Line Script (Faster)

### Prerequisites

1. Make sure you have the Firebase service account configured in `backend/.env`
2. Install dependencies: `cd backend && npm install firebase-admin`

### Run the Script

```bash
cd backend
node scripts/createSuperuser.js user-email@example.com
```

**Example:**
```bash
node scripts/createSuperuser.js kaleinayagen.chellapen1@umail.uom.ac.mu
```

### Expected Output

```
Found user: kaleinayagen.chellapen1@umail.uom.ac.mu (UID: abc123...)
✅ Successfully set kaleinayagen.chellapen1@umail.uom.ac.mu as superuser!
   User can now access upload and graph views.
```

---

## Method 3: Update Existing User Document

If the user document already exists in Firestore:

1. Go to [Firestore Database](https://console.firebase.google.com/project/comptia-security-plus-chatbot/firestore)
2. Navigate to `users` collection
3. Find the user document (by UID or email)
4. Click on the document
5. Click on the `role` field
6. Change the value from `user` to `superuser`
7. Click **"Update"**

---

## Troubleshooting

### User still can't access admin features?

1. **Check the role field:**
   - Must be exactly `"superuser"` (lowercase, no spaces)
   - Not `"admin"`, `"Admin"`, or `"SUPERUSER"`

2. **Check the document ID:**
   - Must match the user's UID from Authentication
   - Not their email address

3. **Refresh the app:**
   - User needs to log out and log back in
   - Or refresh the browser page

4. **Check Firestore rules:**
   - Make sure Firestore security rules allow reading user documents
   - Default rules should work, but verify if you customized them

### Script gives "user not found" error?

- Make sure the user has signed up first
- Check the email address is correct
- Verify the user exists in Authentication → Users

### Script gives "Error initializing Firebase Admin"?

- Check that `backend/.env` has `FIREBASE_SERVICE_ACCOUNT` set
- Verify the service account JSON is valid
- Make sure `firebase-admin` is installed: `npm install firebase-admin`

---

## Quick Reference

**Collection:** `users`  
**Document ID:** User's UID (from Authentication)  
**Required Field:** `role` = `"superuser"`  
**Optional Fields:** `email`, `displayName`, `createdAt`, `updatedAt`

