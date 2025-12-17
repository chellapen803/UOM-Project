import driver from '../config/neo4j.js';

/**
 * Extract meaningful keywords from a query
 * Removes common stop words and question words
 */
function extractKeywords(query) {
  const stopWords = new Set([
    'what', 'is', 'are', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'how', 'when', 'where', 'why',
    'which', 'who', 'whom', 'whose', 'would', 'best', 'course', 'action', 'team', 'like', 'to'
  ]);
  
  // Remove punctuation and split into words
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return words;
}

/**
 * Enhanced RAG retrieval using graph queries
 * Finds relevant chunks by traversing the knowledge graph
 */
export async function retrieveContext(query) {
  const session = driver.session();
  
  try {
    const queryLower = query.toLowerCase();
    const keywords = extractKeywords(query);
    
    let relevantChunks = [];
    
    // Strategy 1: Find entities matching query keywords and get related chunks
    if (keywords.length > 0) {
      // Try each keyword individually
      for (const keyword of keywords) {
        const entityMatchResult = await session.run(
          `MATCH (entity)
           WHERE toLower(entity.id) CONTAINS $keyword
             AND NOT entity:Document AND NOT entity:Chunk
           WITH entity
           MATCH (chunk:Chunk)-[:MENTIONS]->(entity)
           RETURN DISTINCT chunk.text as text, chunk.id as chunkId
           ORDER BY chunkId
           LIMIT 3`,
          { keyword }
        );
        
        const chunks = entityMatchResult.records.map(r => r.get('text'));
        relevantChunks.push(...chunks);
      }
    }
    
    // Also try full query as entity match
    const fullQueryMatch = await session.run(
      `MATCH (entity)
       WHERE toLower(entity.id) CONTAINS $query
         AND NOT entity:Document AND NOT entity:Chunk
       WITH entity
       MATCH (chunk:Chunk)-[:MENTIONS]->(entity)
       RETURN DISTINCT chunk.text as text, chunk.id as chunkId
       ORDER BY chunkId
       LIMIT 5`,
      { query: queryLower }
    );
    
    relevantChunks.push(...fullQueryMatch.records.map(r => r.get('text')));
    
    // Strategy 2: Keyword search in chunks (improved - search for individual keywords)
    if (keywords.length > 0) {
      for (const keyword of keywords) {
        const keywordResult = await session.run(
          `MATCH (chunk:Chunk)
           WHERE toLower(chunk.text) CONTAINS $keyword
           RETURN DISTINCT chunk.text as text
           LIMIT 3`,
          { keyword }
        );
        
        const chunks = keywordResult.records.map(r => r.get('text'));
        relevantChunks.push(...chunks);
      }
    }
    
    // Also try full query in chunks
    const fullQueryChunkResult = await session.run(
      `MATCH (chunk:Chunk)
       WHERE toLower(chunk.text) CONTAINS $query
       RETURN DISTINCT chunk.text as text
       LIMIT 5`,
      { query: queryLower }
    );
    
    relevantChunks.push(...fullQueryChunkResult.records.map(r => r.get('text')));
    
    // Strategy 3: Find entities via relationships (if we have keywords)
    if (keywords.length > 0 && relevantChunks.length < 5) {
      for (const keyword of keywords) {
        const relatedEntityResult = await session.run(
          `MATCH (entity)-[*1..2]-(related)
           WHERE toLower(entity.id) CONTAINS $keyword
             AND NOT entity:Document AND NOT entity:Chunk
             AND NOT related:Document AND NOT related:Chunk
           WITH related
           MATCH (chunk:Chunk)-[:MENTIONS]->(related)
           RETURN DISTINCT chunk.text as text
           LIMIT 3`,
          { keyword }
        );
        
        const chunks = relatedEntityResult.records.map(r => r.get('text'));
        relevantChunks.push(...chunks);
      }
    }
    
    // Remove duplicates while preserving order
    const seen = new Set();
    const uniqueChunks = [];
    for (const chunk of relevantChunks) {
      if (chunk && !seen.has(chunk)) {
        seen.add(chunk);
        uniqueChunks.push(chunk);
      }
    }
    
    // Log retrieval results for debugging
    console.log(`[RAG] Query: "${query}"`);
    console.log(`[RAG] Extracted keywords: ${keywords.join(', ')}`);
    console.log(`[RAG] Found ${uniqueChunks.length} relevant chunks`);
    
    // Strategy 4: If still no results, return some random chunks and entity list
    if (uniqueChunks.length === 0) {
      // Get some random chunks as fallback
      const randomChunks = await session.run(
        `MATCH (chunk:Chunk)
         RETURN chunk.text as text
         ORDER BY rand()
         LIMIT 3`
      );
      
      uniqueChunks.push(...randomChunks.records.map(r => r.get('text')));
      
      // Also get entity list for context
      const entitiesResult = await session.run(
        `MATCH (n)
         WHERE NOT n:Document AND NOT n:Chunk
         RETURN n.id as id
         LIMIT 30`
      );
      
      const entityList = entitiesResult.records
        .map(r => r.get('id'))
        .filter(id => id) // Filter out null/undefined
        .join(', ');
      
      if (entityList) {
        uniqueChunks.push(`Known Entities in Graph: ${entityList}`);
      }
    }
    
    return uniqueChunks.slice(0, 5); // Return top 5 chunks
  } catch (error) {
    console.error('Error in RAG retrieval:', error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Advanced graph query: Find all entities related to a query entity
 * Useful for exploring connections
 */
export async function findRelatedEntities(entityId, depth = 2) {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH path = (start {id: $id})-[*1..${depth}]-(related)
       WHERE NOT related:Document AND NOT related:Chunk
       RETURN DISTINCT related.id as id, 
              labels(related)[0] as label,
              length(path) as distance
       ORDER BY distance
       LIMIT 20`,
      { id: entityId.toLowerCase() }
    );
    
    return result.records.map(record => ({
      id: record.get('id'),
      label: record.get('label'),
      distance: record.get('distance')
    }));
  } catch (error) {
    console.error('Error finding related entities:', error);
    return [];
  } finally {
    await session.close();
  }
}

