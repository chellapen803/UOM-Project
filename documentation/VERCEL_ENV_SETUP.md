# Vercel Environment Variables Setup

## Quick Setup Guide

This file contains the exact environment variables you need to add to Vercel for your Neo4j Aura deployment.

## Step 1: Go to Vercel Dashboard

1. Visit [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (or create a new one)
3. Go to **Settings** → **Environment Variables**

## Step 2: Add Backend Environment Variables

Add these variables for **Production**, **Preview**, and **Development**:

```
NEO4J_URI=neo4j+s://your-instance-id.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_aura_password
NEO4J_DATABASE=neo4j
GEMINI_API_KEY=your_gemini_api_key_here
PYTHON_RGCN_URL=https://your-rgcn-service.onrender.com
```

**Important:**
- Replace `your_gemini_api_key_here` with your actual Gemini API key
- Replace `your-rgcn-service.onrender.com` with your Render R-GCN service URL (optional - omit if not using R-GCN)
- Set each variable for all three environments (Production, Preview, Development)
- The backend supports both `NEO4J_USER` and `NEO4J_USERNAME`

**Note**: `PYTHON_RGCN_URL` is optional. If you haven't deployed the R-GCN service to Render yet, you can omit this variable. The app will work without R-GCN enhancement (using standard retrieval). See [RGCN_SETUP.md](./RGCN_SETUP.md) for R-GCN deployment instructions.

## Step 3: Add Frontend Environment Variables

Add this variable (you'll update it after first deployment):

```
VITE_API_URL=https://your-project.vercel.app/api
```

**Note:** 
- Replace `your-project.vercel.app` with your actual Vercel domain
- **After first deployment**, come back and update this with your real URL
- Frontend variables MUST start with `VITE_` to be accessible in the browser

## Step 4: Deploy

After setting all variables:

```bash
# If using Git integration, just push:
git add .
git commit -m "Ready for Vercel deployment"
git push

# Or use Vercel CLI:
vercel --prod
```

## Step 5: Update VITE_API_URL

After your first successful deployment:

1. Note your Vercel URL (e.g., `https://your-project-abc123.vercel.app`)
2. Go back to Environment Variables
3. Update `VITE_API_URL` to: `https://your-project-abc123.vercel.app/api`
4. Redeploy or wait for next auto-deployment

## Quick Checklist

- [ ] Add Neo4j credentials (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE)
- [ ] Add GEMINI_API_KEY
- [ ] Add VITE_API_URL (placeholder - update after first deploy)
- [ ] (Optional) Add PYTHON_RGCN_URL if using R-GCN service on Render
- [ ] Deploy to Vercel
- [ ] Update VITE_API_URL with actual deployment URL
- [ ] Test health endpoint: `https://your-project.vercel.app/api/health`
- [ ] Test document upload and graph creation
- [ ] (If using R-GCN) Verify R-GCN service is accessible and frontend shows green badge

## Testing After Deployment

1. **Health Check:**
   ```
   https://your-project.vercel.app/api/health
   ```
   Should return: `{"status":"ok",...}`

2. **Frontend:**
   ```
   https://your-project.vercel.app
   ```
   Should load your app

3. **Test Features:**
   - Upload a document
   - Verify graph visualization
   - Test RAG query

## Troubleshooting

**Backend not working?**
- Check environment variables are set correctly
- Verify `NEO4J_URI` uses `neo4j+s://` (not `bolt://`)
- Check Vercel function logs in dashboard

**Frontend can't reach backend?**
- Verify `VITE_API_URL` is set and includes `/api`
- Check that variable starts with `VITE_`
- Rebuild after adding environment variables

For detailed deployment instructions, see [DEPLOY_TO_VERCEL.md](./DEPLOY_TO_VERCEL.md)

