"""
Service for generating and managing node embeddings using R-GCN.
"""
import torch
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Tuple, Optional


class EmbeddingService:
    """Service for computing embeddings and similarity scores."""
    
    def __init__(self, model, entity_to_node: Dict[str, int], node_to_entity: Dict[int, str]):
        """
        Initialize embedding service.
        
        Args:
            model: Trained R-GCN model
            entity_to_node: Mapping from entity ID to node index
            node_to_entity: Mapping from node index to entity ID
        """
        self.model = model
        self.entity_to_node = entity_to_node
        self.node_to_entity = node_to_entity
        self._embeddings_cache = None
    
    def get_embeddings(self, entity_ids: Optional[List[str]] = None) -> Dict[str, np.ndarray]:
        """
        Get embeddings for given entity IDs or all entities.
        
        Args:
            entity_ids: Optional list of entity IDs. If None, returns all embeddings.
            
        Returns:
            Dictionary mapping entity_id to embedding array
        """
        if entity_ids is None:
            # Return all embeddings
            with torch.no_grad():
                embeddings = self.model.node_embedding.weight.cpu().numpy()
            
            result = {}
            for node_idx, entity_id in self.node_to_entity.items():
                result[entity_id] = embeddings[node_idx]
            return result
        else:
            # Get embeddings for specific entities
            node_indices = []
            valid_entity_ids = []
            
            for entity_id in entity_ids:
                if entity_id in self.entity_to_node:
                    node_indices.append(self.entity_to_node[entity_id])
                    valid_entity_ids.append(entity_id)
            
            if not node_indices:
                return {}
            
            with torch.no_grad():
                node_tensor = torch.tensor(node_indices, dtype=torch.long)
                embeddings = self.model.node_embedding(node_tensor).cpu().numpy()
            
            return dict(zip(valid_entity_ids, embeddings))
    
    def find_similar_entities(self, entity_id: str, top_k: int = 10) -> List[Dict]:
        """
        Find similar entities using cosine similarity.
        
        Args:
            entity_id: Entity ID to find similar entities for
            top_k: Number of similar entities to return
            
        Returns:
            List of dictionaries with 'entity_id', 'score', and 'label'
        """
        if entity_id not in self.entity_to_node:
            return []
        
        # Get embedding for query entity
        query_embedding = self.get_embeddings([entity_id])
        if not query_embedding:
            return []
        
        query_emb = query_embedding[entity_id].reshape(1, -1)
        
        # Get all embeddings
        all_embeddings = self.get_embeddings()
        
        # Compute similarities
        similarities = []
        for other_entity_id, other_emb in all_embeddings.items():
            if other_entity_id == entity_id:
                continue
            
            similarity = cosine_similarity(query_emb, other_emb.reshape(1, -1))[0][0]
            similarities.append({
                'entity_id': other_entity_id,
                'score': float(similarity),
                'label': 'Entity'  # Could be enhanced with actual labels
            })
        
        # Sort by similarity and return top_k
        similarities.sort(key=lambda x: x['score'], reverse=True)
        return similarities[:top_k]
    
    def compute_similarity_matrix(self, entity_ids: List[str]) -> np.ndarray:
        """
        Compute pairwise similarity matrix for given entities.
        
        Args:
            entity_ids: List of entity IDs
            
        Returns:
            Similarity matrix of shape [len(entity_ids), len(entity_ids)]
        """
        embeddings = self.get_embeddings(entity_ids)
        
        if not embeddings:
            return np.array([])
        
        # Build embedding matrix
        emb_matrix = np.array([embeddings[eid] for eid in entity_ids if eid in embeddings])
        
        if emb_matrix.size == 0:
            return np.array([])
        
        # Compute cosine similarity
        similarity_matrix = cosine_similarity(emb_matrix)
        return similarity_matrix

