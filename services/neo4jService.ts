import { GraphData, Node, Link } from '../types';
import { auth } from '../config/firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Get authorization header with Firebase ID token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('Failed to get auth token:', error);
  }
  
  return headers;
}

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

export interface DocumentResponse {
  id: string;
  name: string;
  uploadDate: string;
  status: string;
  chunkCount?: number;
}

/**
 * Save extracted graph data to Neo4j
 * Includes timeout handling for large graphs
 */
export async function saveGraphToNeo4j(
  nodes: Node[],
  links: Link[],
  timeout: number = 120000 // 2 minutes default timeout
): Promise<SaveGraphResponse> {
  const headers = await getAuthHeaders();
  
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${API_BASE_URL}/graph/save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nodes, links }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Failed to save graph: ${error.error || response.statusText}`);
    }

    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout: Saving ${nodes.length} nodes and ${links.length} links took too long. The backend may be processing. Try again or check server logs.`);
    }
    throw error;
  }
}

/**
 * Load all graph data from Neo4j
 */
export async function loadGraphFromNeo4j(): Promise<GraphDataResponse> {
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/graph/load`, {
      headers,
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
 * Includes timeout handling for large documents
 */
export async function saveDocumentToNeo4j(
  docId: string,
  docName: string,
  chunks: Array<{ id: string; text: string; sourceDoc: string }>,
  entityIds?: string[],
  timeout: number = 300000 // 5 minutes default timeout
): Promise<SaveDocumentResponse> {
  // To avoid Vercel/Lambda timeouts and very large request bodies with huge PDFs,
  // we batch the chunks and send multiple smaller requests.
  const BATCH_SIZE = 200;
  const isDev = import.meta.env.DEV;

  // Helper to post a single batch of chunks
  const postBatch = async (
    batchChunks: Array<{ id: string; text: string; sourceDoc: string }>,
    batchIndex: number,
    totalBatches: number
  ): Promise<SaveDocumentResponse> => {
    if (isDev) {
      console.log(
        `[Frontend] Saving document batch ${batchIndex + 1}/${totalBatches}: ` +
          `${docName} (${batchChunks.length} chunks in this batch)`
      );
    }

    const headers = await getAuthHeaders();

    // Create AbortController for timeout per batch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE_URL}/documents/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          docId,
          docName,
          chunks: batchChunks,
          // We can safely send the same entities for each batch; backend is idempotent
          entities: entityIds || []
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        console.error(`[Frontend] Failed to save document batch ${batchIndex + 1}:`, error);
        throw new Error(`Failed to save document: ${error.error || response.statusText}`);
      }

      const result = await response.json();

      if (isDev) {
        console.log(
          `[Frontend] Document batch ${batchIndex + 1}/${totalBatches} saved (${duration}ms)`
        );
      }

      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error(
          `[Frontend] Request timeout saving document batch ${batchIndex + 1}/` +
            `${totalBatches} (${batchChunks.length} chunks)`
        );
        throw new Error(
          `Request timeout: Saving document batch ${batchIndex + 1}/${totalBatches} ` +
            `(${batchChunks.length} chunks) took too long. The backend may still be processing.`
        );
      }
      console.error(`[Frontend] Error saving document batch ${batchIndex + 1}:`, error);
      throw error;
    }
  };

  // If the document is small enough, just send it in a single request (fast path)
  if (chunks.length <= BATCH_SIZE) {
    return postBatch(chunks, 0, 1);
  }

  // For very large documents, split into batches and send sequentially.
  // This keeps each request/body small enough for Vercel and avoids long-running functions.
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, chunks.length);
    const batchChunks = chunks.slice(start, end);
    await postBatch(batchChunks, batchIndex, totalBatches);
  }

  // If all batches succeeded, we treat the document as successfully saved.
  return { success: true };
}

/**
 * Enhanced RAG query using Neo4j
 */
export async function queryGraphForRAG(query: string): Promise<string[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/rag/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`RAG query failed: ${error.error || response.statusText}`);
  }

  const data = await response.json();
  return data.context || [];
}

export interface RGCNHealthResponse {
  available: boolean;
  status?: string;
  stats?: {
    nodes?: number;
    edges?: number;
    relation_types?: number;
  };
  model?: {
    embedding_dim?: number;
    num_relations?: number;
    num_nodes?: number;
  };
  error?: string;
}

/**
 * Check R-GCN service health
 */
export async function checkRGCNHealth(): Promise<RGCNHealthResponse> {
  const headers = await getAuthHeaders();
  try {
    const response = await fetch(`${API_BASE_URL}/rag/rgcn-health`, {
      headers,
      signal: AbortSignal.timeout(3000)
    });
    
    if (!response.ok) {
      return { available: false, error: response.statusText };
    }
    
    return await response.json();
  } catch (error: any) {
    return { 
      available: false, 
      error: error.message || 'Service unavailable' 
    };
  }
}

/**
 * RAG chat endpoint - retrieves context and generates response using Gemini
 * This is the preferred method as it keeps API keys secure on the backend
 */
export async function chatWithRAG(
  query: string,
  options?: { useRGCN?: boolean }
): Promise<{ response: string; context: string[]; metadata?: any }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/rag/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      query,
      // Pass through flag so backend can explicitly enable/disable R-GCN per request.
      // If undefined, backend keeps existing default behaviour.
      useRGCN: options?.useRGCN 
    })
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
    context: data.context || [],
    metadata: data.metadata
  };
}

/**
 * Load all documents from Neo4j
 */
export async function loadDocumentsFromNeo4j(): Promise<DocumentResponse[]> {
  const isDev = import.meta.env.DEV;
  const headers = await getAuthHeaders();
  
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(`${API_BASE_URL}/documents/list`, {
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      console.error(`[Frontend] Failed to load documents:`, error);
      throw new Error(`Failed to load documents: ${error.error || response.statusText}`);
    }

    const data = await response.json();
    const documents = data.documents || [];
    
    // Log warning if any documents have 0 chunks
    const docsWithNoChunks = documents.filter((d: DocumentResponse) => (d.chunkCount || 0) === 0);
    if (docsWithNoChunks.length > 0) {
      console.warn(`[Frontend] Warning: ${docsWithNoChunks.length} document(s) have 0 chunks`);
    }
    
    if (isDev && documents.length > 0) {
      console.log(`[Frontend] Loaded ${documents.length} document(s)`);
    }
    
    return documents;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`[Frontend] Request timeout loading documents`);
      throw new Error('Request timeout: Loading documents took too long');
    }
    console.error(`[Frontend] Error loading documents:`, error);
    throw error;
  }
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

