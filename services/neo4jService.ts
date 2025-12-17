import { GraphData, Node, Link } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface GraphDataResponse {
  nodes: Node[];
  links: Link[];
}

export interface SaveGraphResponse {
  success: boolean;
  nodesCount: number;
  linksCount: number;
}

export interface SaveDocumentResponse {
  success: boolean;
}

/**
 * Save extracted graph data to Neo4j
 */
export async function saveGraphToNeo4j(
  nodes: Node[],
  links: Link[]
): Promise<SaveGraphResponse> {
  const response = await fetch(`${API_BASE_URL}/graph/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, links })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to save graph: ${error.error || response.statusText}`);
  }

  return response.json();
}

/**
 * Load all graph data from Neo4j
 */
export async function loadGraphFromNeo4j(): Promise<GraphDataResponse> {
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(`${API_BASE_URL}/graph/load`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Failed to load graph: ${error.error || response.statusText}`);
    }

    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout: Graph load took too long');
    }
    throw error;
  }
}

/**
 * Save document to Neo4j
 */
export async function saveDocumentToNeo4j(
  docId: string,
  docName: string,
  chunks: Array<{ id: string; text: string; sourceDoc: string }>,
  entityIds?: string[]
): Promise<SaveDocumentResponse> {
  const response = await fetch(`${API_BASE_URL}/documents/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docId,
      docName,
      chunks,
      entities: entityIds || []
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to save document: ${error.error || response.statusText}`);
  }

  return response.json();
}

/**
 * Enhanced RAG query using Neo4j
 */
export async function queryGraphForRAG(query: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`RAG query failed: ${error.error || response.statusText}`);
  }

  const data = await response.json();
  return data.context || [];
}

/**
 * RAG chat endpoint - retrieves context and generates response using Gemini
 * This is the preferred method as it keeps API keys secure on the backend
 */
export async function chatWithRAG(query: string): Promise<{ response: string; context: string[] }> {
  const response = await fetch(`${API_BASE_URL}/rag/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  const data = await response.json().catch(() => ({ error: response.statusText }));

  if (!response.ok) {
    // Extract error message from response
    const errorMessage = data.error || data.message || response.statusText;
    const error = new Error(errorMessage);
    
    // Preserve status code for better error handling
    (error as any).status = response.status;
    (error as any).details = data.details;
    
    throw error;
  }

  return {
    response: data.response || "No response generated.",
    context: data.context || []
  };
}

/**
 * Find related entities (for future use)
 */
export async function findRelatedEntities(
  entityId: string,
  depth: number = 2
): Promise<Array<{ id: string; label: string; distance: number }>> {
  const response = await fetch(
    `${API_BASE_URL}/rag/related/${encodeURIComponent(entityId)}?depth=${depth}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to find related entities: ${error.error || response.statusText}`);
  }

  const data = await response.json();
  return data.related || [];
}

