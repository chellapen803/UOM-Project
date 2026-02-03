# SecurityPlus Bot Application - Step-by-Step Explanation

## Overview
SecurityPlus Bot is a Knowledge Graph RAG (Retrieval-Augmented Generation) application that extracts entities and relationships from documents to build a knowledge graph, then uses it to power an intelligent chatbot.

---

## Architecture Overview

### Local Development
```
User Upload (Text/PDF)
    ↓
[PDF Service] → Extract text/images from PDF
    ↓
[Text Processing Service] → NLP-based chunking & entity extraction (using Compromise.js)
    ↓
Knowledge Graph (Nodes & Links)
    ↓
[Chat Interface] → RAG Retrieval → [Gemini API] → Response
         ↓
    [R-GCN Service] (localhost:8000) - Optional semantic enhancement
```

### Production Deployment
```
Frontend (Vercel)
    ↓
Backend API (Vercel Serverless)
    ↓
┌─────────────────┐
│  Neo4j Aura     │ (Cloud Database)
└─────────────────┘
    ↓
┌─────────────────┐
│ R-GCN Service   │ (Render.com) - Python ML Service
│ FastAPI         │
└─────────────────┘
    ↓
[Chat Interface] → RAG Retrieval (with R-GCN enhancement) → [Gemini API] → Response
```

**Note**: In production, the R-GCN service runs on Render.com because Vercel serverless functions are not suitable for long-running Python services with heavy ML dependencies. The service maintains persistent connections to Neo4j and keeps the trained model loaded in memory.

---

## Step-by-Step Workflow

### **PART 1: Document Ingestion & Graph Building**

#### Step 1: User Uploads Content
- **Location**: `App.tsx` - `ADMIN_UPLOAD` view
- **Options**:
  - **Raw Text**: User pastes text directly into textarea
  - **PDF Document**: User uploads a PDF file

#### Step 2A: PDF Processing (if PDF uploaded)
- **Function**: `handleFileChange()` in `App.tsx`
- **Service**: `pdfService.ts` → `extractContentFromPdf()`

**Process**:
1. PDF file is loaded using `pdfjs-dist` library
2. For each page:
   - **Text Extraction**: Attempts to extract text using `getTextContent()`
   - **Decision Logic**: 
     - If text > 50 characters → Store as `text` type
     - If text ≤ 50 characters → Render page as image (canvas → base64)
3. Returns `ProcessedPdf` object with:
   - Array of `PdfPage` objects (each with `type: 'text' | 'image'`, `content`, `pageNumber`)
   - Total text length
   - Total image count

**Result**: PDF pages are stored in state as `pdfPages[]`

#### Step 2B: Text Processing (if raw text)
- Text is directly stored in `uploadText` state

#### Step 3: User Clicks "Ingest & Build Graph"
- **Function**: `handleUpload()` in `App.tsx`
- Creates a new document ID

#### Step 4: Chunking & Entity Extraction

