# Knowledge Graph RAG Application

A Knowledge Graph-based Retrieval-Augmented Generation (RAG) application that extracts entities and relationships from documents to build a knowledge graph, then uses it to power an intelligent chatbot.

## Quick Start

```bash
# Install dependencies
npm install
cd backend && npm install && cd ..

# Set up environment variables (see documentation/.env.example)
# Start Neo4j (see documentation/NEO4J_SETUP.md)
# Start backend: cd backend && npm start
# Start frontend: npm run dev
```

## Documentation

All documentation is available in the [`documentation/`](./documentation/) folder:

- **[README.md](./documentation/README.md)** - Complete project overview and setup guide
- **[QUICK_START.md](./documentation/QUICK_START.md)** - Fast setup guide
- **[APP_EXPLANATION.md](./documentation/APP_EXPLANATION.md)** - Detailed architecture and workflow
- **[NEO4J_SETUP.md](./documentation/NEO4J_SETUP.md)** - Neo4j installation and configuration
- **[DEPLOYMENT.md](./documentation/DEPLOYMENT.md)** - Deployment overview
- **[VERCEL_DEPLOYMENT.md](./documentation/VERCEL_DEPLOYMENT.md)** - Detailed Vercel deployment

See the [documentation folder](./documentation/) for the complete list of guides.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + Node.js  
- **Database**: Neo4j (graph database)
- **NLP**: Compromise.js (client-side entity extraction)
- **LLM**: Google Gemini API (for chatbot responses)
- **Visualization**: D3.js (force-directed graph)

