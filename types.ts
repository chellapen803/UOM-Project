export interface Node {
  id: string;
  label: string; // e.g., "Person", "Organization"
  group: number;
}

export interface Link {
  source: string;
  target: string;
  type: string; // e.g., "WORKS_FOR", "LOCATED_IN"
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

export interface DocumentChunk {
  id: string;
  text: string;
  sourceDoc: string;
}

export interface IngestedDocument {
  id: string;
  name: string;
  uploadDate: string;
  status: 'processing' | 'ready' | 'error';
  chunks: DocumentChunk[];
  chunkCount?: number; // Optional: used when loaded from Neo4j (chunks array may be empty)
}

export interface RGCNMetadata {
  rgcnUsed: boolean;
  retrievalMethod: 'rgcn_enhanced' | 'standard' | 'standard_fallback';
  rgcnSimilarities?: Array<{ entity: string; score: number }>;
  rgcnEntities?: string[];
  initialEntities?: string[];
  similarEntitiesCount?: number;
  rgcnError?: string;
}

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  retrievedContext?: string[]; // To show what the RAG retrieved
  metadata?: RGCNMetadata; // R-GCN metadata
}

export enum AppView {
  ADMIN_UPLOAD = 'ADMIN_UPLOAD',
  ADMIN_GRAPH = 'ADMIN_GRAPH',
  ADMIN_QUIZ_INGEST = 'ADMIN_QUIZ_INGEST',
  USER_CHAT = 'USER_CHAT',
  QUIZ = 'QUIZ',
}

export type UserRole = 'user' | 'superuser';

export interface AppUser {
  uid: string;
  email: string | null;
  role: UserRole;
  displayName?: string;
}
