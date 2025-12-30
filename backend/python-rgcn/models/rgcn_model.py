"""
R-GCN (Relational Graph Convolutional Network) Model
Implements a multi-relational graph neural network for learning node embeddings.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import RGCNConv


class RGCNModel(nn.Module):
    """
    Relational Graph Convolutional Network for learning node embeddings.
    
    Args:
        num_nodes: Number of nodes in the graph
        num_relations: Number of relation types
        embedding_dim: Dimension of node embeddings (default: 64)
        hidden_dim: Dimension of hidden layers (default: 128)
        num_layers: Number of R-GCN layers (default: 2)
    """
    
    def __init__(self, num_nodes, num_relations, embedding_dim=64, hidden_dim=128, num_layers=2):
        super(RGCNModel, self).__init__()
        self.num_nodes = num_nodes
        self.num_relations = num_relations
        self.embedding_dim = embedding_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        # Node embeddings (learnable initial embeddings)
        self.node_embedding = nn.Embedding(num_nodes, embedding_dim)
        
        # Initialize embeddings with small random values
        nn.init.xavier_uniform_(self.node_embedding.weight)
        
        # R-GCN layers
        self.convs = nn.ModuleList()
        
        # First layer: embedding_dim -> hidden_dim
        if num_layers == 1:
            self.convs.append(RGCNConv(embedding_dim, embedding_dim, num_relations))
        else:
            self.convs.append(RGCNConv(embedding_dim, hidden_dim, num_relations))
            
            # Hidden layers: hidden_dim -> hidden_dim
            for _ in range(num_layers - 2):
                self.convs.append(RGCNConv(hidden_dim, hidden_dim, num_relations))
            
            # Final layer: hidden_dim -> embedding_dim
            self.convs.append(RGCNConv(hidden_dim, embedding_dim, num_relations))
        
    def forward(self, edge_index, edge_type):
        """
        Forward pass through the R-GCN.
        
        Args:
            edge_index: Tensor of shape [2, num_edges] containing edge indices
            edge_type: Tensor of shape [num_edges] containing edge types
            
        Returns:
            Node embeddings of shape [num_nodes, embedding_dim]
        """
        x = self.node_embedding.weight
        
        for i, conv in enumerate(self.convs):
            x = conv(x, edge_index, edge_type)
            # Apply ReLU activation except for the last layer
            if i < len(self.convs) - 1:
                x = F.relu(x)
                # Optional: Add dropout for regularization
                # x = F.dropout(x, p=0.2, training=self.training)
        
        return x
    
    def get_embeddings(self, node_indices=None):
        """
        Get embeddings for specific nodes or all nodes.
        
        Args:
            node_indices: Optional tensor of node indices. If None, returns all embeddings.
            
        Returns:
            Embeddings tensor
        """
        if node_indices is None:
            return self.node_embedding.weight
        return self.node_embedding(node_indices)


class RGCNTrainer:
    """
    Trainer for R-GCN model using link prediction as the training objective.
    """
    
    def __init__(self, model, edge_index, edge_type, num_negative_samples=1):
        self.model = model
        self.edge_index = edge_index
        self.edge_type = edge_type
        self.num_negative_samples = num_negative_samples
        self.optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)
        
    def train_epoch(self):
        """Train for one epoch using link prediction."""
        self.model.train()
        self.optimizer.zero_grad()
        
        # Get embeddings
        embeddings = self.model(self.edge_index, self.edge_type)
        
        # Positive edges (existing edges)
        pos_edges = self.edge_index
        pos_scores = self._score_edges(embeddings, pos_edges)
        
        # Negative edges (sampled)
        neg_edges = self._sample_negative_edges()
        neg_scores = self._score_edges(embeddings, neg_edges)
        
        # Binary cross-entropy loss
        pos_loss = F.binary_cross_entropy_with_logits(pos_scores, torch.ones_like(pos_scores))
        neg_loss = F.binary_cross_entropy_with_logits(neg_scores, torch.zeros_like(neg_scores))
        loss = pos_loss + neg_loss
        
        loss.backward()
        self.optimizer.step()
        
        return loss.item()
    
    def _score_edges(self, embeddings, edge_index):
        """Score edges using dot product of embeddings."""
        source_emb = embeddings[edge_index[0]]
        target_emb = embeddings[edge_index[1]]
        return (source_emb * target_emb).sum(dim=1)
    
    def _sample_negative_edges(self):
        """Sample negative edges (non-existing edges)."""
        num_nodes = self.model.num_nodes
        num_edges = self.edge_index.size(1)
        
        # Sample random negative edges
        neg_source = torch.randint(0, num_nodes, (num_edges * self.num_negative_samples,))
        neg_target = torch.randint(0, num_nodes, (num_edges * self.num_negative_samples,))
        
        return torch.stack([neg_source, neg_target])

