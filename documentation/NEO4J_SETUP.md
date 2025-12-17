# Neo4j Integration Setup Guide

## Prerequisites

1. **Neo4j Database** - You need Neo4j running locally or remotely
2. **Node.js** - For the backend server
3. **npm** - Package manager

## Step 1: Install Neo4j

### Option A: Using Docker (Recommended)
```bash
docker run \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/yourpassword \
  neo4j:latest
```

### Option B: Download Neo4j Desktop
Download from: https://neo4j.com/download/

After installation:
- Create a new database
- Set password (remember this!)
- Start the database
- Note the connection URI (usually `bolt://localhost:7687`)

## Step 2: Backend Setup

1. **Install backend dependencies:**
```bash
cd backend
npm install
```

2. **Create backend environment file:**
```bash
cp backend/.env.example backend/.env
```

3. **Edit `backend/.env` with your Neo4j credentials:**
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=yourpassword
PORT=3001
```

4. **Start the backend server:**
```bash
cd backend
npm start
```

The server should start on `http://localhost:3001`

## Step 3: Frontend Setup

1. **Create frontend environment file:**
```bash
cp .env.local.example .env.local
```

2. **Edit `.env.local` with your configuration:**
```env
VITE_API_URL=http://localhost:3001/api
GEMINI_API_KEY=your_gemini_api_key_here
```

3. **Start the frontend (if not already running):**
```bash
npm run dev
```

## Step 4: Verify Setup

1. **Check backend health:**
   - Visit: http://localhost:3001/health
   - Should return: `{"status":"ok",...}`

2. **Check Neo4j connection:**
   - Backend console should show: `✅ Connected to Neo4j`
   - If you see an error, check your Neo4j credentials

3. **Test the application:**
   - Upload a document
   - Check that it saves to Neo4j
   - Verify graph visualization loads from Neo4j

## Environment Variables Summary

### Backend (`backend/.env`)
- `NEO4J_URI` - Neo4j connection URI (default: `bolt://localhost:7687`)
- `NEO4J_USER` - Neo4j username (default: `neo4j`)
- `NEO4J_PASSWORD` - Neo4j password (**REQUIRED**)
- `PORT` - Backend server port (default: `3001`)

### Frontend (`.env.local`)
- `VITE_API_URL` - Backend API URL (default: `http://localhost:3001/api`)
- `GEMINI_API_KEY` - Your Gemini API key for chatbot (**REQUIRED**)

## Troubleshooting

### Backend won't connect to Neo4j
- Ensure Neo4j is running
- Check credentials in `backend/.env`
- Verify Neo4j URI is correct
- Check Neo4j logs for connection errors

### Frontend can't reach backend
- Ensure backend is running on port 3001
- Check `VITE_API_URL` in `.env.local`
- Verify CORS is enabled (should be automatic)

### Graph not loading
- Check browser console for errors
- Verify backend is running
- Check Neo4j connection in backend logs

## API Endpoints

- `GET /health` - Health check
- `POST /api/graph/save` - Save graph data
- `GET /api/graph/load` - Load graph data
- `POST /api/documents/save` - Save document
- `POST /api/rag/query` - RAG query

## Next Steps

Once everything is set up:
1. Upload documents through the UI
2. Graph data will be saved to Neo4j
3. Graph visualization loads from Neo4j
4. RAG queries use Neo4j for enhanced retrieval

