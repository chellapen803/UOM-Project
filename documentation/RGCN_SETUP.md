# R-GCN Setup Guide

## Overview

R-GCN (Relational Graph Convolutional Network) is a Python microservice that enhances the knowledge graph RAG system with semantic embeddings. It learns node embeddings from the graph structure, enabling better entity similarity search and improved context retrieval.

## Architecture

```
Frontend (React)
    ↓
Express Backend (Node.js)
    ↓
┌─────────────────┐
│  Neo4j Database │ (Graph Storage)
└─────────────────┘
    ↓
┌─────────────────┐
│ Python R-GCN    │ (Embedding Service)
│ FastAPI Service │
└─────────────────┘
```

## Prerequisites

1. **Python 3.8+** installed
2. **Neo4j** running and accessible
3. **Node.js backend** running (for integration)

## Installation

### 1. Navigate to Python Service Directory

```bash
cd backend/python-rgcn
```

### 2. Create Virtual Environment (Recommended)

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

**Note**: If you encounter issues installing `torch-geometric`, you may need to install PyTorch first:

```bash
pip install torch torchvision torchaudio
pip install torch-geometric
```

### 4. Configure Environment Variables

Create a `.env` file in `backend/python-rgcn/` or set environment variables:

```bash
# Neo4j Connection (must match your Neo4j setup)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

# R-GCN Model Configuration
RGCN_EMBEDDING_DIM=64        # Dimension of node embeddings
RGCN_HIDDEN_DIM=128          # Hidden layer dimension
RGCN_NUM_LAYERS=2            # Number of R-GCN layers
RGCN_MODEL_PATH=model.pt     # Path to save/load trained model

# Service Configuration
PYTHON_RGCN_PORT=8000        # Port for FastAPI service
PYTHON_RGCN_URL=http://localhost:8000  # Full URL (used by Express backend)
```

### 5. Configure Express Backend

Add to your Express backend `.env` file:

```bash
PYTHON_RGCN_URL=http://localhost:8000
```

## Running the Service

### Development Mode

```bash
cd backend/python-rgcn
python app.py
```

Or with uvicorn directly:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Production Mode

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 2
```

The service will:
1. Connect to Neo4j
2. Load graph data
3. Initialize the R-GCN model
4. Start the FastAPI server

## Training the Model

The model can be trained using the API endpoint:

```bash
curl -X POST http://localhost:8000/train \
  -H "Content-Type: application/json" \
  -d '{"epochs": 50, "force_retrain": false}'
```

Or use the Python script:

```python
import requests
response = requests.post('http://localhost:8000/train', json={'epochs': 50})
print(response.json())
```

**Training Notes**:
- First training may take several minutes depending on graph size
- Model is automatically saved to `model.pt` after training
- Subsequent startups will load the pre-trained model
- Retrain periodically as your graph grows

## Verification

### 1. Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "model_loaded": true,
  "neo4j_connected": true,
  "graph_stats": {
    "nodes": 100,
    "edges": 250,
    "relation_types": 5
  },
  "model_stats": {
    "embedding_dim": 64,
    "num_relations": 5,
    "num_nodes": 100
  }
}
```

### 2. Test Embeddings

```bash
curl -X POST http://localhost:8000/embeddings \
  -H "Content-Type: application/json" \
  -d '{"entity_ids": ["apple", "google"]}'
```

### 3. Test Similarity Search

```bash
curl -X POST http://localhost:8000/similar \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "apple", "top_k": 5}'
```

### 4. Check Frontend Integration

1. Start the Express backend
2. Start the Python R-GCN service
3. Open the frontend application
4. Look for the **green "R-GCN" badge** in the chat header
5. Check the sidebar for R-GCN status panel
6. Send a chat message and check for "R-GCN Enhanced" badge in sources

## Visual Indicators

### When R-GCN is Active

