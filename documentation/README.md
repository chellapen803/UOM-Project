# Knowledge Graph RAG Application

A Knowledge Graph-based Retrieval-Augmented Generation (RAG) application that extracts entities and relationships from documents to build a knowledge graph, then uses it to power an intelligent chatbot.

## Features

- 📄 **Document Upload**: Upload PDFs or paste raw text
- 🔍 **Entity Extraction**: Automatic extraction of people, locations, organizations, and concepts using NLP
- 🕸️ **Knowledge Graph**: Visualize relationships between entities in an interactive graph
- 💬 **Intelligent Chatbot**: Ask questions about your documents with RAG-powered responses
- 🗄️ **Neo4j Integration**: Persistent storage in Neo4j graph database
- 📊 **Graph Visualization**: Interactive D3.js force-directed graph visualization

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + Node.js
- **Database**: Neo4j (graph database)
- **NLP**: Compromise.js (client-side entity extraction)
- **LLM**: Google Gemini API (for chatbot responses)
- **Visualization**: D3.js (force-directed graph)

## Quick Start

### Prerequisites

- Node.js (v18+)
- Neo4j (Docker or Neo4j Desktop)
- Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd UOM-Project
   ```

2. **Install dependencies**
   ```bash
   # Frontend dependencies
   npm install
   
   # Backend dependencies
   cd backend
   npm install
   cd ..
   ```

3. **Set up Neo4j** (see [NEO4J_SETUP.md](./NEO4J_SETUP.md) for details)
   ```bash
   # Using Docker (easiest)
   docker run -d \
     --name neo4j \
     -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/yourpassword \
     neo4j:latest
   ```

4. **Configure environment variables**
   
   Create `backend/.env`:
   ```env
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=yourpassword
   PORT=3001
   ```
   
   Create `.env.local` (in root):
   ```env
   VITE_API_URL=http://localhost:3001/api
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Start the backend**
   ```bash
   cd backend
   npm start
   ```

6. **Start the frontend** (in a new terminal)
   ```bash
   npm run dev
   ```

7. **Open the app**
   - Frontend: http://localhost:5173 (or the port Vite assigns)
   - Backend health: http://localhost:3001/health
   - Neo4j Browser: http://localhost:7474

## Documentation

All documentation is available in the `documentation/` folder:

- **[QUICK_START.md](./QUICK_START.md)** - Fast setup guide
- **[APP_EXPLANATION.md](./APP_EXPLANATION.md)** - Detailed architecture and workflow
- **[NEO4J_SETUP.md](./NEO4J_SETUP.md)** - Neo4j installation and configuration
- **[INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md)** - Neo4j integration overview
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide for Vercel
- **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)** - Detailed Vercel deployment steps
- **[NEO4J_PASSWORD_GUIDE.md](./NEO4J_PASSWORD_GUIDE.md)** - Setting Neo4j password
- **[NEO4J_BACKUP.md](./NEO4J_BACKUP.md)** - Backup and export Neo4j data
- **[NEO4J_DELETE_ALL.md](./NEO4J_DELETE_ALL.md)** - Delete all Neo4j data
- **[NEO4J_BROWSER_EXPORT.md](./NEO4J_BROWSER_EXPORT.md)** - Export data via Neo4j Browser
- **[FIX_DOCKER_PERMISSIONS.md](./FIX_DOCKER_PERMISSIONS.md)** - Fix Docker permission issues
- **[SPACY_INTEGRATION_GUIDE.md](./SPACY_INTEGRATION_GUIDE.md)** - Using spaCy instead of Compromise

## Project Structure

```
UOM-Project/
├── backend/              # Express.js backend server
│   ├── config/          # Neo4j configuration
│   ├── routes/          # API routes
│   ├── services/        # Backend services (Neo4j, RAG, Gemini)
│   └── server.js        # Express app entry point
├── components/          # React components
│   ├── GraphVisualizer.tsx
│   └── ui.tsx           # UI components
├── services/            # Frontend services
│   ├── neo4jService.ts  # Neo4j API client
│   ├── pdfService.ts    # PDF processing
│   └── textProcessingService.ts  # NLP entity extraction
├── documentation/       # All documentation files
└── App.tsx             # Main React component
```

## How It Works

1. **Document Upload**: User uploads a PDF or pastes text
2. **Text Extraction**: PDF pages are processed to extract text or render as images
3. **Entity Extraction**: Compromise.js extracts entities (people, places, organizations, concepts) and relationships
4. **Graph Building**: Entities become nodes, relationships become links in the knowledge graph
5. **Storage**: Graph data is saved to Neo4j for persistence
6. **Visualization**: D3.js renders an interactive graph visualization
7. **Chatbot**: Users can ask questions; RAG retrieves relevant context from Neo4j, Gemini generates responses

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
