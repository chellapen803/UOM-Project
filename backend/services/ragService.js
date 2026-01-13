import driver from '../config/neo4j.js';

/**
 * Extract meaningful keywords from a query
 * Removes common stop words but preserves important context words
 */
export function extractKeywords(query) {
  const stopWords = new Set([
    'what', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'be', 'been', 'being', 'have', 'has', 'had', 
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 
    'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 
    'they', 'how', 'when', 'where', 'why', 'which', 'who', 'whom', 'whose', 
    'best', 'course', 'action', 'team', 'like', 'to', 'me', 'my', 'your'
  ]);
  
  // Keep important question words that add context
  const keepWords = new Set(['explain', 'describe', 'define', 'what', 'is', 'are']);
  
  // Remove punctuation and split into words
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => {
      if (word.length < 2) return false;
      // Keep important context words or non-stop words
      return keepWords.has(word) || !stopWords.has(word);
    });
  
  return words;
}

/**
 * Score chunk relevance based on query with stricter matching
 * Prioritizes definition/explanation chunks
 */
function scoreChunkRelevance(chunk, query, keywords) {
  if (!chunk) return 0;
  
  const chunkLower = chunk.toLowerCase();
  const queryLower = query.toLowerCase();
  const chunkTrimmed = chunk.trim();
  const chunkStart = chunkTrimmed.toLowerCase();
  let score = 0;
  
  // Extract main topic word (first significant word from query)
  const mainTopic = keywords.length > 0 ? keywords[0].toLowerCase() : queryLower.split(/\s+/).find(w => w.length > 2) || '';
  
  // HUGE bonus if chunk starts with the main topic (definition/explanation pattern)
  // Like "MD5 was released..." or "Pretexting is..."
  if (mainTopic && chunkStart.startsWith(mainTopic)) {
    score += 200; // Maximum priority for definition-style chunks
    
    // Extra bonus if followed by definition words
    const afterTopic = chunkLower.substring(mainTopic.length, mainTopic.length + 50);
    if (/\b(was|is|are|refers|means|defined|created|developed|released|involves)\b/.test(afterTopic)) {
      score += 100; // This is definitely a definition
    }
  }
  
  // Check if main topic appears in first 50 chars (high relevance)
  if (mainTopic && chunkLower.substring(0, 50).includes(mainTopic)) {
    score += 80;
  }
  
  // Exact query phrase match gets high score
  if (chunkLower.includes(queryLower)) {
    score += 150;
    
    // Big bonus if query appears at the start (more likely to be definition)
    if (chunkLower.indexOf(queryLower) < 100) {
      score += 80;
    }
    
    // Bonus if query word boundaries match (not just substring)
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const wordBoundaryMatches = queryWords.filter(word => {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(chunkLower);
    }).length;
    
    if (wordBoundaryMatches === queryWords.length && queryWords.length > 0) {
      score += 50; // All words match as whole words
    }
  }
  
  // Count keyword matches with word boundaries (stricter)
  const keywordMatches = keywords.filter(kw => {
    if (kw.length < 3) return false;
    // Match whole words, not just substrings
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(chunkLower);
  }).length;
  
  if (keywordMatches > 0) {
    score += keywordMatches * 25;
    
    // Big bonus if all keywords match as whole words
    if (keywordMatches === keywords.length && keywords.length > 1) {
      score += 40;
    }
  }
  
  // Strongly prefer chunks that have definition/explanation patterns
  const strongDefinitionPatterns = [
    /\b(was|were)\s+(released|created|developed|introduced|designed|invented)/i, // "MD5 was released..."
    /\b(is|are)\s+(a|an|the)\s+/, // "is a technique", "is an attack"
    /\b(means|refers to|defined as|involves|consists of)/i,
    /\b(produces|generates|creates|uses|processes|implements)/i, // Technical verbs
  ];
  
  let strongDefinitionFound = false;
  strongDefinitionPatterns.forEach(pattern => {
    if (pattern.test(chunk)) {
      strongDefinitionFound = true;
      score += 60; // Big bonus for strong definition patterns
    }
  });
  
  // Also check for weaker definition patterns
  const definitionPatterns = [
    /\b(is|are|means|defined as|refers to|involves|is a|is an|technique|method|algorithm|protocol|process)\b/gi,
  ];
  
  let definitionMatches = 0;
  definitionPatterns.forEach(pattern => {
    const matches = chunk.match(pattern);
    if (matches) definitionMatches += matches.length;
  });
  
  if (definitionMatches > 0 && !strongDefinitionFound) {
    score += Math.min(definitionMatches * 8, 30); // Medium bonus
  }
  
  // Penalize chunks that are too generic or table-of-contents-like
  const genericPatterns = [
    /^\s*\d+\.\s*\d+\s/, // Starts with numbers (like "2. 3 Explain...")
    /^[\d\s.,]+$/, // All numbers and punctuation
    /table\s+of\s+contents/i,
    /chapter\s+\d+/i,
    /^\s*[a-z]\s+[a-z]/i, // Starts with single letters (like "a. b. c.")
    /^[\s\da-z.,\s-]{0,50}$/i, // First 50 chars are just lists
  ];
  
  if (genericPatterns.some(pattern => pattern.test(chunkTrimmed.substring(0, 100)))) {
    score -= 150; // Heavy penalty for generic content
  }
  
  // Prefer reasonable length chunks (not too short, not too long)
  const length = chunk.length;
  if (length > 150 && length < 800) {
    score += 15; // Sweet spot for definitions
  } else if (length > 100 && length < 1200) {
    score += 8;
  } else if (length < 80 || length > 2500) {
    score -= 30; // Too short or too long
  }
  
  // Bonus if chunk has technical details (numbers, specifications)
  // Like "128 bits", "512-bit blocks", "1991", etc.
  if (/\b\d{3,4}\s*(bit|byte|block|year|digest)/i.test(chunk)) {
    score += 20; // Likely contains technical specifications
  }
  
  // Penalize chunks that are mostly just lists or numbers
  const listPattern = /^[\s\da-z.,\s-]+\s*$/i;
  if (listPattern.test(chunkTrimmed.substring(0, 100))) {
    score -= 80;
  }
  
  return score;
}