- ✅ **Green "R-GCN" badge** in chat header (with pulsing dot)
- ✅ **R-GCN status panel** in sidebar showing "Active"
- ✅ **"R-GCN Enhanced" badge** on messages using R-GCN
- ✅ **Similarity scores** shown in message sources
- ✅ **Processing status** shows "Analyzing with R-GCN..."

### When R-GCN is Inactive

- ⚪ **Gray "R-GCN Offline" badge** in chat header
- ⚪ **Sidebar status** shows "Offline"
- ⚪ **Standard retrieval** used (no R-GCN badges)

## Troubleshooting

### Service Won't Start

**Issue**: Connection to Neo4j fails
- ✅ Check Neo4j is running: `neo4j status`
- ✅ Verify credentials in `.env` file
- ✅ Check Neo4j URI is correct (bolt://localhost:7687)

**Issue**: No nodes found
- ✅ Ensure you have ingested documents and built the graph
- ✅ Check Neo4j browser to verify nodes exist
- ✅ Nodes must not be Document or Chunk types

### Model Not Loading

**Issue**: Model file not found
- ✅ This is normal on first run - model uses random initialization
- ✅ Train the model using `/train` endpoint
- ✅ Check `RGCN_MODEL_PATH` in environment variables

**Issue**: Model dimensions mismatch
- ✅ Delete `model.pt` and retrain
- ✅ Ensure graph structure hasn't changed significantly

### Low Similarity Scores

**Issue**: Similarity scores are very low (< 0.3)
- ✅ Train the model: `POST /train` with more epochs
- ✅ Ensure graph has sufficient relationships
- ✅ Check that entities are properly connected

### Frontend Not Showing R-GCN Status

**Issue**: Badge shows "Offline" even when service is running
- ✅ Check `PYTHON_RGCN_URL` in Express backend `.env`
- ✅ Verify Python service is accessible: `curl http://localhost:8000/health`
- ✅ Check browser console for errors
- ✅ Verify CORS is configured in Python service

### Performance Issues

**Issue**: Slow response times
- ✅ Reduce `RGCN_EMBEDDING_DIM` (e.g., 32 instead of 64)
- ✅ Limit number of similar entities queried
- ✅ Use GPU if available (modify PyTorch installation)

## API Endpoints

### Health Check
```
GET /health
```
Returns service status and graph statistics.

### Get Embeddings
```
POST /embeddings
Body: { "entity_ids": ["entity1", "entity2"] }
```
Returns embeddings for specified entities.

### Find Similar Entities
```
POST /similar
Body: { "entity_id": "entity1", "top_k": 10 }
```
Returns top-k most similar entities with scores.

### Train Model
```
POST /train
Body: { "epochs": 50, "force_retrain": false }
```
Trains the R-GCN model on current graph.

### Get Statistics
```
GET /stats
```
Returns usage statistics.

## Integration with Express Backend

The Express backend automatically:
1. Checks R-GCN service health on startup
2. Uses R-GCN enhanced retrieval when available
3. Falls back to standard retrieval if R-GCN is unavailable
4. Includes R-GCN metadata in chat responses

No additional configuration needed beyond setting `PYTHON_RGCN_URL`.

## Best Practices

1. **Train Regularly**: Retrain the model as your graph grows
2. **Monitor Performance**: Check `/stats` endpoint periodically
3. **Start Small**: Begin with smaller embedding dimensions for faster training
4. **Incremental Training**: Train with fewer epochs more frequently
5. **Backup Models**: Save `model.pt` before major graph changes

## Next Steps

- Review the [Python R-GCN README](../backend/python-rgcn/README.md) for detailed API documentation
- Check [APP_EXPLANATION.md](./APP_EXPLANATION.md) for overall architecture
- See [NEO4J_SETUP.md](./NEO4J_SETUP.md) for Neo4j configuration

## Support

If you encounter issues:
1. Check service logs for error messages
2. Verify all environment variables are set correctly
3. Ensure Neo4j is accessible and contains graph data
4. Review the troubleshooting section above

