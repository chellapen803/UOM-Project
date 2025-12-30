import express from 'express';
import { retrieveContext, findRelatedEntities } from '../services/ragService.js';
import { generateRAGResponse } from '../services/geminiService.js';
import { verifyToken, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// RAG query endpoint (returns only context) - requires authentication
router.post('/query', verifyToken, requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const context = await retrieveContext(query);
    res.json({ context });
  } catch (error) {
    console.error('Error in RAG query:', error);
    res.status(500).json({ error: error.message });
  }
});

// RAG chat endpoint (retrieves context + generates response with Gemini) - requires authentication
router.post('/chat', verifyToken, requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Step 1: Retrieve context from knowledge graph
    const context = await retrieveContext(query);
    
    // Step 2: Generate response using Gemini
    try {
      const response = await generateRAGResponse(query, context);
      
      res.json({ 
        response,
        context // Include context for debugging/source display
      });
    } catch (geminiError) {
      // If Gemini fails (e.g., rate limit), return context-only response
      // This allows users to still see relevant information from the knowledge graph
      if (geminiError.message?.includes('Rate limit') || geminiError.message?.includes('quota')) {
        console.warn('Gemini rate limited, returning context-only response');
        
        // Return a helpful message with the context
        const contextSummary = context.length > 0 
          ? `Here's what I found in the knowledge graph:\n\n${context.join('\n\n---\n\n')}`
          : 'No relevant context found in the knowledge graph.';
        
        res.json({
          response: `⚠️ **Rate Limit Notice**: ${geminiError.message}\n\n${contextSummary}\n\n*Note: Full AI-generated response unavailable due to API rate limits. Please try again later or upgrade your Gemini API plan.*`,
          context,
          warning: 'rate_limit_exceeded'
        });
      } else {
        // For other errors, throw normally
        throw geminiError;
      }
    }
  } catch (error) {
    console.error('Error in RAG chat:', error);
    
    // Return appropriate status code based on error type
    const statusCode = error.message?.includes('Rate limit') ? 429 : 500;
    
    res.status(statusCode).json({ 
      error: error.message,
      details: 'Please ensure the backend server is running and GEMINI_API_KEY is configured correctly.'
    });
  }
});

// Find related entities
router.get('/related/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const depth = parseInt(req.query.depth) || 2;
    
    const related = await findRelatedEntities(entityId, depth);
    res.json({ related });
  } catch (error) {
    console.error('Error finding related entities:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