/**
 * Enhanced RAG retrieval using graph queries with relevance scoring
 * Finds relevant chunks by traversing the knowledge graph and ranks them
 */
export async function retrieveContext(query) {
  const session = driver.session();
  
  try {
    const queryLower = query.toLowerCase();
    const keywords = extractKeywords(query);
    
    // Map to store chunks with their scores
    const chunkScores = new Map();
    
    // Strategy 1: Exact entity match (highest priority)
    // Also prioritize chunks that START with the entity name (definition pattern)
    if (keywords.length > 0) {
      const mainKeyword = keywords[0].toLowerCase();
      
      // First, try to find chunks that start with the main keyword (definitions)
      const definitionChunksResult = await session.run(
        `MATCH (chunk:Chunk)
         WHERE toLower(chunk.text) STARTS WITH $keyword
         RETURN DISTINCT chunk.text as text
         LIMIT 10`,
        { keyword: mainKeyword + ' ' } // Space after keyword for word boundary
      );
      
      definitionChunksResult.records.forEach(r => {
        const text = r.get('text');
        if (text) {
          chunkScores.set(text, 250); // Very high score for chunks starting with keyword
        }
      });
      
      // Also try exact entity match
      for (const keyword of keywords) {
        const entityMatchResult = await session.run(
          `MATCH (entity)
           WHERE toLower(entity.id) = $keyword
             AND NOT entity:Document AND NOT entity:Chunk
           WITH entity
           MATCH (chunk:Chunk)-[:MENTIONS]->(entity)
           RETURN DISTINCT chunk.text as text, chunk.id as chunkId
           LIMIT 5`,
          { keyword: keyword.toLowerCase() }
        );
        
        entityMatchResult.records.forEach(r => {
          const text = r.get('text');
          if (text) {
            const existingScore = chunkScores.get(text) || 0;
            // Check if this chunk starts with the keyword (definition pattern)
            const startsWithKeyword = text.toLowerCase().trim().startsWith(keyword.toLowerCase());
            chunkScores.set(text, existingScore + (startsWithKeyword ? 150 : 100));
          }
        });
      }
    }
    
    // Strategy 2: Entity contains query (medium priority)
    if (keywords.length > 0) {
      for (const keyword of keywords) {
        const entityMatchResult = await session.run(
          `MATCH (entity)
           WHERE toLower(entity.id) CONTAINS $keyword
             AND NOT entity:Document AND NOT entity:Chunk
           WITH entity
           MATCH (chunk:Chunk)-[:MENTIONS]->(entity)
           RETURN DISTINCT chunk.text as text, chunk.id as chunkId
           LIMIT 5`,
          { keyword }
        );
        
        entityMatchResult.records.forEach(r => {
          const text = r.get('text');
          if (text && !chunkScores.has(text)) {
            chunkScores.set(text, 50); // Medium score
          }
        });
      }
    }
    
    // Strategy 3: Full query match in chunks (high priority)
    const fullQueryChunkResult = await session.run(
      `MATCH (chunk:Chunk)
       WHERE toLower(chunk.text) CONTAINS $query
       RETURN DISTINCT chunk.text as text
       LIMIT 10`,
      { query: queryLower }
    );
    
    fullQueryChunkResult.records.forEach(r => {
      const text = r.get('text');
      if (text) {
        const existingScore = chunkScores.get(text) || 0;
        chunkScores.set(text, existingScore + 40); // Good score for full query match
      }
    });
    
    // Strategy 4: Keyword matches in chunks (lower priority, but still useful)
    if (keywords.length > 0 && chunkScores.size < 10) {
      for (const keyword of keywords) {
        // Only search if we don't have enough good results
        if (chunkScores.size >= 10) break;
        
        const keywordResult = await session.run(
          `MATCH (chunk:Chunk)
           WHERE toLower(chunk.text) CONTAINS $keyword
           RETURN DISTINCT chunk.text as text
           LIMIT 5`,
          { keyword }
        );
        
        keywordResult.records.forEach(r => {
          const text = r.get('text');
          if (text && !chunkScores.has(text)) {
            chunkScores.set(text, 20); // Lower score for keyword match
          }
        });
      }
    }
    
    // Score all chunks
    const scoredChunks = Array.from(chunkScores.entries()).map(([text, baseScore]) => {
      const relevanceScore = scoreChunkRelevance(text, query, keywords);
      const totalScore = baseScore + relevanceScore;
      
      // Check if this is a definition chunk (starts with main topic)
      const mainTopic = keywords.length > 0 ? keywords[0].toLowerCase() : query.toLowerCase().split(/\s+/).find(w => w.length > 2) || '';
      const isDefinitionChunk = mainTopic && text.toLowerCase().trim().startsWith(mainTopic);
      
      return {
        text,
        score: totalScore,
        isDefinition: isDefinitionChunk
      };
    });
    
    // Sort: definition chunks first, then by score (highest first)
    scoredChunks.sort((a, b) => {
      // Definition chunks always come first
      if (a.isDefinition && !b.isDefinition) return -1;
      if (!a.isDefinition && b.isDefinition) return 1;
      // Then sort by score
      return b.score - a.score;
    });
    
    const topChunks = scoredChunks
      .slice(0, 5)
      .map(item => item.text)
      .filter(text => text && text.trim().length > 0);
    
    // Log retrieval results for debugging
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      console.log(`[RAG] Query: "${query}" - Found ${topChunks.length} relevant chunks (from ${chunkScores.size} candidates)`);
      if (topChunks.length > 0) {
        console.log(`[RAG] Top chunk scores: ${scoredChunks.slice(0, 3).map(c => c.score.toFixed(1)).join(', ')}`);
      }
    }
    
    // Only return results if we have good matches (strict threshold)
    const goodMatches = topChunks.filter((_, idx) => 
      scoredChunks[idx].score > 50  // Stricter threshold
    );
    
    if (goodMatches.length > 0) {
      // Further filter: if we have very high scoring chunks, prefer those
      const highQualityMatches = goodMatches.filter((_, idx) =>
        scoredChunks[idx].score > 100
      );
      
      if (highQualityMatches.length >= 2) {
        return highQualityMatches.slice(0, 3); // Only return high-quality ones
      }
      
      return goodMatches.slice(0, 5);
    }
    
    // If we have medium quality matches (30-50), return max 2
    const mediumMatches = topChunks.filter((_, idx) => 
      scoredChunks[idx].score > 30 && scoredChunks[idx].score <= 50
    );
    
    if (mediumMatches.length > 0) {
      return mediumMatches.slice(0, 2); // Return fewer, lower quality ones
    }
    
    // Last resort: return empty (better than random junk)
    return [];
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

