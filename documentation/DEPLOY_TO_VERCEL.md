# Complete Vercel Deployment Guide

This guide will walk you through deploying your Neo4j Knowledge Graph app to Vercel.

## Prerequisites

✅ **Already Completed:**
- Neo4j Aura connection configured
- Backend API structure ready
- Frontend build configuration ready

## Step-by-Step Deployment

### Step 1: Install Vercel CLI (Optional but Recommended)

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

Follow the prompts to authenticate.

### Step 3: Set Up Environment Variables in Vercel

**Important:** Set these BEFORE your first deployment to avoid connection errors.

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new project or select your existing project
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

**Backend Environment Variables:**
```
NEO4J_URI=neo4j+s://your-instance-id.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_aura_password
NEO4J_DATABASE=neo4j
GEMINI_API_KEY=your_gemini_api_key_here
```

**Frontend Environment Variables:**
```
VITE_API_URL=https://your-project.vercel.app/api
```

**Important Notes:**
- Set each variable for **Production**, **Preview**, and **Development** environments
- Replace `your_gemini_api_key_here` with your actual Gemini API key
- For `VITE_API_URL`, you'll need to update this AFTER the first deployment with your actual Vercel URL
- Frontend variables MUST start with `VITE_` to be accessible in the browser

#### Option B: Via Vercel CLI

```bash
# Set backend variables
vercel env add NEO4J_URI production
vercel env add NEO4J_USERNAME production
vercel env add NEO4J_PASSWORD production
vercel env add NEO4J_DATABASE production
vercel env add GEMINI_API_KEY production

# Set frontend variable (update after first deploy)
vercel env add VITE_API_URL production
```

### Step 4: Deploy to Vercel

#### Option A: Git Integration (Recommended for Auto-Deployments)

1. **Connect Your Repository:**
   - Go to Vercel Dashboard → Add New Project
   - Import your Git repository
   - Vercel will auto-detect the framework (Vite)

2. **Configure Build Settings:**
   - Framework Preset: **Vite**
   - Build Command: `npm install && cd backend && npm install && cd .. && npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically deploy on every push to your main branch

#### Option B: Vercel CLI Deployment

```bash
# From project root
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No (or Yes if you have one)
# - Project name? (your-project-name)
# - Directory? ./
# - Override settings? No

# After preview deployment succeeds:
vercel --prod
```

### Step 5: Update VITE_API_URL After First Deployment

After your first successful deployment:

1. Note your Vercel deployment URL (e.g., `https://your-project.vercel.app`)
2. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
3. Update `VITE_API_URL` to: `https://your-project.vercel.app/api`
4. Redeploy (or wait for next auto-deployment)

### Step 6: Verify Deployment

1. **Check Frontend:**
   - Visit your Vercel URL: `https://your-project.vercel.app`
   - The app should load

2. **Check Backend Health:**
   - Visit: `https://your-project.vercel.app/api/health`
   - Should return: `{"status":"ok","timestamp":"...","neo4j":"neo4j+s://..."}`

3. **Test Document Upload:**
   - Upload a PDF document
   - Check if graph is created and saved to Neo4j Aura

4. **Test RAG Query:**
   - Ask a question in the chat
   - Verify it uses Neo4j for retrieval

## Project Structure on Vercel

```
Vercel Deployment:
├── Frontend (Static) → Served from /dist
│   └── Routes: / (root)
└── Backend (Serverless) → /api/*
    └── Entry: /api/index.js → Express app
```

## Environment Variables Summary

### Required for Backend (Serverless Functions)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j Aura connection URI | `neo4j+s://xxx.databases.neo4j.io` |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j Aura password | `your_password` |
| `NEO4J_DATABASE` | Database name | `neo4j` |
| `GEMINI_API_KEY` | Google Gemini API key | `your_api_key` |

### Required for Frontend (Build-time)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://your-project.vercel.app/api` |