**For PDF Mode**:
- **Function**: `extractGraphFromMixedContent()` in `textProcessingService.ts`
- Filters out image pages (can't process images with NLP)
- Combines all text pages into one text block
- Calls `extractGraphFromChunk()` on combined text

**For Raw Text Mode**:
- **Function**: `chunkText()` in `textProcessingService.ts`
  - Uses `compromise` NLP library to split text into sentences
  - Groups sentences into chunks (max 15,000 characters per chunk)
  - Respects sentence boundaries (better than character splitting)
- For each chunk, calls `extractGraphFromChunk()`

#### Step 5: NLP-Based Entity Extraction
- **Function**: `extractGraphFromChunk()` in `textProcessingService.ts`
- **Uses**: `compromise` JavaScript NLP library (similar to spaCy)

**Entity Extraction (`extractEntities()`)**:
1. **People**: Extracts person names using `doc.people()`
2. **Locations**: Extracts places using `doc.places()`
3. **Organizations**: Extracts companies/institutions using `doc.organizations()`
4. **Concepts**: Extracts important nouns (filters out common words, takes top 20)

**Relationship Extraction (`extractRelationships()`)**:
1. Analyzes sentences containing multiple entities
2. Finds entity pairs in the same sentence
3. Determines relationship type using pattern matching:
   - "works for" → `WORKS_FOR`
   - "located in" → `LOCATED_IN`
   - "part of" → `PART_OF`
   - "created" / "founded" → `CREATED_BY`
   - "uses" → `USES`
   - Default → `RELATED_TO`

**Result**: Returns `GraphData` with:
- `nodes[]`: Array of entities (id, label, group)
- `links[]`: Array of relationships (source, target, type)

#### Step 6: Graph Merging
- New nodes/links are merged with existing graph data
- **Deduplication**: Nodes with same ID (case-insensitive) are merged

#### Step 7: Save to Neo4j Database
- **Graph Data**: Saved to Neo4j using `saveGraphToNeo4j()`
  - Nodes are created/merged in Neo4j using MERGE operations
  - Relationships are created between nodes
  - Deduplication handled by Neo4j MERGE operations
- **Document & Chunks**: Saved using `saveDocumentToNeo4j()`
  - **Batched upload**: For large documents, chunks are automatically split into batches on the frontend before being sent to the backend, to avoid Vercel/serverless timeouts and oversized request bodies.
  - Document metadata stored as `Document` node
  - Text chunks stored as `Chunk` nodes
  - Chunks linked to `Document` and related entities
- **Why batching matters (Vercel/Serverless)**:
  - Vercel serverless functions have strict execution time and payload limits.
  - A single 800–1000+ page PDF can produce hundreds or thousands of chunks; sending them all in one request can cause:
    - Request timeouts
    - Silent partial ingestion (only early pages saved)
  - To prevent this, `saveDocumentToNeo4j()` now:
    - Splits the `chunks` array into smaller batches (default: 200 chunks per request)
    - Sends each batch sequentially to `/api/documents/save`
    - Treats the document as successfully saved only if **all** batches succeed
  - The backend document save logic is idempotent for a given `docId`, so multiple calls with different subsets of chunks safely accumulate into a single complete document in Neo4j.
- **Reload Graph**: Graph is reloaded from Neo4j to reflect all data
- **State Update**: Updates `graphData` state with combined graph from Neo4j

---

### **PART 2: Graph Loading & Visualization**

#### Step 8: Loading Graph from Neo4j (on App Mount)
- **Location**: `App.tsx` - `useEffect` hook
- **Function**: `loadGraphFromNeo4j()` from `neo4jService.ts`
- **Process**:
  - Queries Neo4j for all graph nodes and relationships
  - Returns graph data in format expected by visualization
  - Updates `graphData` state with loaded data
  - Falls back to empty graph if backend is unavailable

#### Step 9: Viewing the Graph
- **Location**: `App.tsx` - `ADMIN_GRAPH` view
- **Component**: `GraphVisualizer.tsx`

**Visualization Process**:
1. Uses **D3.js** force-directed graph layout
2. **Nodes**: 
   - Colored circles based on entity label (Person, Location, Organization, Concept)
   - Labeled with entity ID
   - Draggable (user can rearrange)
3. **Links**: 
   - Lines connecting related entities
   - Labeled with relationship type
   - Arrows showing direction
4. **Physics Simulation**:
   - Nodes repel each other (charge force)
   - Links pull connected nodes together
   - Collision detection prevents overlap
   - Centers graph in viewport

**Legend**: Shows color coding for different entity types

---

### **PART 3: Chatbot (RAG System)**

#### Step 10: User Asks a Question
- **Location**: `App.tsx` - `USER_CHAT` view
- User types question in input field
- Clicks send or presses Enter

#### Step 11: Context Retrieval (RAG)
- **Function**: `chatWithRAG()` in `neo4jService.ts`
- **Backend Service**: `ragService.js` uses Neo4j Cypher queries

**Enhanced RAG Retrieval Strategy**:
1. **R-GCN Enhanced Retrieval** (if available):
   - Checks if R-GCN service is available (hosted on Render.com)
   - Uses semantic embeddings to find similar entities
   - Leverages graph structure for better context matching
   - Falls back to standard retrieval if R-GCN unavailable

2. **Graph-Based Entity Search**:
   - Queries Neo4j for entities matching query keywords
   - Finds chunks linked to those entities via relationships
   - Multi-hop traversal: follows relationships to find related entities and their chunks

3. **Keyword-Based Fallback**:
   - If no entities found, searches all chunks for query keywords
   - Uses text search on chunk content

4. **Graph Summary Fallback**:
   - If still no matches, returns list of known entities from graph

**Result**: Returns top 3 most relevant text chunks from Neo4j (enhanced with R-GCN semantic similarity if available)

#### Step 12: Generate Response with Gemini
- **Function**: `generateRAGResponse()` in `geminiService.ts`
- **This is the ONLY place Gemini API is used** (for chatbot responses only)

**Process**:
1. Constructs prompt with:
   - System instructions (RAG assistant role)
   - Retrieved context chunks
   - User's question
2. Calls Gemini 2.5 Flash API with the prompt
3. Returns generated response

#### Step 13: Display Response
- Bot message is added to chat history
- Shows:
   - Response text
   - "View Sources" expandable section showing retrieved context chunks
   - Timestamp

---

## Key Technologies Used

### **Text Processing (Local, No API)**:
- **compromise**: JavaScript NLP library for entity extraction and text processing
  - Sentence segmentation
  - Named entity recognition (people, places, organizations)
  - Part-of-speech tagging
  - Noun extraction

### **PDF Processing**:
- **pdfjs-dist**: Extracts text and renders images from PDF files
  - Text extraction for searchable PDFs
  - Canvas rendering for scanned/image PDFs

### **Graph Visualization**:
- **D3.js**: Force-directed graph layout and rendering
  - Interactive nodes and links
  - Physics simulation
  - Drag-and-drop interaction

### **LLM (Only for Chatbot)**:
- **Gemini 2.5 Flash API**: Generates responses based on retrieved context
  - Fast, cost-effective model
  - Used ONLY for chatbot responses (not for extraction)

---

## Data Flow Summary

```
1. Upload → PDF/Text
   ↓
2. Extract → Text Chunks + Images
   ↓
3. Process → NLP Entity/Relationship Extraction (Compromise.js)
   ↓
4. Build → Knowledge Graph (Nodes + Links)
   ↓
5. Store → Neo4j Database (Persistent Storage)
   ↓
6. Load → Graph Data from Neo4j on App Mount
   ↓
7. Visualize → D3.js Graph View
   ↓
8. Query → RAG Retrieval via Neo4j Cypher Queries
   ↓
9. Respond → Gemini API (Chatbot Response)
```

---

## Important Design Decisions

### **Why NLP for Extraction?**
- **Fast**: No API latency
- **Free**: No API costs
- **Offline**: Works without internet
- **Reliable**: No rate limits or service overload

### **Why Gemini Only for Chat?**
- **Quality**: LLMs excel at generating natural language responses
- **Context Understanding**: Better at synthesizing information from retrieved chunks
- **Cost Effective**: Only called when user chats, not during bulk processing

### **Hybrid PDF Processing**:
- Text pages: Extracted and processed with NLP
- Image pages: Rendered but not processed (would require vision model)
- Smart threshold: 50 characters to distinguish text vs image pages

---

## State Management

The app maintains several key state variables:

1. **`graphData`**: The knowledge graph (nodes + links) - loaded from Neo4j, persists across sessions
2. **`documents`**: List of ingested documents with their chunks (loaded from Neo4j)
3. **`messages`**: Chat conversation history (session-only, not persisted)
4. **`pdfPages`**: Currently selected PDF pages (before ingestion)
5. **`uploadText`**: Raw text input (before ingestion)

**Important**: Graph data and documents are persisted in Neo4j database, not just in React state. The state is loaded from Neo4j on app mount and updated after each document ingestion.

---

## User Interface Views

1. **Chat View** (`USER_CHAT`): Main chatbot interface
2. **Ingest View** (`ADMIN_UPLOAD`): Document upload and processing
3. **Graph View** (`ADMIN_GRAPH`): Interactive knowledge graph visualization

---

This architecture provides a fast, cost-effective knowledge graph system that processes documents locally and uses AI only where it adds the most value - generating natural language responses.

