import driver from '../config/neo4j.js';

/**
 * Save nodes and relationships to Neo4j
 * Uses MERGE to avoid duplicates based on id
 */
export async function saveGraphData(nodes, links) {
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      // Step 1: Create/Merge nodes
      for (const node of nodes) {
        const label = node.label || 'Entity';
        await tx.run(
          `MERGE (n:${label} {id: $id})
           ON CREATE SET 
             n.id = $id,
             n.label = $label,
             n.group = $group,
             n.createdAt = datetime()
           ON MATCH SET
             n.label = $label,
             n.group = $group`,
          {
            id: node.id.toLowerCase(),
            label: label,
            group: node.group || 1
          }
        );
      }
      
      // Step 2: Create relationships
      for (const link of links) {
        const relType = link.type || 'RELATED_TO';
        await tx.run(
          `MATCH (a), (b)
           WHERE a.id = $sourceId AND b.id = $targetId
           MERGE (a)-[r:${relType}]->(b)
           ON CREATE SET r.createdAt = datetime()`,
          {
            sourceId: link.source.toLowerCase(),
            targetId: link.target.toLowerCase()
          }
        );
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
 */
export async function saveDocument(docId, docName, chunks) {
  const session = driver.session();
  
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
      
      // Create chunk nodes and link to document
      for (const chunk of chunks) {
        await tx.run(
          `MERGE (chunk:Chunk {id: $chunkId})
           SET chunk.text = $text,
               chunk.sourceDoc = $sourceDoc
           WITH chunk
           MATCH (doc:Document {id: $docId})
           MERGE (doc)-[:CONTAINS]->(chunk)`,
          {
            chunkId: chunk.id,
            text: chunk.text,
            sourceDoc: chunk.sourceDoc,
            docId: docId
          }
        );
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error saving document:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Link chunks to entities they mention
 */
export async function linkChunksToEntities(chunks, entities) {
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      for (const chunk of chunks) {
        // Extract entity IDs from chunk text
        const chunkText = chunk.text.toLowerCase();
        
        for (const entityId of entities) {
          const entityIdLower = entityId.toLowerCase();
          // Only link if entity is mentioned in chunk text
          if (chunkText.includes(entityIdLower)) {
            await tx.run(
              `MATCH (chunk:Chunk {id: $chunkId})
               MATCH (entity {id: $entityId})
               MERGE (chunk)-[:MENTIONS]->(entity)`,
              {
                chunkId: chunk.id,
                entityId: entityIdLower
              }
            );
          }
        }
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
export async function getDocuments() {
  const session = driver.session();
  
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
      chunks: [] // Chunks loaded separately if needed
    }));
    
    return documents;
  } catch (error) {
    console.error('Error getting documents:', error);
    throw error;
  } finally {
    await session.close();
  }
}

