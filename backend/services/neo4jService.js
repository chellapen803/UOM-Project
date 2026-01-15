import driver from '../config/neo4j.js';

/**
 * Save nodes and relationships to Neo4j
 * Uses batch operations with UNWIND for performance
 */
export async function saveGraphData(nodes, links) {
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      // Step 1: Batch create/merge nodes by label
      if (nodes.length > 0) {
        // Group nodes by label for efficient batching
        const nodesByLabel = {};
        nodes.forEach(node => {
          const label = node.label || 'Entity';
          if (!nodesByLabel[label]) {
            nodesByLabel[label] = [];
          }
          nodesByLabel[label].push({
            id: node.id.toLowerCase(),
            label: label,
            group: node.group || 1
          });
        });
        
        // Batch create nodes for each label
        for (const [label, labelNodes] of Object.entries(nodesByLabel)) {
          await tx.run(
            `UNWIND $nodes AS node
             MERGE (n:${label} {id: node.id})
             ON CREATE SET 
               n.id = node.id,
               n.label = node.label,
               n.group = node.group,
               n.createdAt = datetime()
             ON MATCH SET
               n.label = node.label,
               n.group = node.group`,
            { nodes: labelNodes }
          );
        }
      }
      
      // Step 2: Batch create relationships
      if (links.length > 0) {
        // Group links by relationship type
        const linksByType = {};
        links.forEach(link => {
          const relType = link.type || 'RELATED_TO';
          if (!linksByType[relType]) {
            linksByType[relType] = [];
          }
          linksByType[relType].push({
            sourceId: link.source.toLowerCase(),
            targetId: link.target.toLowerCase()
          });
        });
        
        // Batch create relationships for each type
        for (const [relType, typeLinks] of Object.entries(linksByType)) {
          await tx.run(
            `UNWIND $links AS link
             MATCH (a {id: link.sourceId}), (b {id: link.targetId})
             MERGE (a)-[r:${relType}]->(b)
             ON CREATE SET r.createdAt = datetime()`,
            { links: typeLinks }
          );
        }
      }
    });
    
    return { success: true, nodesCount: nodes.length, linksCount: links.length };
  } catch (error) {
    console.error('Error saving graph data:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Load all graph data for visualization
 */
export async function getGraphData() {
  const session = driver.session();
  
  try {
    // Get all nodes (excluding Document and Chunk nodes for visualization)
    const nodeResult = await session.run(`
      MATCH (n)
      WHERE NOT n:Document AND NOT n:Chunk
      RETURN n.id as id, labels(n)[0] as label, n.group as group
      ORDER BY id
    `);
    
    const nodes = nodeResult.records.map(record => ({
      id: record.get('id'),
      label: record.get('label'),
      group: record.get('group') || 1
    }));
    
    // Get all relationships
    const linkResult = await session.run(`
      MATCH (a)-[r]->(b)
      WHERE NOT a:Document AND NOT a:Chunk 
        AND NOT b:Document AND NOT b:Chunk
      RETURN a.id as source, b.id as target, type(r) as type
      ORDER BY source, target
    `);
    
    const links = linkResult.records.map(record => ({
      source: record.get('source'),
      target: record.get('target'),
      type: record.get('type')
    }));
    
    return { nodes, links };
  } catch (error) {
    console.error('Error loading graph data:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Save document and chunks
 * Uses batch operations with UNWIND for performance (critical for large PDFs)
 */
export async function saveDocument(docId, docName, chunks) {
  const session = driver.session();
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    console.log(`[Neo4j] Saving document: ${docName} (${chunks.length} chunks)`);
  }
  
  try {
    await session.executeWrite(async (tx) => {
      // Create document node
      await tx.run(
        `MERGE (d:Document {id: $id})
         SET d.name = $name,
             d.uploadDate = $uploadDate,
             d.status = $status`,
        {
          id: docId,
          name: docName,
          uploadDate: new Date().toISOString(),
          status: 'ready'
        }
      );
      
      // Batch create all chunks and link to document in a single query
      if (chunks.length > 0) {
        const chunkData = chunks.map(chunk => ({
          chunkId: chunk.id,
          text: chunk.text,
          sourceDoc: chunk.sourceDoc
        }));
        
        const chunkResult = await tx.run(
          `MATCH (doc:Document {id: $docId})
           UNWIND $chunks AS chunk
           MERGE (chunkNode:Chunk {id: chunk.chunkId})
           SET chunkNode.text = chunk.text,
               chunkNode.sourceDoc = chunk.sourceDoc
           MERGE (doc)-[:CONTAINS]->(chunkNode)
           RETURN count(chunkNode) as savedChunks`,
          {
            docId: docId,
            chunks: chunkData
          }
        );
        
        const savedChunkCount = chunkResult.records[0]?.get('savedChunks')?.toNumber() || 0;
        
        if (savedChunkCount !== chunks.length) {
          console.warn(`[Neo4j] Warning: Expected ${chunks.length} chunks but saved ${savedChunkCount} for document ${docId}`);
        }
      } else {
        console.warn(`[Neo4j] Warning: No chunks to save for document ${docId}`);
      }
    });
    
    if (isDev) {
      console.log(`[Neo4j] Document saved successfully: ${docId}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error(`[Neo4j] Error saving document ${docId}:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Link chunks to entities they mention
 * Optimized with batch operations
 */
export async function linkChunksToEntities(chunks, entities) {
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      // Build list of chunk-entity pairs that should be linked
      const mentions = [];
      
      for (const chunk of chunks) {
        const chunkText = chunk.text.toLowerCase();
        
        for (const entityId of entities) {
          const entityIdLower = entityId.toLowerCase();
          // Only link if entity is mentioned in chunk text
          if (chunkText.includes(entityIdLower)) {
            mentions.push({
              chunkId: chunk.id,
              entityId: entityIdLower
            });
          }
        }
      }
      
      // Batch create all MENTIONS relationships
      if (mentions.length > 0) {
        await tx.run(
          `UNWIND $mentions AS mention
           MATCH (chunk:Chunk {id: mention.chunkId})
           MATCH (entity {id: mention.entityId})
           MERGE (chunk)-[:MENTIONS]->(entity)`,
          { mentions }
        );
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error linking chunks to entities:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get all documents
 */
/**
 * Save quiz questions globally (not linked to specific document)
 * Only one set of questions exists at a time
 */
export async function saveQuizQuestions(questions) {
  const session = driver.session();
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    console.log(`[Neo4j] Saving ${questions.length} quiz questions globally`);
  }
  
  try {
    await session.executeWrite(async (tx) => {
      // Delete all existing quiz questions
      await tx.run(
        `MATCH (q:QuizQuestion)
         DETACH DELETE q`
      );
      
      // Create a Quiz node to track metadata
      await tx.run(
        `MERGE (quiz:Quiz {id: 'global'})
         SET quiz.questionCount = $count,
             quiz.lastUpdated = datetime()`,
        { count: questions.length }
      );
      
      // Batch create all questions and link to Quiz node
      if (questions.length > 0) {
        const questionData = questions.map(q => ({
          questionId: `q_${q.id}`,
          id: q.id,
          question: q.question,
          options: JSON.stringify(q.options),
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          optionExplanations: JSON.stringify(q.optionExplanations || {})
        }));
        
        await tx.run(
          `MATCH (quiz:Quiz {id: 'global'})
           UNWIND $questions AS q
          CREATE (question:QuizQuestion {
            id: q.questionId,
            questionId: q.id,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            optionExplanations: q.optionExplanations
          })
           CREATE (quiz)-[:HAS_QUESTIONS]->(question)
           RETURN count(question) as savedQuestions`,
          {
            questions: questionData
          }
        );
      }
    });
    
    if (isDev) {
      console.log(`[Neo4j] Quiz questions saved successfully`);
    }
    
    return { success: true, count: questions.length };
  } catch (error) {
    console.error(`[Neo4j] Error saving quiz questions:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get all quiz questions (global)
 */
export async function getQuizQuestions() {
  const session = driver.session();
  const isDev = process.env.NODE_ENV !== 'production';
  
  try {
    const result = await session.executeRead(async (tx) => {
      const queryResult = await tx.run(
        `MATCH (quiz:Quiz {id: 'global'})-[:HAS_QUESTIONS]->(q:QuizQuestion)
         RETURN q
         ORDER BY q.questionId ASC`
      );
      
      return queryResult.records.map(record => {
        const q = record.get('q').properties;
        return {
          id: parseInt(q.questionId) || q.id,
          question: q.question,
          options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          optionExplanations: q.optionExplanations ? (typeof q.optionExplanations === 'string' ? JSON.parse(q.optionExplanations) : q.optionExplanations) : {}
        };
      });
    });
    
    if (isDev) {
      console.log(`[Neo4j] Retrieved ${result.length} quiz questions`);
    }
    
    return result;
  } catch (error) {
    console.error(`[Neo4j] Error getting quiz questions:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Check if quiz questions exist
 */
export async function hasQuizQuestions() {
  const session = driver.session();
  
  try {
    const result = await session.executeRead(async (tx) => {
      const queryResult = await tx.run(
        `MATCH (quiz:Quiz {id: 'global'})-[:HAS_QUESTIONS]->(q:QuizQuestion)
         RETURN count(q) as count`
      );
      
      const count = queryResult.records[0]?.get('count')?.toNumber() || 0;
      return count > 0;
    });
    
    return result;
  } catch (error) {
    console.error(`[Neo4j] Error checking quiz questions:`, error);
    return false;
  } finally {
    await session.close();
  }
}

export async function getDocuments() {
  const session = driver.session();
  const isDev = process.env.NODE_ENV !== 'production';
  
  try {
    const result = await session.run(`
      MATCH (doc:Document)
      OPTIONAL MATCH (doc)-[:CONTAINS]->(chunk:Chunk)
      RETURN doc.id as id, 
             doc.name as name, 
             doc.uploadDate as uploadDate,
             doc.status as status,
             count(chunk) as chunkCount
      ORDER BY doc.uploadDate DESC
    `);
    
    const documents = result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      uploadDate: record.get('uploadDate'),
      status: record.get('status'),
      chunkCount: record.get('chunkCount')?.toNumber() || 0
    }));
    
    // Log warning if any documents have 0 chunks
    const docsWithNoChunks = documents.filter(d => d.chunkCount === 0);
    if (docsWithNoChunks.length > 0) {
      console.warn(`[Neo4j] Warning: ${docsWithNoChunks.length} document(s) have 0 chunks`);
    }
    
    if (isDev && documents.length > 0) {
      console.log(`[Neo4j] Loaded ${documents.length} document(s)`);
    }
    
    return documents;
  } catch (error) {
    console.error('[Neo4j] Error getting documents:', error);
    throw error;
  } finally {
    await session.close();
  }
}

