import React, { useState, useRef, useEffect } from 'react';
import { 
  Layout, Upload, Network, MessageSquare, Database, FileText, Share2, 
  Search, Bot, FileUp, X, Loader2, Image as ImageIcon, FileType2, 
  Send, User, Settings, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { AppView, IngestedDocument, GraphData, Message } from './types';
import GraphVisualizer from './components/GraphVisualizer';
import { chunkText, extractGraphFromChunk, extractGraphFromMixedContent } from './services/textProcessingService';
import { extractContentFromPdf, PdfPage } from './services/pdfService';
import { 
  saveGraphToNeo4j, 
  loadGraphFromNeo4j, 
  saveDocumentToNeo4j,
  chatWithRAG 
} from './services/neo4jService';
import { 
  Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge, Label, Alert, AlertTitle, AlertDescription 
} from './components/ui';
import { cn } from './lib/utils';

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
    { role: 'system', content: 'Welcome to the Knowledge Graph Chatbot. I can answer questions based on the documents you upload.', timestamp: Date.now() }
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
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load graph from Neo4j on mount
  useEffect(() => {
    const loadInitialGraph = async () => {
      try {
        // Silently load graph on mount - don't show processing status
        const graphData = await loadGraphFromNeo4j();
        setGraphData(graphData);
      } catch (error) {
        console.warn('Failed to load graph from Neo4j on mount (will start empty):', error);
        // Fallback: start with empty graph if backend is not available
        // Don't show error to user on page load - this is expected if backend is down
        setGraphData({ nodes: [], links: [] });
      }
    };
    
    loadInitialGraph();
  }, []);

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
        chunks = pdfPages.map(p => ({
            id: Math.random().toString(36),
            text: p.type === 'text' ? p.content : `[Image Page ${p.pageNumber}]`,
            sourceDoc: newDocId
        }));

        setProcessingStatus(`Processing ${pdfPages.length} pages using NLP extraction...`);
        
        // Extract graph from all pages at once (NLP is fast, no need for batching)
        const extracted = extractGraphFromMixedContent(pdfPages);
        newNodes = [...newNodes, ...extracted.nodes];
        newLinks = [...newLinks, ...extracted.links];

    } 
    // --- STRATEGY B: RAW TEXT ---
    else {
        const chunksRaw = chunkText(uploadText);
        chunks = chunksRaw.map(text => ({ id: Math.random().toString(36), text, sourceDoc: newDocId }));
        
        for (let i = 0; i < chunks.length; i++) {
          setProcessingStatus(`Extracting entities from chunk ${i + 1} of ${chunks.length}...`);
          const chunk = chunks[i];
          const extracted = extractGraphFromChunk(chunk.text);
          newNodes = [...newNodes, ...extracted.nodes];
          newLinks = [...newLinks, ...extracted.links];
        }
    }

    setProcessingStatus('Saving to Neo4j database...');

    try {
      // Save graph data to Neo4j
      await saveGraphToNeo4j(newNodes, newLinks);
      
      // Save document and chunks to Neo4j
      const entityIds = newNodes.map(n => n.id);
      await saveDocumentToNeo4j(newDocId, docName, chunks, entityIds);
      
      // Update local documents state immediately (data is saved)
      const newDoc: IngestedDocument = {
        id: newDocId,
        name: docName,
        uploadDate: new Date().toLocaleDateString(),
        status: 'ready',
        chunks
      };
      
      setDocuments(prev => [...prev, newDoc]);
      
      // Update graph state with new nodes/links (don't wait for reload if it fails)
      setGraphData(prev => {
        const allNodes = [...prev.nodes, ...newNodes];
        const allLinks = [...prev.links, ...newLinks];
        
        // Deduplicate nodes (case-insensitive)
        const uniqueNodes = Array.from(
          new Map(allNodes.map(item => [item.id.toLowerCase(), item])).values()
        );
        
        return { nodes: uniqueNodes, links: allLinks };
      });
      
      // Clear processing immediately - data is saved and state is updated
      setIsProcessing(false);
      setProcessingStatus('');
      
      // Clear upload state
      if (uploadMode === 'text') {
        setUploadText('');
      } else {
        clearPdfSelection();
      }
      
      // Try to reload graph from Neo4j in background (non-blocking, optional)
      // This ensures we have the latest deduplicated data, but doesn't block the UI
      loadGraphFromNeo4j()
        .then(updatedGraph => {
          setGraphData(updatedGraph);
        })
        .catch(error => {
          console.warn('Failed to reload graph from Neo4j (data is saved):', error);
          // Data is already saved and graph state is updated, so this is non-critical
        });
      
    } catch (error: any) {
      console.error('Error saving to Neo4j:', error);
      setIsProcessing(false);
      setProcessingStatus('');
      alert(`Failed to save to database: ${error.message || 'Unknown error'}. Please ensure the backend server is running.`);
      // Don't update state if save failed
      return;
    }
  };

  // 3. CHAT
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg: Message = { role: 'user', content: inputMessage, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    const query = inputMessage;
    setInputMessage('');
    setIsProcessing(true);
    setProcessingStatus('Thinking...');

    try {
      // Use backend RAG chat endpoint (retrieves context + generates response)
      // This keeps the API key secure on the backend
      const result = await chatWithRAG(query);
      
      const botMsg: Message = {
        role: 'model',
        content: result.response,
        timestamp: Date.now(),
        retrievedContext: result.context
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error: any) {
      console.error('Chat error:', error);
      
      // Try to parse error response for better messaging
      let errorMessage = error.message || 'Unknown error';
      
      // If it's a rate limit error, provide more helpful guidance
      if (errorMessage.includes('Rate limit') || errorMessage.includes('quota')) {
        errorMessage = `⚠️ **Rate Limit Reached**: ${errorMessage}\n\n` +
          `**Solutions:**\n` +
          `• Wait for the quota to reset (free tier: 20 requests/day)\n` +
          `• Upgrade your Gemini API plan for higher limits\n` +
          `• Check your usage: https://ai.dev/usage?tab=rate-limit`;
      }
      
      const errorMsg: Message = {
        role: 'model',
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: Date.now(),
        retrievedContext: []
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const NavItem = ({ view, icon: Icon, label }: { view: AppView; icon: any; label: string }) => (
    <Button
      variant={currentView === view ? "secondary" : "ghost"}
      className={cn("w-full justify-start gap-2", currentView === view ? "bg-slate-200" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800")}
      onClick={() => setCurrentView(view)}
    >
      <Icon size={18} />
      {label}
    </Button>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-950 text-slate-50 flex flex-col border-r border-slate-800">
        <div className="p-6">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <div className="bg-blue-600 p-1.5 rounded-lg">
                <Share2 className="text-white h-5 w-5" />
            </div>
            NeuroGraph
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">Knowledge Graph RAG</p>
        </div>
        
        <nav className="flex-1 px-3 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Workspace</div>
          <NavItem view={AppView.USER_CHAT} icon={MessageSquare} label="Chat" />
          
          <div className="mt-8 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</div>
          <NavItem view={AppView.ADMIN_UPLOAD} icon={Upload} label="Ingest Data" />
          <NavItem view={AppView.ADMIN_GRAPH} icon={Network} label="Graph View" />
        </nav>

        <div className="p-4 bg-slate-900 m-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 mb-2">
                <Database className="text-blue-500" size={14} />
                <span className="text-xs font-medium text-slate-300">Storage</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Docs</span>
                <span>{documents.length}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
                <span>Nodes</span>
                <span>{graphData.nodes.length}</span>
            </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* VIEW: UPLOAD */}
        {currentView === AppView.ADMIN_UPLOAD && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Ingest Data</h2>
                    <p className="text-slate-500">Upload documents to build your knowledge graph.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg">Upload Content</CardTitle>
                            <CardDescription>Supported formats: Plain Text, PDF (OCR/Vision)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex p-1 bg-slate-100 rounded-lg w-fit">
                                    <button 
                                        onClick={() => setUploadMode('text')}
                                        className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", uploadMode === 'text' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                                    >
                                        Raw Text
                                    </button>
                                    <button 
                                        onClick={() => setUploadMode('pdf')}
                                        className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", uploadMode === 'pdf' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                                    >
                                        PDF Document
                                    </button>
                                </div>

                                {uploadMode === 'text' ? (
                                    <Textarea 
                                        placeholder="Paste your knowledge base content here..."
                                        className="h-64 font-mono text-sm"
                                        value={uploadText}
                                        onChange={(e) => setUploadText(e.target.value)}
                                    />
                                ) : (
                                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 flex flex-col items-center justify-center text-center hover:bg-slate-50/50 transition-colors">
                                        {pdfFileName ? (
                                            <div className="w-full max-w-sm">
                                                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                                    <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                        <FileText className="text-blue-600" size={20} />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <p className="text-sm font-medium text-blue-900 truncate">{pdfFileName}</p>
                                                        <p className="text-xs text-blue-700">
                                                            {pdfStats.imgCount > 0 ? `${pdfStats.imgCount} pages` : 'Text only'}
                                                        </p>
                                                    </div>
                                                    <Button variant="ghost" size="icon" onClick={clearPdfSelection} className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-100">
                                                        <X size={16} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-500">
                                                    <Upload size={24} />
                                                </div>
                                                <h3 className="font-semibold text-slate-900">Click to upload PDF</h3>
                                                <p className="text-sm text-slate-500 mt-1 mb-4">Max file size 10MB</p>
                                                <Input 
                                                    type="file" 
                                                    accept=".pdf"
                                                    onChange={handleFileChange}
                                                    className="max-w-xs cursor-pointer"
                                                />
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-3 border-t bg-slate-50/50 p-4">
                             {isProcessing && (
                                <div className="flex items-center gap-2 text-sm text-slate-500 mr-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    {processingStatus}
                                </div>
                            )}
                            <Button 
                                onClick={handleUpload} 
                                disabled={isProcessing || (!uploadText && pdfPages.length === 0) || isParsingPdf}
                            >
                                {isProcessing ? 'Processing...' : 'Ingest & Build Graph'}
                            </Button>
                        </CardFooter>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Processing Queue</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {documents.length === 0 && (
                                    <div className="text-sm text-slate-400 text-center py-4">No documents yet</div>
                                )}
                                {documents.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between text-sm group">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className={cn("h-2 w-2 rounded-full flex-shrink-0", doc.status === 'ready' ? "bg-green-500" : "bg-yellow-500")} />
                                            <span className="truncate font-medium text-slate-700">{doc.name}</span>
                                        </div>
                                        <Badge variant="secondary" className="text-xs font-normal">
                                            {doc.chunks.length} chunks
                                        </Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                         <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Did you know?</AlertTitle>
                            <AlertDescription>
                                This tool uses Gemini 2.5 Flash for high-speed graph extraction from both text and images.
                            </AlertDescription>
                        </Alert>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* VIEW: GRAPH */}
        {currentView === AppView.ADMIN_GRAPH && (
            <div className="flex-1 flex flex-col h-full bg-slate-50">
                 <header className="h-16 border-b bg-white px-6 flex items-center justify-between">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Network className="text-blue-600" size={20} />
                        Graph Visualization
                    </h2>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">{graphData.nodes.length} Nodes</Badge>
                        <Badge variant="outline">{graphData.links.length} Relationships</Badge>
                    </div>
                 </header>
                 <div className="flex-1 p-6 overflow-hidden">
                    <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                        <div className="flex-1 bg-white relative">
                            <GraphVisualizer data={graphData} />
                        </div>
                    </Card>
                 </div>
            </div>
        )}

        {/* VIEW: CHAT */}
        {currentView === AppView.USER_CHAT && (
            <div className="flex flex-col h-full bg-white">
                <header className="h-16 border-b px-6 flex items-center justify-between bg-white/80 backdrop-blur z-10 sticky top-0">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                            <Bot size={18} />
                        </div>
                        <div>
                            <h2 className="font-semibold text-slate-900 leading-tight">Assistant</h2>
                            <p className="text-xs text-slate-500">Gemini 2.5 • RAG Enabled</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setMessages([])}>
                        Clear Chat
                    </Button>
                </header>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth" ref={scrollRef}>
                    <div className="max-w-3xl mx-auto space-y-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={cn("flex gap-4", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                {msg.role !== 'user' && (
                                    <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                        <Bot size={14} className="text-slate-600" />
                                    </div>
                                )}
                                
                                <div className={cn(
                                    "max-w-[80%] space-y-2",
                                    msg.role === 'user' ? "items-end" : "items-start"
                                )}>
                                    <div className={cn(
                                        "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                                        msg.role === 'user' 
                                            ? "bg-blue-600 text-white rounded-br-none" 
                                            : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                                    )}>
                                        {msg.content}
                                    </div>
                                    
                                    {msg.retrievedContext && msg.retrievedContext.length > 0 && (
                                        <div className="mt-2 pl-2">
                                            <details className="text-xs group">
                                                <summary className="list-none text-slate-400 hover:text-blue-600 cursor-pointer flex items-center gap-1 font-medium select-none">
                                                    <Search size={10} />
                                                    View Sources
                                                </summary>
                                                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 text-slate-500 space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    {msg.retrievedContext.map((ctx, i) => (
                                                        <div key={i} className="pl-2 border-l-2 border-slate-200 text-[11px] leading-snug line-clamp-2 italic">
                                                            "{ctx}"
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        </div>
                                    )}
                                </div>

                                {msg.role === 'user' && (
                                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                                        <User size={14} className="text-white" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {isProcessing && (
                            <div className="flex gap-4 justify-start">
                                <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                                    <Bot size={14} className="text-slate-600" />
                                </div>
                                <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-slate-400" />
                                    <span className="text-xs text-slate-400 font-medium">Thinking...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-white/80 backdrop-blur border-t border-slate-100">
                    <div className="max-w-3xl mx-auto relative">
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                            className="relative flex items-center gap-2"
                        >
                            <Input 
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                placeholder="Message NeuroGraph..."
                                disabled={isProcessing}
                                className="pr-12 py-6 text-base rounded-full shadow-sm border-slate-200 focus-visible:ring-blue-500"
                            />
                            <Button 
                                type="submit" 
                                size="icon" 
                                disabled={!inputMessage.trim() || isProcessing}
                                className="absolute right-1.5 h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700"
                            >
                                <Send size={16} className="text-white" />
                            </Button>
                        </form>
                        <div className="text-center mt-2">
                             <p className="text-[10px] text-slate-400">
                                AI can make mistakes. Review generated responses.
                             </p>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;