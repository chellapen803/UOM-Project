import driver from '../config/neo4j.js';

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Check if two words are similar (handles typos)
 * Returns true if words are similar enough
 */
function isSimilarWord(word1, word2, maxDistance = 2) {
  // Exact match
  if (word1 === word2) return true;
  
  // One contains the other (e.g., "phish" in "phishing")
  if (word1.includes(word2) || word2.includes(word1)) return true;
  
  // For short words, be more strict
  if (word1.length < 4 || word2.length < 4) {
    return word1 === word2 || word1.includes(word2) || word2.includes(word1);
  }
  
  // For longer words, allow typos based on Levenshtein distance
  const distance = levenshteinDistance(word1, word2);
  const maxLen = Math.max(word1.length, word2.length);
  
  // Allow 1 typo for words 4-6 chars, 2 typos for 7+ chars
  const allowedDistance = maxLen <= 6 ? 1 : maxDistance;
  
  return distance <= allowedDistance;
}

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
  
  // Extract core topic phrase (remove helper words) - for multi-word topics like "rule-based access control"
  const helperWords = new Set(['explain', 'describe', 'define', 'what', 'is', 'are', 'tell', 'me', 'about']);
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);
  const corePhrase = queryWords.filter(w => !helperWords.has(w)).join(' ');
  const corePhraseHyphenated = corePhrase.replace(/\s+/g, '-');
  const corePhraseSpaced = corePhraseHyphenated.replace(/-/g, ' ');
  
  // Extract main topic word (first significant non-helper word from query)
  const mainTopic = (
    keywords.find(w => !helperWords.has(w.toLowerCase())) ||
    queryLower.split(/\s+/).find(w => w.length > 2 && !helperWords.has(w.toLowerCase())) ||
    ''
  ).toLowerCase();
  
  // HIGHEST PRIORITY: Core phrase match (e.g., "rule-based access control")
  if (corePhrase && corePhrase.length > 5) {
    // Exact core phrase match
    if (chunkLower.includes(corePhrase)) {
      score += 300; // Maximum priority
      // Extra bonus if at start
      if (chunkLower.indexOf(corePhrase) < 100) {
        score += 150;
      }
    }
    // Hyphenated version (e.g., "rule-based-access-control")
    if (chunkLower.includes(corePhraseHyphenated)) {
      score += 280;
      if (chunkLower.indexOf(corePhraseHyphenated) < 100) {
        score += 140;
      }
    }
    // Spaced version variations
    if (corePhraseSpaced !== corePhrase && chunkLower.includes(corePhraseSpaced)) {
      score += 280;
      if (chunkLower.indexOf(corePhraseSpaced) < 100) {
        score += 140;
      }
    }
  }
  
  // HUGE bonus if chunk starts with the main topic (definition/explanation pattern)
  // Like "MD5 was released..." or "Pretexting is..."
  if (mainTopic && chunkStart.startsWith(mainTopic)) {
    score += 200; // High priority for definition-style chunks
    
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
    
    // Extract core topic phrase (remove helper words) - for multi-word topics like "rule-based access control"
    // Define these at the top level so they're available for debug logging
    const helperWords = new Set(['explain', 'describe', 'define', 'what', 'is', 'are', 'tell', 'me', 'about']);
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);
    const corePhrase = queryWords.filter(w => !helperWords.has(w)).join(' ');
    const corePhraseHyphenated = corePhrase ? corePhrase.replace(/\s+/g, '-') : '';
    const corePhraseSpaced = corePhraseHyphenated ? corePhraseHyphenated.replace(/-/g, ' ') : '';
    
    // Map to store chunks with their scores
    const chunkScores = new Map();
    
    // Strategy 1: Exact entity match (highest priority)
    // Also prioritize chunks that START with the entity name (definition pattern)
    if (keywords.length > 0) {
      const mainKeyword = (keywords.find(w => !helperWords.has(w.toLowerCase())) || keywords[0]).toLowerCase();
      
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
    
    // Strategy 3: Core topic phrase match (highest priority for multi-word topics)
    // This is CRITICAL - we need to find chunks that actually contain the full phrase
    if (corePhrase && corePhrase.length > 5) {
      // Try exact phrase match (highest priority) - use word boundaries for better matching
      const exactPhraseResult = await session.run(
        `MATCH (chunk:Chunk)
         WHERE toLower(chunk.text) CONTAINS $phrase
         RETURN DISTINCT chunk.text as text
         LIMIT 20`,
        { phrase: corePhrase }
      );
      
      exactPhraseResult.records.forEach(r => {
        const text = r.get('text');
        if (text) {
          const textLower = text.toLowerCase();
          // Verify it's actually the phrase, not just words scattered
          const phraseIndex = textLower.indexOf(corePhrase.toLowerCase());
          if (phraseIndex !== -1) {
            chunkScores.set(text, 400); // VERY high score for exact phrase match
          }
        }
      });
      
      // Also try hyphenated version (e.g., "rule-based-access-control")
      if (corePhraseHyphenated && corePhraseHyphenated !== corePhrase) {
        const hyphenatedResult = await session.run(
          `MATCH (chunk:Chunk)
           WHERE toLower(chunk.text) CONTAINS $phrase
           RETURN DISTINCT chunk.text as text
           LIMIT 20`,
          { phrase: corePhraseHyphenated }
        );
        
        hyphenatedResult.records.forEach(r => {
          const text = r.get('text');
          if (text) {
            const textLower = text.toLowerCase();
            const phraseIndex = textLower.indexOf(corePhraseHyphenated.toLowerCase());
            if (phraseIndex !== -1) {
              const existingScore = chunkScores.get(text) || 0;
              chunkScores.set(text, Math.max(existingScore, 380)); // High score for hyphenated version
            }
          }
        });
      }
      
      // Try partial hyphenation (e.g., "rule-based access control")
      const words = corePhrase.split(/\s+/);
      if (words.length >= 3) {
        // Try "rule-based access control" format
        const partialHyphenated = `${words[0]}-${words[1]} ${words.slice(2).join(' ')}`;
        const partialHyphenatedResult = await session.run(
          `MATCH (chunk:Chunk)
           WHERE toLower(chunk.text) CONTAINS $phrase
           RETURN DISTINCT chunk.text as text
           LIMIT 20`,
          { phrase: partialHyphenated }
        );
        
        partialHyphenatedResult.records.forEach(r => {
          const text = r.get('text');
          if (text) {
            const textLower = text.toLowerCase();
            const phraseIndex = textLower.indexOf(partialHyphenated.toLowerCase());
            if (phraseIndex !== -1) {
              const existingScore = chunkScores.get(text) || 0;
              chunkScores.set(text, Math.max(existingScore, 380));
            }
          }
        });
      }
      
      // Try acronym search (e.g., "RuBAC" for "rule-based access control")
      // Common pattern: "Rule-Based Access Control (RuBAC)" or "RuBAC (Rule-Based Access Control)"
      const acronymPatterns = [
        corePhrase.split(/\s+/).map(w => w[0]).join('').toUpperCase(), // RBAC
        corePhrase.split(/\s+/).map(w => w[0]).join('').toLowerCase(), // rbac
      ];
      
      for (const acronym of acronymPatterns) {
        if (acronym.length >= 3) {
          const acronymResult = await session.run(
            `MATCH (chunk:Chunk)
             WHERE toLower(chunk.text) CONTAINS $acronym
             RETURN DISTINCT chunk.text as text
             LIMIT 10`,
            { acronym: acronym.toLowerCase() }
          );
          
          acronymResult.records.forEach(r => {
            const text = r.get('text');
            if (text) {
              const textLower = text.toLowerCase();
              // Check if acronym appears near the core phrase words
              const hasRule = textLower.includes('rule');
              const hasAccess = textLower.includes('access');
              const hasControl = textLower.includes('control');
              if (hasRule && hasAccess && hasControl) {
                const existingScore = chunkScores.get(text) || 0;
                chunkScores.set(text, Math.max(existingScore, 350)); // High score for acronym + related words
              }
            }
          });
        }
      }
    }
    
    // Strategy 4: Full query match in chunks (medium-high priority)
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
    
    // Strategy 5: Keyword matches in chunks (lower priority, but still useful)
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
    
    // Strategy 6: FUZZY MATCHING - Handle typos and variations
    // If we still don't have many results, try fuzzy matching on keywords
    if (keywords.length > 0 && chunkScores.size < 5) {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        console.log(`[RAG] Low results (${chunkScores.size}), trying fuzzy matching for keywords: ${keywords.join(', ')}`);
      }
      
      // Get a larger sample of chunks to fuzzy match against
      const allChunksResult = await session.run(
        `MATCH (chunk:Chunk)
         RETURN chunk.text as text
         LIMIT 200`
      );
      
      const allChunks = allChunksResult.records.map(r => r.get('text'));
      
      // Fuzzy match each chunk against keywords
      for (const chunkText of allChunks) {
        if (!chunkText) continue;
        
        const chunkLower = chunkText.toLowerCase();
        // Extract unique words from chunk (remove duplicates for efficiency)
        const chunkWords = [...new Set(chunkLower.split(/\W+/).filter(w => w.length > 2))];
        
        // Check if any chunk word is similar to any keyword
        let fuzzyScore = 0;
        const matchedPairs = [];
        
        for (const keyword of keywords) {
          if (keyword.length < 3) continue; // Skip very short keywords for fuzzy matching
          
          for (const chunkWord of chunkWords) {
            if (isSimilarWord(keyword, chunkWord)) {
              fuzzyScore += 20; // Bonus for fuzzy match
              matchedPairs.push(`${keyword}≈${chunkWord}`);
              break; // Only count one match per keyword
            }
          }
        }
        
        if (fuzzyScore > 0 && !chunkScores.has(chunkText)) {
          if (isDev) {
            console.log(`[RAG] Fuzzy matches: ${matchedPairs.join(', ')} (score: ${fuzzyScore})`);
          }
          chunkScores.set(chunkText, fuzzyScore);
        }
      }
      
      if (isDev) {
        console.log(`[RAG] After fuzzy matching: ${chunkScores.size} candidate chunks`);
      }
    }
    
    // Strategy 7: PARTIAL WORD MATCHING - Handle compound words and variations
    // e.g., "phish" should match "phishing", "spear" should match "spear-phishing"
    if (keywords.length > 0 && chunkScores.size < 5) {
      for (const keyword of keywords) {
        // Skip very short keywords for partial matching
        if (keyword.length < 4) continue;
        
        // Search for chunks where keyword is part of a larger word
        const partialResult = await session.run(
          `MATCH (chunk:Chunk)
           WHERE toLower(chunk.text) =~ $pattern
           RETURN DISTINCT chunk.text as text
           LIMIT 10`,
          { pattern: `(?i).*${keyword}.*` } // Case-insensitive regex
        );
        
        partialResult.records.forEach(r => {
          const text = r.get('text');
          if (text && !chunkScores.has(text)) {
            chunkScores.set(text, 15); // Moderate score for partial match
          }
        });
      }
    }
    
    // Score all chunks
    const scoredChunks = Array.from(chunkScores.entries()).map(([text, baseScore]) => {
      const relevanceScore = scoreChunkRelevance(text, query, keywords);
      const totalScore = baseScore + relevanceScore;
      
      // Check if this is a definition chunk (starts with main topic)
      const helperWords = new Set(['explain', 'describe', 'define', 'what', 'is', 'are']);
      const mainTopic = (
        keywords.find(w => !helperWords.has(w.toLowerCase())) ||
        query.toLowerCase().split(/\s+/).find(w => w.length > 2 && !helperWords.has(w.toLowerCase())) ||
        ''
      ).toLowerCase();
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
        
        // Debug: Show what's actually in the top chunks
        console.log(`[RAG] Core phrase searched: "${corePhrase}"`);
        topChunks.slice(0, 3).forEach((chunk, idx) => {
          const chunkLower = chunk.toLowerCase();
          const chunkPreview = chunk.substring(0, 200).replace(/\n/g, ' ');
          const containsCorePhrase = corePhrase && chunkLower.includes(corePhrase.toLowerCase());
          const containsHyphenated = corePhraseHyphenated && chunkLower.includes(corePhraseHyphenated.toLowerCase());
          console.log(`[RAG] Chunk ${idx + 1} (score: ${scoredChunks[idx].score.toFixed(1)}): "${chunkPreview}..."`);
          console.log(`[RAG]   - Contains core phrase: ${containsCorePhrase || containsHyphenated}`);
          if (corePhrase) {
            const phraseIndex = chunkLower.indexOf(corePhrase.toLowerCase());
            const hyphenIndex = corePhraseHyphenated ? chunkLower.indexOf(corePhraseHyphenated.toLowerCase()) : -1;
            if (phraseIndex !== -1) {
              console.log(`[RAG]   - Found at position: ${phraseIndex}`);
            } else if (hyphenIndex !== -1) {
              console.log(`[RAG]   - Found hyphenated version at position: ${hyphenIndex}`);
            } else {
              // Show what words ARE present
              const queryWordsLower = queryLower.split(/\s+/).filter(w => w.length > 2);
              const foundWords = queryWordsLower.filter(word => chunkLower.includes(word));
              console.log(`[RAG]   - Contains words: ${foundWords.join(', ')}`);
            }
          }
        });
      }
    }
    
    // Filter results: prioritize chunks that actually contain the core phrase
    // For multi-word queries, we PREFER chunks with the phrase but still fall back
    // to the best-scoring chunks rather than returning nothing.
    if (corePhrase && corePhrase.length > 5) {
      // First, try to find chunks that contain the actual phrase
      const phraseMatches = topChunks.filter((chunk, idx) => {
        const chunkLower = chunk.toLowerCase();
        const hasExactPhrase = chunkLower.includes(corePhrase.toLowerCase());
        const hasHyphenated = corePhraseHyphenated && chunkLower.includes(corePhraseHyphenated.toLowerCase());
        const hasPartialHyphenated = chunkLower.includes('rule-based') && chunkLower.includes('access') && chunkLower.includes('control');
        
        return hasExactPhrase || hasHyphenated || hasPartialHyphenated;
      });
      
      if (phraseMatches.length > 0) {
        // Return chunks that actually contain the phrase (these are the real matches)
        console.log(`[RAG] ✅ Found ${phraseMatches.length} chunks containing the core phrase "${corePhrase}"`);
        return phraseMatches.slice(0, 5);
        }

        // No chunks contain the phrase - log this for debugging
        console.log(`[RAG] ⚠️ No chunks found containing core phrase "${corePhrase}" - chunks may not exist in database`);

        // Still return top chunks but with lower confidence.
        // First, prefer any very high-scoring matches.
        const highQualityMatches = topChunks.filter((_, idx) =>
          scoredChunks[idx].score > 200  // Very high threshold if phrase not found
        );
        
        if (highQualityMatches.length > 0) {
          return highQualityMatches.slice(0, 3);
        }
        
        // FINAL FALLBACK:
        // If we have candidate chunks but none pass the strict filters,
        // return the top 3 by score instead of an empty context. This
        // prevents the chatbot from ignoring ingested content for
        // multi-word queries where wording doesn't exactly match.
        if (topChunks.length > 0) {
          return topChunks.slice(0, Math.min(3, topChunks.length));
        }
        
        // Truly nothing useful found.
        return [];
    }
    
    // For single-word queries, use more forgiving filtering
    const goodMatches = topChunks.filter((_, idx) => 
      scoredChunks[idx].score > 15  // Lowered from 30 - be more forgiving
    );
    
    if (goodMatches.length > 0) {
      const highQualityMatches = goodMatches.filter((_, idx) =>
        scoredChunks[idx].score > 50  // Lowered from 100
      );
      
      if (highQualityMatches.length >= 2) {
        return highQualityMatches.slice(0, 3);
      }
      
      return goodMatches.slice(0, 5);
    }
    
    // If we have any chunks at all, return them (better than nothing)
    if (topChunks.length > 0) {
      console.log(`[RAG] 📋 Returning ${Math.min(3, topChunks.length)} chunks as last resort`);
      return topChunks.slice(0, 3);
    }
    
    // Truly no results
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

