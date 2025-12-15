import React, { useState } from 'react';
import { Layout, Upload, Network, MessageSquare, Database, FileText, Share2, Search, Bot, FileUp, X, Loader2, Image as ImageIcon, FileType2 } from 'lucide-react';
import { AppView, IngestedDocument, GraphData, Message } from './types';
import GraphVisualizer from './components/GraphVisualizer';
import { chunkText, extractGraphFromChunk, extractGraphFromMixedContent, generateRAGResponse } from './services/geminiService';
import { extractContentFromPdf, PdfPage } from './services/pdfService';

const SAMPLE_TEXT = `
Apple Inc. is an American multinational technology company headquartered in Cupertino, California, that designs, develops, and sells consumer electronics, computer software, and online services. 
Steve Jobs, Steve Wozniak, and Ronald Wayne founded Apple in April 1976 to develop and sell Wozniak's Apple I personal computer.
Tim Cook is the current CEO of Apple.
Google is a major competitor to Apple in the mobile operating system market.
Neo4j is a graph database management system developed by Neo4j, Inc.
Firebase provides backend services such as Firestore and Authentication.
`;

const App = () => {
  // --- STATE ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.USER_CHAT);
  
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Welcome to the Knowledge Graph Chatbot. Switch to Admin to upload data!', timestamp: Date.now() }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  
  // Upload State
  const [uploadMode, setUploadMode] = useState<'text' | 'pdf'>('text');
  const [uploadText, setUploadText] = useState(SAMPLE_TEXT);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  
  // New Hybrid State
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [pdfStats, setPdfStats] = useState({ textLen: 0, imgCount: 0 });
  
  const [isParsingPdf, setIsParsingPdf] = useState(false);

  // --- ACTIONS ---

  // 1. PDF HANDLING
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    setIsParsingPdf(true);
    setUploadText(''); 
    setPdfPages([]);
    setPdfStats({ textLen: 0, imgCount: 0 });

    try {
        const result = await extractContentFromPdf(file);
        
        setPdfPages(result.pages);
        setPdfStats({
            textLen: result.totalTextLength,
            imgCount: result.totalImages
        });

        // Set preview text for UI consistency
        if (result.totalTextLength > 0) {
            const preview = result.pages.filter(p => p.type === 'text').map(p => p.content).join('\n').slice(0, 1000);
            setUploadText(preview + (preview.length >= 1000 ? '...' : ''));
        } else {
             setUploadText(`[Scanned Document] ${result.totalImages} pages extracted as images.`);
        }

    } catch (error: any) {
        console.error(error);
        alert(error.message || "Failed to parse PDF.");
        setPdfFileName('');
    } finally {
        setIsParsingPdf(false);
    }
  };

  const clearPdfSelection = () => {
    setPdfFileName('');
    setUploadText('');
    setPdfPages([]);
    setPdfStats({ textLen: 0, imgCount: 0 });
  };

  // 2. UPLOAD & PROCESS
  const handleUpload = async () => {
    if (!uploadText && pdfPages.length === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Initializing ingestion...');

    const newDocId = Math.random().toString(36).substr(2, 9);
    const docName = uploadMode === 'pdf' && pdfFileName ? pdfFileName : `Document ${documents.length + 1}`;
    
    let newNodes: any[] = [];
    let newLinks: any[] = [];
    let chunks: any[] = [];

    // --- STRATEGY A: PDF (HYBRID) ---
    if (uploadMode === 'pdf' && pdfPages.length > 0) {
        
        // 1. Store Pages as Chunks (for RAG retrieval display)
        chunks = pdfPages.map(p => ({
            id: Math.random().toString(36),
            text: p.type === 'text' ? p.content : `[Image Page ${p.pageNumber}]`,
            sourceDoc: newDocId
        }));

        setProcessingStatus(`Processing ${pdfPages.length} pages (Text & Vision mix)...`);
        
        // Batch pages to avoid sending massive payloads if PDF is huge
        // Simple batching: 5 pages per request
        const BATCH_SIZE = 5;
        for (let i = 0; i < pdfPages.length; i += BATCH_SIZE) {
            const batch = pdfPages.slice(i, i + BATCH_SIZE);
            setProcessingStatus(`Analyzing pages ${i+1}-${Math.min(i+BATCH_SIZE, pdfPages.length)} of ${pdfPages.length}...`);
            
            const extracted = await extractGraphFromMixedContent(batch);
            newNodes = [...newNodes, ...extracted.nodes];
            newLinks = [...newLinks, ...extracted.links];
        }

    } 
    // --- STRATEGY B: RAW TEXT ---
    else {
        // Step 1: Chunking
        const chunksRaw = chunkText(uploadText);
        chunks = chunksRaw.map(text => ({ id: Math.random().toString(36), text, sourceDoc: newDocId }));
        
        // Step 2: Extraction
        for (let i = 0; i < chunks.length; i++) {
          setProcessingStatus(`Extracting entities from chunk ${i + 1} of ${chunks.length}...`);
          const chunk = chunks[i];
          const extracted = await extractGraphFromChunk(chunk.text);
          newNodes = [...newNodes, ...extracted.nodes];
          newLinks = [...newLinks, ...extracted.links];
        }
    }

    setProcessingStatus('Finalizing Graph...');

    const newDoc: IngestedDocument = {
      id: newDocId,
      name: docName,
      uploadDate: new Date().toLocaleDateString(),
      status: 'ready',
      chunks
    };
    
    setDocuments(prev => [...prev, newDoc]);

    // Merge with existing graph
    setGraphData(prev => {
      const allNodes = [...prev.nodes, ...newNodes];
      const allLinks = [...prev.links, ...newLinks];
      
      const uniqueNodes = Array.from(new Map(allNodes.map(item => [item.id.toLowerCase(), item])).values());
      const uniqueLinks = allLinks; 

      return { nodes: uniqueNodes, links: uniqueLinks };
    });

    setIsProcessing(false);
    setProcessingStatus('');
    
    if (uploadMode === 'text') {
        setUploadText('');
    } else {
        clearPdfSelection();
    }
  };

  // 3. RETRIEVER
  const retrieveContext = (query: string): string[] => {
    const queryLower = query.toLowerCase();
    const relevantChunks: string[] = [];
    const hitNodes = graphData.nodes.filter(n => queryLower.includes(n.id.toLowerCase()) || queryLower.includes(n.label.toLowerCase()));
    
    // Graph-based retrieval
    if (hitNodes.length > 0) {
        documents.forEach(doc => {
            doc.chunks.forEach(chunk => {
                if (hitNodes.some(n => chunk.text.toLowerCase().includes(n.id.toLowerCase()))) {
                    relevantChunks.push(chunk.text);
                }
            });
        });
    } 
    
    // Fallback: Text search
    if (relevantChunks.length === 0) {
         documents.forEach(doc => {
            doc.chunks.forEach(chunk => {
                if (chunk.text.toLowerCase().includes(queryLower)) {
                    relevantChunks.push(chunk.text);
                }
            });
        });
    }

    // Fallback: Graph summary if nothing found in text (common for pure image PDFs if OCR was skipped in favor of vision)
    if (relevantChunks.length === 0) {
        const relevantNodes = graphData.nodes.slice(0, 50).map(n => n.id).join(", ");
        if (relevantNodes) relevantChunks.push(`Known Entities in Graph: ${relevantNodes}`);
    }

    return [...new Set(relevantChunks)].slice(0, 3);
  };

  // 4. CHAT
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg: Message = { role: 'user', content: inputMessage, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);
    setProcessingStatus('Thinking...');

    const retrievedContext = retrieveContext(inputMessage);
    const answer = await generateRAGResponse(inputMessage, retrievedContext);

    const botMsg: Message = {
      role: 'model',
      content: answer,
      timestamp: Date.now(),
      retrievedContext
    };

    setMessages(prev => [...prev, botMsg]);
    setIsProcessing(false);
    setProcessingStatus('');
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
                        <div className="flex items-center justify-between mb-6">
                             <h3 className="text-lg font-medium flex items-center gap-2">
                                <FileText className="text-blue-500" /> 
                                Knowledge Base Ingestion
                            </h3>
                            <div className="flex bg-gray-100 p-1 rounded-lg text-sm">
                                <button 
                                    onClick={() => setUploadMode('text')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${uploadMode === 'text' ? 'bg-white shadow text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Raw Text
                                </button>
                                <button 
                                    onClick={() => setUploadMode('pdf')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${uploadMode === 'pdf' ? 'bg-white shadow text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    PDF Upload
                                </button>
                            </div>
                        </div>

                        {uploadMode === 'text' ? (
                            <>
                                <textarea 
                                    className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-mono text-sm bg-white text-gray-900 placeholder-gray-400"
                                    placeholder="Paste text content here..."
                                    value={uploadText}
                                    onChange={(e) => setUploadText(e.target.value)}
                                />
                            </>
                        ) : (
                             <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors bg-white">
                                {pdfFileName ? (
                                    <div className="w-full">
                                        <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
                                            <div className="flex items-center gap-3">
                                                {pdfStats.imgCount > 0 ? (
                                                    <FileType2 className="text-purple-600" size={24} />
                                                ) : (
                                                    <FileText className="text-blue-600" size={24} />
                                                )}
                                                <div className="text-left">
                                                    <div className="font-medium text-blue-900">{pdfFileName}</div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                                        <span>{pdfStats.textLen > 0 ? `${(pdfStats.textLen / 1000).toFixed(1)}k chars` : 'No text'}</span>
                                                        <span>•</span>
                                                        <span>{pdfStats.imgCount} scanned pages</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={clearPdfSelection} className="text-blue-400 hover:text-blue-600 p-1">
                                                <X size={20} />
                                            </button>
                                        </div>
                                        
                                        {isParsingPdf && (
                                            <div className="text-sm text-gray-500 animate-pulse">Extracting content from PDF...</div>
                                        )}

                                        {/* Status Display */}
                                        {!isParsingPdf && (
                                            <div className="text-left bg-gray-50 p-3 rounded-lg border border-gray-100 text-xs">
                                                <div className="font-semibold text-gray-600 mb-2">Content Analysis:</div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="text-gray-400 block">Text Content</span>
                                                        <span className={`font-medium ${pdfStats.textLen > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                                            {pdfStats.textLen > 0 ? 'Detected' : 'Empty'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400 block">Visual Content</span>
                                                        <span className={`font-medium ${pdfStats.imgCount > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                                                            {pdfStats.imgCount > 0 ? `${pdfStats.imgCount} Pages (Gemini Vision)` : 'None'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {uploadText && pdfStats.textLen > 0 && (
                                                     <div className="mt-3 pt-3 border-t border-gray-200">
                                                        <p className="text-gray-400 mb-1">Preview:</p>
                                                        <p className="font-mono text-gray-500 line-clamp-3">{uploadText}</p>
                                                     </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                                            <FileUp size={32} />
                                        </div>
                                        <h4 className="font-medium text-gray-900 mb-1">Click to upload PDF</h4>
                                        <p className="text-sm text-gray-500 mb-4">Supports Text & Scanned Documents</p>
                                        <input 
                                            type="file" 
                                            accept=".pdf"
                                            onChange={handleFileChange}
                                            className="block w-full text-sm text-slate-500
                                            file:mr-4 file:py-2 file:px-4
                                            file:rounded-full file:border-0
                                            file:text-sm file:font-semibold
                                            file:bg-blue-50 file:text-blue-700
                                            hover:file:bg-blue-100
                                            mx-auto max-w-xs
                                            "
                                        />
                                    </>
                                )}
                             </div>
                        )}

                        <div className="mt-6 flex justify-end items-center gap-4">
                             {isProcessing && (
                                <span className="text-sm text-blue-600 flex items-center gap-2 animate-pulse">
                                    <Loader2 size={16} className="animate-spin" />
                                    {processingStatus}
                                </span>
                            )}
                            <button 
                                onClick={handleUpload}
                                disabled={isProcessing || (!uploadText && pdfPages.length === 0) || isParsingPdf}
                                className={`px-6 py-2 rounded-lg font-medium text-white shadow-sm flex items-center gap-2
                                    ${(isProcessing || (!uploadText && pdfPages.length === 0) || isParsingPdf) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                                `}
                            >
                                {isProcessing ? 'Processing...' : 'Ingest & Build Graph'}
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
                         </div>
                         <div className="flex-1 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 relative">
                             <GraphVisualizer data={graphData} />
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
                                    <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                                </div>
                            </div>
                        ))}
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
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default App;
