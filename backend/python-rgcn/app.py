"""
FastAPI service for R-GCN embeddings and similarity search.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import torch
import os
from dotenv import load_dotenv
from datetime import datetime
import json

from services.neo4j_connector import Neo4jConnector
from models.rgcn_model import RGCNModel, RGCNTrainer

load_dotenv()

app = FastAPI(title="R-GCN Embedding Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
neo4j_connector: Optional[Neo4jConnector] = None
model: Optional[RGCNModel] = None
trainer: Optional[RGCNTrainer] = None
node_to_entity: Dict[int, str] = {}
entity_to_node: Dict[str, int] = {}
graph_data_cache: Optional[Dict] = None
stats = {
    "total_queries": 0,
    "avg_similarity": 0.0,
    "embeddings_count": 0
}


# Request/Response models
class EmbeddingRequest(BaseModel):
    entity_ids: List[str]


class SimilarityRequest(BaseModel):
    entity_id: str
    top_k: int = 10


class TrainRequest(BaseModel):
    epochs: int = 50
    force_retrain: bool = False


@app.on_event("startup")
async def startup():
    """Initialize connections and load model on startup."""
    global neo4j_connector, model, trainer, node_to_entity, entity_to_node, graph_data_cache
    
    print("[R-GCN] Starting up...")
    
    # Connect to Neo4j
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password = os.getenv("NEO4J_PASSWORD", "")
    
    neo4j_connector = Neo4jConnector(neo4j_uri, neo4j_user, neo4j_password)
    
    if not neo4j_connector.test_connection():
        print("[R-GCN] Warning: Could not connect to Neo4j. Service will be limited.")
        return
    
    # Load graph data
    print("[R-GCN] Loading graph data from Neo4j...")
    graph_data_cache = neo4j_connector.get_graph_data()
    
    num_nodes = len(graph_data_cache["entity_ids"])
    num_relations = len(graph_data_cache["rel_type_map"])
    
    if num_nodes == 0:
        print("[R-GCN] Warning: No nodes found in graph. Model will not be initialized.")
        return
    
    print(f"[R-GCN] Loaded {num_nodes} nodes and {len(graph_data_cache['edge_types'])} edges with {num_relations} relation types")
    
    # Build mappings
    for idx, entity_id in enumerate(graph_data_cache["entity_ids"]):
        node_to_entity[idx] = entity_id
        entity_to_node[entity_id] = idx
    
    # Initialize model
    embedding_dim = int(os.getenv("RGCN_EMBEDDING_DIM", "64"))
    hidden_dim = int(os.getenv("RGCN_HIDDEN_DIM", "128"))
    num_layers = int(os.getenv("RGCN_NUM_LAYERS", "2"))
    
    model = RGCNModel(num_nodes, num_relations, embedding_dim, hidden_dim, num_layers)
    
    # Convert graph data to tensors
    edge_index = torch.tensor(graph_data_cache["edges"], dtype=torch.long)
    edge_type = torch.tensor(graph_data_cache["edge_types"], dtype=torch.long)
    
    # Initialize trainer
    trainer = RGCNTrainer(model, edge_index, edge_type)
    
    # Try to load pre-trained model
    model_path = os.getenv("RGCN_MODEL_PATH", "model.pt")
    if os.path.exists(model_path) and not os.getenv("RGCN_FORCE_RETRAIN", "false").lower() == "true":
        try:
            model.load_state_dict(torch.load(model_path, map_location='cpu'))
            print(f"[R-GCN] Loaded pre-trained model from {model_path}")
        except Exception as e:
            print(f"[R-GCN] Could not load model: {e}. Will use untrained model.")
    else:
        print("[R-GCN] No pre-trained model found. Model will use random initialization.")
    
    model.eval()
    print("[R-GCN] Service ready!")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    if neo4j_connector:
        neo4j_connector.close()
    print("[R-GCN] Shutdown complete.")


@app.get("/health")
async def health():
    """Detailed health check with model status."""
    try:
        if not neo4j_connector:
            return {
                "status": "error",
                "error": "Neo4j connector not initialized",
                "timestamp": datetime.now().isoformat()
            }
        
        # Test Neo4j connection
        neo4j_ok = neo4j_connector.test_connection()
        
        if not graph_data_cache:
            return {
                "status": "error",
                "error": "Graph data not loaded",
                "neo4j_connected": neo4j_ok,
                "timestamp": datetime.now().isoformat()
            }
        
        return {
            "status": "ok" if model is not None else "partial",
            "model_loaded": model is not None,
            "neo4j_connected": neo4j_ok,
            "graph_stats": {
                "nodes": len(graph_data_cache["entity_ids"]),
                "edges": len(graph_data_cache["edge_types"]),
                "relation_types": len(graph_data_cache["rel_type_map"])
            },
            "model_stats": {
                "embedding_dim": model.embedding_dim if model else None,
                "num_relations": model.num_relations if model else None,
                "num_nodes": model.num_nodes if model else None
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


@app.get("/stats")
async def get_stats():
    """Get usage statistics."""
    return {
        "total_queries": stats["total_queries"],
        "avg_similarity_score": stats["avg_similarity"],
        "embeddings_generated": stats["embeddings_count"]
    }


@app.post("/embeddings")
async def get_embeddings(request: EmbeddingRequest):
    """Get embeddings for given entity IDs."""
    if not model:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    stats["total_queries"] += 1
    
    from services.embedding_service import EmbeddingService
    embedding_service = EmbeddingService(model, entity_to_node, node_to_entity)
    
    embeddings = embedding_service.get_embeddings(request.entity_ids)
    
    stats["embeddings_count"] += len(embeddings)
    
    return {
        "embeddings": {eid: emb.tolist() for eid, emb in embeddings.items()},
        "entity_ids": list(embeddings.keys())
    }


@app.post("/similar")
async def find_similar(request: SimilarityRequest):
    """Find similar entities using cosine similarity."""
    if not model:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    stats["total_queries"] += 1
    
    from services.embedding_service import EmbeddingService
    embedding_service = EmbeddingService(model, entity_to_node, node_to_entity)
    
    similar = embedding_service.find_similar_entities(request.entity_id, request.top_k)
    
    if similar:
        avg_sim = sum(s["score"] for s in similar) / len(similar)
        stats["avg_similarity"] = (stats["avg_similarity"] + avg_sim) / 2
    
    return {
        "entity_id": request.entity_id,
        "similar_entities": similar
    }


@app.post("/train")
async def train_model(request: TrainRequest):
    """Trigger model training."""
    if not model or not trainer:
        raise HTTPException(status_code=503, detail="Model or trainer not initialized")
    
    model.train()
    
    losses = []
    for epoch in range(request.epochs):
        loss = trainer.train_epoch()
        losses.append(loss)
        if (epoch + 1) % 10 == 0:
            print(f"[R-GCN] Epoch {epoch + 1}/{request.epochs}, Loss: {loss:.4f}")
    
    model.eval()
    
    # Save model
    model_path = os.getenv("RGCN_MODEL_PATH", "model.pt")
    torch.save(model.state_dict(), model_path)
    
    return {
        "status": "success",
        "epochs": request.epochs,
        "final_loss": losses[-1] if losses else None,
        "model_saved": model_path
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_RGCN_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

