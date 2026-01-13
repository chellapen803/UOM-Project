import express from 'express';
import { retrieveContext, findRelatedEntities, extractKeywords } from '../services/ragService.js';
import { generateRAGResponse, cleanContextChunks } from '../services/geminiService.js';
import { verifyToken, requireAuth } from '../middleware/auth.js';
import { checkRGCNHealth, retrieveContextWithRGCN } from '../services/rgcnService.js';

/**
 * Intelligently extract relevant answer from context chunks without LLM
 * Finds chunks that directly answer the question and extracts key sentences
 */
function extractAnswerFromContext(query, context) {
  if (!context || context.length === 0) {
    return null;
  }

  const cleanedContext = cleanContextChunks(context);
  const queryLower = query.toLowerCase();
  const keywords = extractKeywords(query);
  
  // Find chunks that contain the query term or main keywords
  const relevantChunks = cleanedContext.filter(chunk => {
    const chunkLower = chunk.toLowerCase();
    // Check if chunk contains the query or main keywords
    return chunkLower.includes(queryLower) || 
           keywords.some(kw => chunkLower.includes(kw.toLowerCase()));
  });

  if (relevantChunks.length === 0) {
    return null;
  }

  // Try to find definition or explanation patterns
  const definitionPatterns = [
    /(?:is|are|refers to|means|defined as|can be defined as|is a|is an)\s+([^.!?]+(?:\.|!|\?))/gi,
    /([A-Z][^.!?]*\b(?:pretexting|pretext)\b[^.!?]*(?:\.|!|\?))/gi,
    /(?:pretexting|pretext)\s+(?:is|refers to|means|involves|is a technique)[^.!?]*(?:\.|!|\?)/gi,
  ];

  // Look for sentences that define or explain the topic
  let bestAnswer = null;
  let bestScore = 0;

  for (const chunk of relevantChunks) {
    // Split into sentences
    const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      
      // Score based on relevance
      let score = 0;
      
      // Higher score if contains query term
      if (sentenceLower.includes(queryLower)) {
        score += 10;
      }
      
      // Higher score if contains definition words
      if (/\b(is|are|means|defined|refers to|technique|method|attack|type)\b/i.test(sentence)) {
        score += 5;
      }
      
      // Higher score if contains main keywords
      keywords.forEach(kw => {
        if (sentenceLower.includes(kw.toLowerCase())) {
          score += 3;
        }
      });
      
      // Prefer longer sentences (more likely to be definitions)
      if (sentence.trim().length > 50 && sentence.trim().length < 300) {
        score += 2;
      }
      
      // Prefer sentences that start with the topic
      if (new RegExp(`^\\s*${keywords[0] || queryLower.split(' ')[0]}`, 'i').test(sentence)) {
        score += 5;
      }
      
      if (score > bestScore && score >= 8) {
        bestScore = score;
        bestAnswer = sentence.trim();
      }
    }
  }

  // If we found a good answer, try to get a bit more context
  if (bestAnswer) {
    // Try to find follow-up sentences that add context
    for (const chunk of relevantChunks) {
      const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 10);
      const bestIndex = sentences.findIndex(s => s.trim() === bestAnswer);
      
      if (bestIndex !== -1 && sentences.length > bestIndex + 1) {
        // Add next 1-2 sentences for context
        const additionalContext = sentences.slice(bestIndex + 1, bestIndex + 3)
          .filter(s => s.trim().length > 20)
          .join('. ')
          .trim();
        
        if (additionalContext) {
          bestAnswer = `${bestAnswer}. ${additionalContext}`;
        }
      }
    }
  }

  return bestAnswer;
}

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
    
    // Check R-GCN service availability
    const rgcnHealth = await checkRGCNHealth();
    let context = [];
    let metadata = { rgcnUsed: false, retrievalMethod: 'standard' };
    
    // Step 1: Retrieve context (try R-GCN enhanced, fallback to standard)
    if (rgcnHealth.available) {
      try {
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) {
          console.log('[RAG] Using R-GCN enhanced retrieval');
        }
        const rgcnResult = await retrieveContextWithRGCN(query, extractKeywords);
        context = rgcnResult.context;
        metadata = rgcnResult.metadata || metadata;
      } catch (rgcnError) {
        console.warn('[RAG] R-GCN retrieval failed, falling back to standard:', rgcnError.message);
        // Fallback to standard retrieval
        context = await retrieveContext(query);
        metadata = {
          rgcnUsed: false,
          rgcnError: rgcnError.message,
          retrievalMethod: 'standard_fallback'
        };
      }
    } else {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        console.log('[RAG] R-GCN service unavailable, using standard retrieval');
      }
      context = await retrieveContext(query);
      metadata = { rgcnUsed: false, retrievalMethod: 'standard' };
    }
    
    // Step 2: Generate response using Gemini
    try {
      const response = await generateRAGResponse(query, context);
      
      res.json({ 
        response,
        context, // Include context for debugging/source display
        metadata // Include R-GCN metadata
      });
    } catch (geminiError) {
      // If Gemini fails (e.g., rate limit), return context-only response
      // This allows users to still see relevant information from the knowledge graph
      if (geminiError.message?.includes('Rate limit') || geminiError.message?.includes('quota')) {
        console.warn('Gemini rate limited, returning context-only response');
        
        // Clean context chunks to remove page numbers
        const cleanedContext = cleanContextChunks(context);
        
        // Try to intelligently extract an answer from the context
        const extractedAnswer = extractAnswerFromContext(query, cleanedContext);
        
        let contextSummary = '';
        if (extractedAnswer) {
          // We found a relevant answer in the context - just return it naturally
          contextSummary = extractedAnswer;
        } else if (cleanedContext.length > 0) {
          // Couldn't find a direct answer, but we have context
          contextSummary = `I found relevant information about "${query}" in the knowledge graph (${cleanedContext.length} source${cleanedContext.length > 1 ? 's' : ''}), but I cannot synthesize it into a complete answer right now.\n\nPlease check the "View Sources" section below to see the retrieved information.`;
        } else {
          contextSummary = 'No relevant context found in the knowledge graph for this query.';
        }
        
        res.json({
          response: contextSummary,
          context: cleanedContext, // Return cleaned context
          metadata,
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

// R-GCN health check endpoint
router.get('/rgcn-health', verifyToken, requireAuth, async (req, res) => {
  try {
    const health = await checkRGCNHealth();
    res.json(health);
  } catch (error) {
    res.json({ 
      available: false, 
      error: error.message || 'Service unavailable' 
    });
  }
});

export default router;

