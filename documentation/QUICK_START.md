# Quick Start Guide - Neo4j Integration

## 🚀 Quick Setup (5 minutes)

### 1. Install Neo4j (Choose one)

**Option A: Docker (Easiest)**
```bash
docker run --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password123 neo4j:latest
```

**Option B: Neo4j Desktop**
- Download: https://neo4j.com/download/
- Create database, set password, start it

### 2. Backend Setup

```bash
# Install dependencies
cd backend
npm install

# Create environment file
cat > .env << EOF
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123
PORT=3001
EOF

# Start backend
npm start
```

### 3. Frontend Setup

```bash
# Add API URL to .env.local (if not already there)
echo "VITE_API_URL=http://localhost:3001/api" >> .env.local

# Start frontend (if not running)
npm run dev
```

### 4. Verify

- ✅ Backend: http://localhost:3001/health should return `{"status":"ok"}`
- ✅ Frontend: http://localhost:3000 should load
- ✅ Upload a document and check it saves to Neo4j

## 🔑 Required Environment Variables

### Backend: `backend/.env`
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=yourpassword
PORT=3001
```

### Frontend: `.env.local`
```
VITE_API_URL=http://localhost:3001/api
GEMINI_API_KEY=your_gemini_api_key_here
```

## 📝 Important Notes

1. **Neo4j must be running** before starting the backend
2. **Backend must be running** before using the frontend
3. **Default Neo4j password** is usually set during installation
4. **Change default password** in production!

## 🐛 Troubleshooting

**Backend won't start:**
- Check Neo4j is running: `docker ps` or Neo4j Desktop
- Verify credentials in `backend/.env`

**Frontend can't connect:**
- Check backend is running on port 3001
- Verify `VITE_API_URL` in `.env.local`
- Check browser console for CORS errors

**Graph not loading:**
- Check backend logs for Neo4j connection errors
- Verify Neo4j is accessible at the URI specified

