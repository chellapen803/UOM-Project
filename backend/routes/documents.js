import express from 'express';
import { saveDocument, linkChunksToEntities, getDocuments } from '../services/neo4jService.js';
import { verifyToken, requireSuperuser, requireAuth } from '../middleware/auth.js';
import { fetchURLContent } from '../services/urlService.js';

const router = express.Router();

// Save document and chunks - requires superuser
router.post('/save', verifyToken, requireSuperuser, async (req, res) => {
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

// Get all documents - requires authentication
router.get('/list', verifyToken, requireAuth, async (req, res) => {
  try {
    const documents = await getDocuments();
    res.json({ documents });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify document ingestion - check how many chunks were saved
router.get('/verify/:docId', verifyToken, requireAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const { getDocumentChunks } = await import('../services/neo4jService.js');
    const result = await getDocumentChunks(docId);
    res.json(result);
  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch content from URL - requires authentication
router.post('/fetch-url', verifyToken, requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      console.log(`[URL Service] Fetching content from: ${url}`);
    }
    
    const content = await fetchURLContent(url);
    
    if (isDev) {
      console.log(`[URL Service] Successfully fetched ${content.length} characters`);
    }
    
    res.json({ 
      success: true, 
      content,
      url,
      length: content.length
    });
  } catch (error) {
    console.error('Error fetching URL:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

