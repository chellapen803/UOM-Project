import express from 'express';
import { saveGraphData, getGraphData, getGraphStats } from '../services/neo4jService.js';
import { verifyToken, requireSuperuser, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Save graph data (nodes + links) - requires superuser
router.post('/save', verifyToken, requireSuperuser, async (req, res) => {
  try {
    const { nodes, links } = req.body;
    
    if (!nodes || !links) {
      return res.status(400).json({ error: 'Nodes and links are required' });
    }
    
    const result = await saveGraphData(nodes, links);
    res.json(result);
  } catch (error) {
    console.error('Error saving graph:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load all graph data - requires authentication
router.get('/load', verifyToken, requireAuth, async (req, res) => {
  try {
    const graphData = await getGraphData();
    res.json(graphData);
  } catch (error) {
    console.error('Error loading graph:', error);
    res.status(500).json({ error: error.message });
  }
});

// Graph statistics for admin metrics - requires superuser
router.get('/stats', verifyToken, requireSuperuser, async (req, res) => {
  try {
    const stats = await getGraphStats();
    res.json(stats);
  } catch (error) {
    console.error('Error loading graph stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