**Note:** Frontend variables must start with `VITE_` to be accessible in the browser.

## Troubleshooting

### Build Fails

**Error: Cannot find module**
- Ensure `backend/package.json` has all dependencies
- Check that build command installs backend dependencies: `cd backend && npm install`

**Error: Module not found in api/**
- Verify `api/index.js` exists and correctly imports from `../backend/server.js`
- Check that backend dependencies are installed

### Backend API Returns 404

**Check:**
1. `vercel.json` has correct rewrite rules
2. `api/index.js` exists and exports the Express app
3. Routes in `backend/server.js` use `/api` prefix

**Solution:**
- Verify `vercel.json` rewrite rule: `/api/(.*)` → `/api`
- Check Vercel function logs in dashboard

### Neo4j Connection Fails

**Error: Connection refused or timeout**
- Verify `NEO4J_URI` uses `neo4j+s://` (not `bolt://`) for Aura
- Check credentials are correct in Vercel environment variables
- Ensure Neo4j Aura instance is running
- Check Vercel function logs for detailed error messages

**Error: Authentication failed**
- Verify `NEO4J_USERNAME` and `NEO4J_PASSWORD` are correct
- Check if password has special characters that need escaping
- Ensure variables are set for the correct environment (Production/Preview)

### Frontend Can't Reach Backend

**Error: Network error or CORS**
- Verify `VITE_API_URL` is set correctly in Vercel
- Check that `VITE_API_URL` includes `/api` at the end
- Ensure CORS is enabled in `backend/server.js` (should be automatic)
- Check browser console for exact error

**Error: Environment variable not found**
- Frontend variables MUST start with `VITE_`
- Rebuild after adding environment variables
- Check that variables are set for Production environment

### Timeout Issues

**Error: Function execution timeout**
- Vercel serverless functions have a 10s timeout on Hobby plan
- Large document processing might timeout
- Consider:
  - Splitting large operations into smaller chunks
  - Using background jobs
  - Upgrading to Pro plan (60s timeout)

### PDF Worker Not Loading

**Error: pdf.worker.min.js not found**
- Check `public/pdf.worker.min.js` exists
- Verify `package.json` has `postinstall` script: `npm run copy-worker`
- Check build logs for worker copy errors

## Deployment Checklist

Before deploying:
- [ ] All environment variables set in Vercel dashboard
- [ ] `NEO4J_URI` uses `neo4j+s://` protocol (Aura)
- [ ] `GEMINI_API_KEY` is set
- [ ] `VITE_API_URL` placeholder set (will update after first deploy)
- [ ] Backend dependencies listed in `backend/package.json`
- [ ] `vercel.json` configured correctly
- [ ] `api/index.js` exists and exports Express app

After first deployment:
- [ ] Update `VITE_API_URL` with actual Vercel URL
- [ ] Test health endpoint: `/api/health`
- [ ] Test document upload
- [ ] Test graph visualization
- [ ] Test RAG query
- [ ] Check Vercel function logs for errors

## Next Steps

1. **Set up Custom Domain** (Optional)
   - Vercel Dashboard → Settings → Domains
   - Add your custom domain

2. **Monitor Performance**
   - Check Vercel Analytics
   - Monitor function execution times
   - Watch for timeout errors

3. **Optimize**
   - Enable caching for static assets
   - Optimize Neo4j queries
   - Consider CDN for large files

## Support

If you encounter issues:
1. Check Vercel function logs: Dashboard → Your Project → Functions
2. Check build logs: Dashboard → Your Project → Deployments
3. Verify environment variables are set correctly
4. Test locally first to isolate issues

## Quick Reference

**Deploy Command:**
```bash
vercel --prod
```

**Check Logs:**
```bash
vercel logs
```

**List Environment Variables:**
```bash
vercel env ls
```

**Update Environment Variable:**
```bash
vercel env add VARIABLE_NAME production
```

