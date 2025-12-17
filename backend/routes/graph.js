import express from 'express';
import { saveGraphData, getGraphData } from '../services/neo4jService.js';

const router = express.Router();

// Save graph data (nodes + links)
router.post('/save', async (req, res) => {
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

// Load all graph data
router.get('/load', async (req, res) => {
  try {
    const graphData = await getGraphData();
    res.json(graphData);
  } catch (error) {
    console.error('Error loading graph:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

