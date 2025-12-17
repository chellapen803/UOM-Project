import nlp from 'compromise';
import { GraphData, Node, Link } from '../types';
import { PdfPage } from './pdfService';

/**
 * Sentence-aware text chunking using NLP
 * Better than simple character-based chunking as it respects sentence boundaries
 */
export const chunkText = (text: string, chunkSize: number = 15000): string[] => {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array');
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    
    if (testChunk.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk = testChunk;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text]; // Fallback to original text if no sentences found
};

/**
 * Extract entities from text using NLP
 * Extracts people, places, organizations, and key concepts
 */
const extractEntities = (text: string): Node[] => {
  const doc = nlp(text);
  const nodes: Node[] = [];
  const seenIds = new Set<string>();
  
  // Extract people
  const people = doc.people().out('array');
  people.forEach(person => {
    const id = person.toLowerCase().trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Person',
        group: 1
      });
    }
  });
  
  // Extract places
  const places = doc.places().out('array');
  places.forEach(place => {
    const id = place.toLowerCase().trim();
    if (id && !seenIds.has(id) && id.length > 2) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Location',
        group: 2
      });
    }
  });
  
  // Extract organizations (companies, institutions)
  const organizations = doc.organizations().out('array');
  organizations.forEach(org => {
    const id = org.toLowerCase().trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Organization',
        group: 3
      });
    }
  });
  
  // Extract important nouns (concepts, topics)
  const nouns = doc.nouns().out('array');
  const importantNouns = nouns
    .filter(noun => noun.length > 3 && !isCommonWord(noun.toLowerCase()))
    .slice(0, 20); // Limit to top 20 concepts
  
  importantNouns.forEach(noun => {
    const id = noun.toLowerCase().trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Concept',
        group: 4
      });
    }
  });
  
  return nodes;
};

/**
 * Extract relationships between entities
 * Uses pattern matching to find connections
 */
const extractRelationships = (text: string, nodes: Node[]): Link[] => {
  const doc = nlp(text);
  const links: Link[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));
  
  // Extract sentences containing multiple entities
  const sentences = doc.sentences().out('array');
  
  sentences.forEach(sentence => {
    const sentDoc = nlp(sentence);
    const sentPeople = sentDoc.people().out('array').map(p => p.toLowerCase().trim());
    const sentPlaces = sentDoc.places().out('array').map(p => p.toLowerCase().trim());
    const sentOrgs = sentDoc.organizations().out('array').map(o => o.toLowerCase().trim());
    
    const sentEntities = [...sentPeople, ...sentPlaces, ...sentOrgs].filter(id => nodeIds.has(id));
    
    // Find relationships between entities in the same sentence
    for (let i = 0; i < sentEntities.length; i++) {
      for (let j = i + 1; j < sentEntities.length; j++) {
        const source = sentEntities[i];
        const target = sentEntities[j];
        
        // Determine relationship type based on entity types
        const sourceNode = nodes.find(n => n.id === source);
        const targetNode = nodes.find(n => n.id === target);
        
        if (sourceNode && targetNode) {
          let relationType = 'RELATED_TO';
          
          // Pattern matching for common relationship types
          const lowerSentence = sentence.toLowerCase();
          if (lowerSentence.includes(' works for ') || lowerSentence.includes(' employee of ')) {
            relationType = 'WORKS_FOR';
          } else if (lowerSentence.includes(' located in ') || lowerSentence.includes(' based in ')) {
            relationType = 'LOCATED_IN';
          } else if (lowerSentence.includes(' part of ') || lowerSentence.includes(' member of ')) {
            relationType = 'PART_OF';
          } else if (lowerSentence.includes(' created ') || lowerSentence.includes(' founded ')) {
            relationType = 'CREATED_BY';
          } else if (lowerSentence.includes(' uses ') || lowerSentence.includes(' utilizes ')) {
            relationType = 'USES';
          }
          
          // Avoid duplicate links
          const linkExists = links.some(
            l => (l.source === source && l.target === target) ||
                 (l.source === target && l.target === source)
          );
          
          if (!linkExists) {
            links.push({
              source: source,
              target: target,
              type: relationType
            });
          }
        }
      }
    }
  });
  
  return links;
};

/**
 * Helper function to filter out common words
 */
const isCommonWord = (word: string): boolean => {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'they', 'them', 'their', 'there'
  ]);
  return commonWords.has(word);
};

/**
 * Extract knowledge graph from text chunk using NLP
 * Replaces Gemini-based extraction
 */
export const extractGraphFromChunk = (chunk: string): GraphData => {
  try {
    const nodes = extractEntities(chunk);
    const links = extractRelationships(chunk, nodes);
    
    return { nodes, links };
  } catch (error) {
    console.error("NLP extraction error:", error);
    return { nodes: [], links: [] };
  }
};

/**
 * Extract graph from mixed PDF content
 * For text pages, uses NLP extraction
 * For image pages, returns empty graph (images can't be processed without vision model)
 */
export const extractGraphFromMixedContent = (pages: PdfPage[]): GraphData => {
  try {
    // Combine all text pages
    const textContent = pages
      .filter(page => page.type === 'text')
      .map(page => page.content)
      .join('\n\n');
    
    if (!textContent.trim()) {
      // Only images, return empty graph
      return { nodes: [], links: [] };
    }
    
    // Extract entities and relationships from combined text
    return extractGraphFromChunk(textContent);
  } catch (error) {
    console.error("Mixed content extraction error:", error);
    return { nodes: [], links: [] };
  }
};

