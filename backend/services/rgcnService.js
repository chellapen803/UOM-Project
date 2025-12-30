/**
 * R-GCN Service Integration
 * Handles communication with the Python R-GCN microservice
 */

import driver from '../config/neo4j.js';

const PYTHON_RGCN_URL = process.env.PYTHON_RGCN_URL || 'http://localhost:8000';
const RGCN_TIMEOUT = 3000; // 3 seconds timeout

/**
 * Check if R-GCN service is available
 */
export async function checkRGCNHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RGCN_TIMEOUT);
    
    const response = await fetch(`${PYTHON_RGCN_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        status: data.status,
        stats: data.graph_stats || {},
        model: data.model_stats || {}
      };
    }
    
    return { available: false };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[R-GCN] Health check timeout');
    } else {
      console.log(`[R-GCN] Health check failed: ${error.message}`);
    }
    return { available: false, error: error.message };
  }
}

/**
 * Get embeddings for entity IDs
 */
export async function getEntityEmbeddings(entityIds) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RGCN_TIMEOUT * 2);
    
    const response = await fetch(`${PYTHON_RGCN_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_ids: entityIds }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`R-GCN service error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.embeddings || {};
  } catch (error) {
    console.warn(`[R-GCN] Failed to get embeddings: ${error.message}`);
    throw error;
  }
}

/**
 * Find similar entities using R-GCN
 */
export async function findSimilarEntities(entityId, topK = 10) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RGCN_TIMEOUT * 2);
    
    const response = await fetch(`${PYTHON_RGCN_URL}/similar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId, top_k: topK }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`R-GCN service error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.similar_entities || [];
  } catch (error) {
    console.warn(`[R-GCN] Failed to find similar entities: ${error.message}`);
    throw error;
  }
}

/**
 * Enhanced RAG retrieval using R-GCN embeddings
 */
export async function retrieveContextWithRGCN(query, extractKeywords) {
  const session = driver.session();
  
  try {
    const queryLower = query.toLowerCase();
    const keywords = extractKeywords(query);
    
    // Step 1: Find initial entities matching keywords
    let initialEntities = new Set();
    
    if (keywords.length > 0) {
      for (const keyword of keywords) {
        const entityMatchResult = await session.run(
          `MATCH (entity)
           WHERE toLower(entity.id) CONTAINS $keyword
             AND NOT entity:Document AND NOT entity:Chunk
           RETURN DISTINCT entity.id as id
           LIMIT 10`,
          { keyword }
        );
        
        entityMatchResult.records.forEach(r => {
          const id = r.get('id');
          if (id) initialEntities.add(id);
        });
      }
    }
    
    // Also try full query
    const fullQueryMatch = await session.run(
      `MATCH (entity)
       WHERE toLower(entity.id) CONTAINS $query
         AND NOT entity:Document AND NOT entity:Chunk
       RETURN DISTINCT entity.id as id
       LIMIT 5`,
      { query: queryLower }
    );
    
    fullQueryMatch.records.forEach(r => {
      const id = r.get('id');
      if (id) initialEntities.add(id);
    });
    
    if (initialEntities.size === 0) {
      // No entities found, fall back to standard retrieval
      return { context: [], metadata: { rgcnUsed: false, retrievalMethod: 'standard_fallback' } };
    }
    
    // Step 2: Get similar entities using R-GCN
    const allSimilarEntities = [];
    const similarities = [];
    
    for (const entityId of Array.from(initialEntities).slice(0, 5)) {
      try {
        const similar = await findSimilarEntities(entityId, 5);
        allSimilarEntities.push(...similar.map(s => s.entity_id));
        similarities.push(...similar);
      } catch (error) {
        console.warn(`[R-GCN] Failed to find similar for ${entityId}:`, error.message);
      }
    }
    
    // Combine initial and similar entities
    const allEntityIds = Array.from(new Set([...initialEntities, ...allSimilarEntities]));
    
    // Step 3: Get chunks for all entities
    const relevantChunks = [];
    const entityChunkMap = new Map();
    
    for (const entityId of allEntityIds.slice(0, 20)) {
      const chunkResult = await session.run(
        `MATCH (entity {id: $entityId})-[:MENTIONS]-(chunk:Chunk)
         WHERE NOT entity:Document AND NOT entity:Chunk
         RETURN DISTINCT chunk.text as text, chunk.id as chunkId
         LIMIT 3`,
        { entityId }
      );
      
      const chunks = chunkResult.records.map(r => r.get('text')).filter(Boolean);
      if (chunks.length > 0) {
        relevantChunks.push(...chunks);
        entityChunkMap.set(entityId, chunks);
      }
    }
    
    // Remove duplicates
    const seen = new Set();
    const uniqueChunks = [];
    for (const chunk of relevantChunks) {
      if (chunk && !seen.has(chunk)) {
        seen.add(chunk);
        uniqueChunks.push(chunk);
      }
    }
    
    // Prepare metadata
    const topSimilarities = similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => ({ entity: s.entity_id, score: s.score }));
    
    return {
      context: uniqueChunks.slice(0, 5),
      metadata: {
        rgcnUsed: true,
        rgcnSimilarities: topSimilarities,
        rgcnEntities: Array.from(allEntityIds).slice(0, 10),
        retrievalMethod: 'rgcn_enhanced',
        initialEntities: Array.from(initialEntities),
        similarEntitiesCount: allSimilarEntities.length
      }
    };
  } catch (error) {
    console.error('[R-GCN] Error in R-GCN retrieval:', error);
    // Fall back to standard retrieval
    return { context: [], metadata: { rgcnUsed: false, retrievalMethod: 'standard_fallback', error: error.message } };
  } finally {
    await session.close();
  }
}

