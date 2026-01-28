# Vercel Deployment Guide

## Quick Summary

✅ **Yes, you can host both frontend and backend on the same Vercel project!**

## Architecture

```
Vercel Deployment:
├── Frontend (Static) → / (root)
└── Backend (Serverless) → /api/*

External Services:
├── Neo4j Aura → Cloud Database
└── R-GCN Service (Render.com) → Python ML Service
```

**Note**: The R-GCN Python service is hosted separately on Render.com because Vercel serverless functions are not suitable for long-running Python services with heavy ML dependencies (PyTorch). The Node.js backend on Vercel connects to the Render-hosted R-GCN service via the `PYTHON_RGCN_URL` environment variable.

## Prerequisites

1. **Neo4j Aura Account** (Free tier available)
   - Sign up: https://neo4j.com/cloud/aura/
   - Create instance and get connection URI

2. **Vercel Account**
   - Your existing account works

## Step-by-Step Deployment

### Step 1: Get Neo4j Aura Connection Details

1. Go to https://neo4j.com/cloud/aura/
2. Sign up/login
3. Create a free instance
4. Copy the connection URI (looks like: `neo4j+s://xxxxx.databases.neo4j.io`)
5. Note your username (usually `neo4j`) and password

### Step 2: Configure Vercel Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

#### Add these variables:

**Backend (for serverless functions):**
```
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_aura_password
PYTHON_RGCN_URL=https://your-rgcn-service.onrender.com
```

**Note**: `PYTHON_RGCN_URL` should point to your Render-hosted R-GCN service. If you haven't deployed R-GCN yet, you can omit this variable and the app will work without R-GCN enhancement (using standard retrieval).

**Frontend (must start with VITE_):**
```
VITE_API_URL=https://your-project.vercel.app/api
GEMINI_API_KEY=your_gemini_api_key
```

**Important Notes:**
- Replace `your-project.vercel.app` with your actual Vercel domain
- Frontend variables MUST start with `VITE_` to be accessible in browser
- Set for all environments: Production, Preview, Development

### Step 3: Update Frontend API URL Logic

The frontend currently uses `http://localhost:3001/api` locally. It needs to use your Vercel URL in production.

The code already handles this via `VITE_API_URL` environment variable, so you just need to set it correctly in Vercel.

### Step 4: Deploy

#### Option A: Git Push (Automatic)

```bash
git add .
git commit -m "Configure Vercel deployment"
git push
```

Vercel will auto-deploy if connected to your repo.

#### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, then:
vercel --prod
```

### Step 5: Verify

1. **Frontend**: Visit your Vercel URL
2. **Backend Health Check**: Visit `https://your-project.vercel.app/api/health`
3. **Test Upload**: Upload a document and verify it saves to Neo4j Aura

## File Structure

The deployment uses:
- `vercel.json` - Deployment configuration
- `api/index.js` - Serverless function entry point
- `backend/server.js` - Express app (exported for Vercel)
- Frontend built to `dist/` directory

## Important: Neo4j Connection

### Local Development:
```
NEO4J_URI=bolt://localhost:7687
```

### Production (Aura):
```
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
```

Note the protocol difference: `bolt://` vs `neo4j+s://`

## Troubleshooting

### Backend API 404
- Check `vercel.json` configuration
- Verify `api/index.js` exists
- Check function logs in Vercel dashboard

### Neo4j Connection Failed
- Verify `NEO4J_URI` uses `neo4j+s://` (not `bolt://`)
- Check credentials are correct
- Ensure Aura instance is running

### Environment Variables Not Working
- Frontend vars must start with `VITE_`
- Redeploy after adding variables
- Check variable scope (set for Production)

### Timeout Issues
- Vercel serverless has timeout limits
- Consider splitting large operations
- Or use Render/Railway for backend instead

## R-GCN Service Deployment

The R-GCN Python service must be deployed separately on Render.com:

### Why Separate Hosting?

- **Vercel Limitations**: Serverless functions are not suitable for long-running Python services
- **Heavy Dependencies**: PyTorch and ML libraries require persistent runtime
- **Better Performance**: Render provides dedicated resources for Python ML services

### Deployment Steps

1. **Deploy R-GCN to Render**:
   - Create a Web Service on Render.com
   - Set root directory to `backend/python-rgcn`
   - Configure environment variables (Neo4j connection, etc.)
   - See [RGCN_SETUP.md](./RGCN_SETUP.md) for detailed instructions

2. **Connect Vercel to Render**:
   - Add `PYTHON_RGCN_URL` environment variable in Vercel
   - Set value to your Render service URL
   - Redeploy Vercel

3. **Verify**:
   - Check Render service health endpoint
   - Verify frontend shows green R-GCN badge
   - Test chat functionality

## Alternative: Separate Backend Hosting

If you prefer not to use Vercel serverless for the main backend:

### Option 1: Render.com (Recommended)
1. Deploy backend to Render
2. Update `VITE_API_URL` to Render URL
3. Keep frontend on Vercel

### Option 2: Railway.app
Similar to Render, good free tier

### Option 3: Keep Backend Separate
- Host backend anywhere (VPS, cloud)
- Point frontend to backend URL
- More control, more maintenance

## Cost Considerations

- **Vercel Frontend**: Free (Hobby plan)
- **Vercel Serverless**: Free (with limits)
- **Neo4j Aura**: Free tier available
- **Render R-GCN Service**: Free tier available (spins down after inactivity)
- **Total**: $0/month (with free tiers)

**Note**: Render free tier spins down after 15 minutes of inactivity, causing a ~30 second cold start on first request. Consider upgrading to Starter plan ($7/month) for always-on service in production.

## Next Steps After Deployment

1. Update `VITE_API_URL` in Vercel to match your deployment URL
2. Test all functionality
3. Monitor Vercel function logs for errors
4. Set up custom domain (optional)

