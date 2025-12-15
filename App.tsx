import React, { useState, useEffect } from 'react';
import { Layout, Upload, Network, MessageSquare, Database, FileText, Share2, Search, Bot } from 'lucide-react';
import { AppView, IngestedDocument, GraphData, Message } from './types';
import GraphVisualizer from './components/GraphVisualizer';
import { chunkText, extractGraphFromChunk, generateRAGResponse } from './services/geminiService';

const SAMPLE_TEXT = `
Apple Inc. is an American multinational technology company headquartered in Cupertino, California, that designs, develops, and sells consumer electronics, computer software, and online services. 
Steve Jobs, Steve Wozniak, and Ronald Wayne founded Apple in April 1976 to develop and sell Wozniak's Apple I personal computer.
Tim Cook is the current CEO of Apple.
Google is a major competitor to Apple in the mobile operating system market.
Neo4j is a graph database management system developed by Neo4j, Inc.
Firebase provides backend services such as Firestore and Authentication.
`;

const App = () => {
  // --- STATE (Simulating Firebase & Neo4j) ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.USER_CHAT);
  
  // "Firebase" - Document Store
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  
  // "Neo4j" - Graph Store
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  
  // "Chat" - Message History
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Welcome to the Knowledge Graph Chatbot. Switch to Admin to upload data!', timestamp: Date.now() }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadText, setUploadText] = useState(SAMPLE_TEXT);

  // --- ACTIONS ---

  // 1. UPLOAD & PROCESS (Simulates Admin Upload -> Chunking -> Extraction)
  const handleUpload = async () => {
    if (!uploadText.trim()) return;
    setIsProcessing(true);

    const newDocId = Math.random().toString(36).substr(2, 9);
    
    // Step 1: Chunking (Firebase Function simulation)
    const chunksRaw = chunkText(uploadText);
    const chunks = chunksRaw.map(text => ({ id: Math.random().toString(36), text, sourceDoc: newDocId }));

    const newDoc: IngestedDocument = {
      id: newDocId,
      name: `Document ${documents.length + 1}`,
      uploadDate: new Date().toLocaleDateString(),
      status: 'processing',
      chunks
    };

    setDocuments(prev => [...prev, newDoc]);

    // Step 2: Extraction (Building the Graph)
    let newNodes: any[] = [];
    let newLinks: any[] = [];

    // Process chunks sequentially to build graph
    for (const chunk of chunks) {
      const extracted = await extractGraphFromChunk(chunk.text);
      newNodes = [...newNodes, ...extracted.nodes];
      newLinks = [...newLinks, ...extracted.links];
    }

    // Merge with existing graph (deduplication logic simplified for demo)
    setGraphData(prev => {
      // Very basic deduplication based on ID
      const allNodes = [...prev.nodes, ...newNodes];
      const allLinks = [...prev.links, ...newLinks];
      
      const uniqueNodes = Array.from(new Map(allNodes.map(item => [item.id.toLowerCase(), item])).values());
      const uniqueLinks = allLinks; // Links are harder to dedup without complex keys, allowing duplicates for visual density in demo

      return { nodes: uniqueNodes, links: uniqueLinks };
    });

    setDocuments(prev => prev.map(d => d.id === newDocId ? { ...d, status: 'ready' } : d));
    setIsProcessing(false);
    setUploadText('');
  };

  // 2. RETRIEVER (Simulates searching Neo4j/Vector DB)
  const retrieveContext = (query: string): string[] => {
    const queryLower = query.toLowerCase();
    const relevantChunks: string[] = [];

    // Simple keyword matching against graph nodes for the "Graph Retriever" simulation
    // In a real app, this would be an R-GCN or Vector similarity search
    const hitNodes = graphData.nodes.filter(n => queryLower.includes(n.id.toLowerCase()) || queryLower.includes(n.label.toLowerCase()));
    
    // Find documents containing these entities (Reverse index simulation)
    if (hitNodes.length > 0) {
        // If we found graph nodes, look for chunks that mention them
        documents.forEach(doc => {
            doc.chunks.forEach(chunk => {
                const chunkLower = chunk.text.toLowerCase();
                if (hitNodes.some(n => chunkLower.includes(n.id.toLowerCase()))) {
                    relevantChunks.push(chunk.text);
                }
            });
        });
    } else {
        // Fallback: If no specific graph entities found, simplistic text search on chunks
         documents.forEach(doc => {
            doc.chunks.forEach(chunk => {
                if (chunk.text.toLowerCase().includes(queryLower)) {
                    relevantChunks.push(chunk.text);
                }
            });
        });
    }
    
    // Limit context
    return [...new Set(relevantChunks)].slice(0, 3);
  };

  // 3. CHAT (Simulates User -> Retriever -> LLM)
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg: Message = { role: 'user', content: inputMessage, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);

    // Step 1: Retrieve
    const retrievedContext = retrieveContext(inputMessage);

    // Step 2: Generate (Gemini)
    const answer = await generateRAGResponse(inputMessage, retrievedContext);

    const botMsg: Message = {
      role: 'model',
      content: answer,
      timestamp: Date.now(),
      retrievedContext
    };

    setMessages(prev => [...prev, botMsg]);
    setIsProcessing(false);
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-slate-800">
      
      {/* SIDEBAR */}
      <div className="w-64 bg-slate-900 text-white flex flex-col shadow-xl">
        <div className="p-6 border-b border-slate-700">
            <h1 className="text-xl font-bold flex items-center gap-2">
                <Share2 className="text-blue-400" /> NeuroGraph
            </h1>
            <p className="text-xs text-slate-400 mt-1">Firebase + Neo4j Architecture</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">User Zone</div>
            <button 
                onClick={() => setCurrentView(AppView.USER_CHAT)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === AppView.USER_CHAT ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
                <MessageSquare size={18} /> Chat Interface
            </button>

            <div className="mt-8 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admin Zone</div>
            <button 
                onClick={() => setCurrentView(AppView.ADMIN_UPLOAD)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === AppView.ADMIN_UPLOAD ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
                <Upload size={18} /> Upload & Process
            </button>
            <button 
                onClick={() => setCurrentView(AppView.ADMIN_GRAPH)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === AppView.ADMIN_GRAPH ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
                <Network size={18} /> Knowledge Graph
            </button>
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
            <div>Engine: Gemini 2.5 Flash</div>
            <div>Store: Simulated (Local)</div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <header className="bg-white h-16 border-b border-gray-200 flex items-center px-8 justify-between shadow-sm">
            <h2 className="text-xl font-semibold text-gray-800">
                {currentView === AppView.USER_CHAT && "Chatbot Interface"}
                {currentView === AppView.ADMIN_UPLOAD && "Admin: Data Ingestion"}
                {currentView === AppView.ADMIN_GRAPH && "Admin: Graph Explorer (Neo4j View)"}
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Database size={16} />
                <span>{documents.length} Docs</span>
                <span className="mx-2">|</span>
                <Share2 size={16} />
                <span>{graphData.nodes.length} Nodes</span>
            </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
            
            {/* VIEW: UPLOAD */}
            {currentView === AppView.ADMIN_UPLOAD && (
                <div className="max-w-3xl mx-auto space-y-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                            <FileText className="text-blue-500" /> 
                            Upload Knowledge Base (PDF/Text)
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Paste text below (or content extracted from PDF) to ingest into the system. 
                            The pipeline will Chunk the data, store in Firebase, and perform Extraction for Neo4j.
                        </p>
                        <textarea 
                            className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-mono text-sm"
                            placeholder="Paste text content here..."
                            value={uploadText}
                            onChange={(e) => setUploadText(e.target.value)}
                        />
                        <div className="mt-4 flex justify-end">
                            <button 
                                onClick={handleUpload}
                                disabled={isProcessing || !uploadText}
                                className={`px-6 py-2 rounded-lg font-medium text-white shadow-sm flex items-center gap-2
                                    ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                                `}
                            >
                                {isProcessing ? 'Processing Pipeline...' : 'Ingest & Build Graph'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-medium mb-4">Ingestion Pipeline Status</h3>
                        {documents.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">No documents processed yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {documents.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${doc.status === 'ready' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                            <span className="font-medium text-gray-700">{doc.name}</span>
                                            <span className="text-xs text-gray-400">ID: {doc.id}</span>
                                        </div>
                                        <div className="text-xs bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">
                                            {doc.chunks.length} Chunks
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* VIEW: GRAPH */}
            {currentView === AppView.ADMIN_GRAPH && (
                <div className="h-full flex flex-col">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col">
                         <div className="mb-4 flex justify-between items-center">
                            <h3 className="font-medium">Neo4j Visualization</h3>
                            <div className="text-sm text-gray-500">
                                Interactive Force-Directed Graph using D3.js
                            </div>
                         </div>
                         <div className="flex-1 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 relative">
                             <GraphVisualizer data={graphData} />
                         </div>
                         <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                             <div className="p-3 bg-blue-50 rounded-lg">
                                 <div className="text-2xl font-bold text-blue-600">{graphData.nodes.length}</div>
                                 <div className="text-xs text-blue-800 uppercase font-semibold">Entities</div>
                             </div>
                             <div className="p-3 bg-indigo-50 rounded-lg">
                                 <div className="text-2xl font-bold text-indigo-600">{graphData.links.length}</div>
                                 <div className="text-xs text-indigo-800 uppercase font-semibold">Relationships</div>
                             </div>
                             <div className="p-3 bg-emerald-50 rounded-lg">
                                 <div className="text-2xl font-bold text-emerald-600">{documents.length}</div>
                                 <div className="text-xs text-emerald-800 uppercase font-semibold">Sources</div>
                             </div>
                         </div>
                    </div>
                </div>
            )}

            {/* VIEW: CHAT */}
            {currentView === AppView.USER_CHAT && (
                <div className="max-w-4xl mx-auto h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                    {msg.role === 'model' && (
                                        <div className="flex items-center gap-2 mb-2 text-blue-600 font-semibold text-xs uppercase tracking-wide">
                                            <Bot size={14} /> AI Assistant
                                        </div>
                                    )}
                                    <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                                    
                                    {/* DEBUG: Show Retrieved Context */}
                                    {msg.retrievedContext && msg.retrievedContext.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-gray-200/50">
                                            <p className="text-[10px] uppercase font-bold text-gray-500 mb-1 flex items-center gap-1">
                                                <Search size={10} /> Retrieved Context (RAG)
                                            </p>
                                            <div className="space-y-1">
                                                {msg.retrievedContext.map((ctx, cIdx) => (
                                                    <div key={cIdx} className="text-[10px] bg-white/50 p-1.5 rounded border border-gray-200/50 truncate">
                                                        "{ctx.substring(0, 100)}..."
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isProcessing && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-2xl p-4 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 bg-gray-50 border-t border-gray-200">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Ask about the knowledge graph..."
                                disabled={isProcessing}
                                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm disabled:opacity-50"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={isProcessing || !inputMessage.trim()}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Share2 className="rotate-90" size={20} />
                            </button>
                        </div>
                        <div className="text-center mt-2 text-xs text-gray-400">
                            Powered by Gemini 2.5 Flash • In-Browser RAG Simulation
                        </div>
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default App;
