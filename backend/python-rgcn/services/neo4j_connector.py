"""
Neo4j connector for extracting graph data for R-GCN training.
"""
from neo4j import GraphDatabase
import numpy as np
from typing import Dict, List, Tuple, Optional


class Neo4jConnector:
    """Connector to extract graph structure from Neo4j for R-GCN training."""
    
    def __init__(self, uri: str, user: str, password: str):
        """
        Initialize Neo4j connection.
        
        Args:
            uri: Neo4j connection URI (e.g., "bolt://localhost:7687")
            user: Neo4j username
            password: Neo4j password
        """
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
    
    def close(self):
        """Close the Neo4j driver connection."""
        self.driver.close()
    
    def test_connection(self) -> bool:
        """Test if connection to Neo4j is working."""
        try:
            with self.driver.session() as session:
                session.run("RETURN 1")
            return True
        except Exception as e:
            print(f"Neo4j connection test failed: {e}")
            return False
    
    def get_graph_data(self) -> Dict:
        """
        Extract graph structure from Neo4j for R-GCN training.
        
        Returns:
            Dictionary containing:
            - node_map: Mapping from Neo4j internal IDs to node indices
            - entity_ids: List of entity IDs (strings)
            - labels: List of node labels
            - edges: Edge index array of shape [2, num_edges]
            - edge_types: Array of edge type indices
            - rel_type_map: Mapping from relation type names to indices
        """
        with self.driver.session() as session:
            # Get all nodes (excluding Document and Chunk nodes)
            nodes_result = session.run("""
                MATCH (n)
                WHERE NOT n:Document AND NOT n:Chunk
                RETURN id(n) as neo4j_id, n.id as entity_id, 
                       COALESCE(labels(n)[0], 'Entity') as label
                ORDER BY neo4j_id
            """)
            
            node_map = {}  # neo4j_id -> index
            entity_ids = []
            labels = []
            
            for idx, record in enumerate(nodes_result):
                neo4j_id = record["neo4j_id"]
                node_map[neo4j_id] = idx
                entity_ids.append(record["entity_id"] or f"node_{idx}")
                labels.append(record["label"] or "Entity")
            
            if len(entity_ids) == 0:
                return {
                    "node_map": {},
                    "entity_ids": [],
                    "labels": [],
                    "edges": np.array([[], []], dtype=np.int64),
                    "edge_types": np.array([], dtype=np.int64),
                    "rel_type_map": {}
                }
            
            # Get all edges with relationship types
            edges_result = session.run("""
                MATCH (a)-[r]->(b)
                WHERE NOT a:Document AND NOT a:Chunk
                  AND NOT b:Document AND NOT b:Chunk
                RETURN id(a) as source, id(b) as target, type(r) as rel_type
            """)
            
            edges = []
            rel_types = []
            rel_type_map = {}  # rel_type -> index
            
            for record in edges_result:
                source_neo4j = record["source"]
                target_neo4j = record["target"]
                rel_type = record["rel_type"] or "RELATED_TO"
                
                # Skip if nodes not in our node map
                if source_neo4j not in node_map or target_neo4j not in node_map:
                    continue
                
                # Map relation type to index
                if rel_type not in rel_type_map:
                    rel_type_map[rel_type] = len(rel_type_map)
                
                edges.append([node_map[source_neo4j], node_map[target_neo4j]])
                rel_types.append(rel_type_map[rel_type])
            
            # Convert to numpy arrays
            edges_array = np.array(edges, dtype=np.int64).T if edges else np.array([[], []], dtype=np.int64)
            edge_types_array = np.array(rel_types, dtype=np.int64) if rel_types else np.array([], dtype=np.int64)
            
            return {
                "node_map": node_map,
                "entity_ids": entity_ids,
                "labels": labels,
                "edges": edges_array,
                "edge_types": edge_types_array,
                "rel_type_map": rel_type_map
            }
    
    def get_entity_chunks(self, entity_ids: List[str]) -> Dict[str, List[str]]:
        """
        Get chunks associated with given entity IDs.
        
        Args:
            entity_ids: List of entity IDs to find chunks for
            
        Returns:
            Dictionary mapping entity_id to list of chunk texts
        """
        with self.driver.session() as session:
            result = session.run("""
                MATCH (entity)-[:MENTIONS]-(chunk:Chunk)
                WHERE entity.id IN $entity_ids
                RETURN entity.id as entity_id, collect(DISTINCT chunk.text) as chunks
            """, entity_ids=entity_ids)
            
            entity_chunks = {}
            for record in result:
                entity_id = record["entity_id"]
                chunks = record["chunks"]
                entity_chunks[entity_id] = chunks if chunks else []
            
            return entity_chunks

