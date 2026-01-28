# Deployment Overview

This document provides a quick overview of deployment options. For detailed Vercel deployment instructions, see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md).

## Quick Reference

### Recommended: Vercel (Full Stack)

Deploy both frontend and backend on Vercel as serverless functions:

- **Frontend**: Static React app (Vite build)
- **Backend**: Express API as serverless functions
- **Neo4j**: Must be hosted separately (Neo4j Aura recommended)
- **R-GCN Service**: Must be hosted separately on Render.com (Python ML service)

**See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for complete step-by-step instructions.**

**Note**: The R-GCN Python service is deployed separately on Render.com because Vercel serverless functions are not suitable for long-running Python services with heavy ML dependencies. The Node.js backend on Vercel connects to Render via the `PYTHON_RGCN_URL` environment variable.

### R-GCN Service Hosting

The R-GCN Python service is hosted separately on **Render.com**:

- **Why Render?**: Vercel serverless functions are not suitable for long-running Python services with heavy ML dependencies (PyTorch)
- **Connection**: Node.js backend on Vercel connects to Render via `PYTHON_RGCN_URL` environment variable
- **Deployment**: See [RGCN_SETUP.md](./RGCN_SETUP.md) for Render deployment instructions

### Alternative Options

1. **Render.com** (Free tier)
   - Deploy backend separately
   - Better for long-running processes
   - Update `VITE_API_URL` to point to Render URL

2. **Railway.app**
   - Similar to Render
   - Easy integration with databases

3. **Separate Hosting**
   - Host backend on VPS/cloud
   - Point frontend to backend URL
   - More control, more maintenance

## Key Requirements

- **Neo4j**: Cannot use `localhost:7687` in production - must use Neo4j Aura or cloud-hosted Neo4j
- **Environment Variables**: Must be configured for both frontend (`VITE_*`) and backend
- **API URL**: Frontend must point to production backend URL (not localhost)

## Prerequisites

- Neo4j Aura account (free tier available)
- Vercel account (or alternative hosting provider)
- Environment variables configured
- Neo4j connection URI (`neo4j+s://` for Aura, not `bolt://`)

For detailed deployment instructions, see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md).

