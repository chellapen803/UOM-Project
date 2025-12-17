import express from 'express';
import { saveDocument, linkChunksToEntities, getDocuments } from '../services/neo4jService.js';

const router = express.Router();

// Save document and chunks
router.post('/save', async (req, res) => {
  try {
    const { docId, docName, chunks, entities } = req.body;
    
    if (!docId || !docName || !chunks) {
      return res.status(400).json({ error: 'docId, docName, and chunks are required' });
    }
    
    await saveDocument(docId, docName, chunks);
    
    // Link chunks to entities if provided
    if (entities && entities.length > 0) {
      await linkChunksToEntities(chunks, entities);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all documents
router.get('/list', async (req, res) => {
  try {
    const documents = await getDocuments();
    res.json({ documents });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

