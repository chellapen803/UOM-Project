# R-GCN Embedding Service

Python microservice for generating graph embeddings using Relational Graph Convolutional Networks (R-GCN).

## Overview

This service provides:
- Node embeddings learned from the knowledge graph structure
- Entity similarity search using cosine similarity
- Enhanced RAG retrieval with semantic understanding

## Setup

### 1. Install Dependencies

```bash
cd backend/python-rgcn
pip install -r requirements.txt
```

### 2. Environment Variables

Create a `.env` file in `backend/python-rgcn/` or set environment variables:

```bash
# Neo4j Connection
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password

# R-GCN Model Configuration
RGCN_EMBEDDING_DIM=64
RGCN_HIDDEN_DIM=128
RGCN_NUM_LAYERS=2
RGCN_MODEL_PATH=model.pt

# Service Configuration
PYTHON_RGCN_PORT=8000
```

### 3. Run the Service

```bash
# Development mode
python app.py

# Or with uvicorn directly
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### Health Check
```
GET /health
```
Returns service status, model information, and graph statistics.

### Get Embeddings
```
POST /embeddings
Body: { "entity_ids": ["entity1", "entity2", ...] }
```
Returns embeddings for specified entity IDs.

### Find Similar Entities
```
POST /similar
Body: { "entity_id": "entity1", "top_k": 10 }
```
Returns top-k most similar entities with similarity scores.

### Train Model
```
POST /train
Body: { "epochs": 50, "force_retrain": false }
```
Trains the R-GCN model on the current graph structure.

### Get Statistics
```
GET /stats
```
Returns usage statistics (query count, average similarity, etc.).

## Training

The model can be trained using the `/train` endpoint. Training uses link prediction as the objective:

1. Positive edges: existing relationships in the graph
2. Negative edges: randomly sampled non-existing relationships
3. Loss: Binary cross-entropy between positive and negative edge scores

After training, the model is automatically saved to `model.pt`.

## Integration

The Express backend automatically detects and uses this service when available. If the service is unavailable, it falls back to standard keyword-based retrieval.

## Troubleshooting

- **Model not loading**: Ensure Neo4j is running and accessible
- **No nodes found**: Make sure you have ingested documents and built the graph
- **Low similarity scores**: Train the model using `/train` endpoint
- **Connection errors**: Check Neo4j credentials and network connectivity

