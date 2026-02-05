import React, { useState, useRef, useEffect } from 'react';
import { 
  Layout, Upload, Network, MessageSquare, Database, FileText, Share2, 
  Search, Bot, FileUp, X, Loader2, Image as ImageIcon, FileType2, 
  Send, User, Settings, CheckCircle2, AlertCircle, LogOut, Shield, BookOpen
} from 'lucide-react';
import { AppView, IngestedDocument, GraphData, Message } from './types';
import GraphVisualizer from './components/GraphVisualizer';
import { MarkdownMessage } from './components/MarkdownMessage';
import { chunkText, extractGraphFromChunk, extractGraphFromMixedContent } from './services/textProcessingService';
import { extractContentFromPdf, PdfPage } from './services/pdfService';
import { fetchURLContent } from './services/urlService';
import { 
  saveGraphToNeo4j, 
  loadGraphFromNeo4j, 
  saveDocumentToNeo4j,
  loadDocumentsFromNeo4j,
  chatWithRAG,
  checkRGCNHealth,
  RGCNHealthResponse
} from './services/neo4jService';
import { 
  loadChatMessages, 
  saveChatMessages, 
  clearChatMessages 
} from './services/chatService';
import { 
  Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge, Label, Alert, AlertTitle, AlertDescription 
} from './components/ui';
import { cn } from './lib/utils';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { auth } from './config/firebase';
import Quiz from './components/Quiz';
import IngestQuizData from './components/IngestQuizData';

const SAMPLE_TEXT = `
Apple Inc. is an American multinational technology company headquartered in Cupertino, California, that designs, develops, and sells consumer electronics, computer software, and online services. 
Steve Jobs, Steve Wozniak, and Ronald Wayne founded Apple in April 1976 to develop and sell Wozniak's Apple I personal computer.
Tim Cook is the current CEO of Apple.
Google is a major competitor to Apple in the mobile operating system market.
Neo4j is a graph database management system developed by Neo4j, Inc.
Firebase provides backend services such as Firestore and Authentication.
`;

// Document item component with verification
const DocumentItem = ({ doc, onVerify }: { doc: IngestedDocument; onVerify: () => void }) => {
  return (
    <div className="flex items-center justify-between text-sm group">
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <div className={cn("h-2 w-2 rounded-full flex-shrink-0", doc.status === 'ready' ? "bg-green-500" : "bg-yellow-500")} />
        <span className="truncate font-medium text-slate-700">{doc.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs font-normal">
          {doc.chunkCount !== undefined ? doc.chunkCount : doc.chunks.length} chunks
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onVerify}
          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          title="Verify which pages are in database"
        >
          <Search size={12} />
        </Button>
      </div>
    </div>
  );
};

const App = () => {
  // --- AUTH ---
  const { currentUser, appUser, logout, isSuperuser, loading: authLoading } = useAuth();

  // Show auth screen if not logged in
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Auth />;
  }

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
  const [uploadMode, setUploadMode] = useState<'text' | 'pdf' | 'url'>('text');
  const [uploadText, setUploadText] = useState(SAMPLE_TEXT);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [fetchedUrl, setFetchedUrl] = useState<string>(''); // Store the URL for document naming
  
  // New Hybrid State
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [pdfStats, setPdfStats] = useState({ textLen: 0, imgCount: 0 });
  
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfParseProgress, setPdfParseProgress] = useState({ current: 0, total: 0 });
  const [ingestProgress, setIngestProgress] = useState<{ current: number; total: number; phase: string }>({
    current: 0,
    total: 0,
    phase: ''
  });
  
  // R-GCN Status
  const [rgcnStatus, setRgcnStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  const [rgcnStats, setRgcnStats] = useState<RGCNHealthResponse | null>(null);
  const [useRGCN, setUseRGCN] = useState<boolean>(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoadingMessagesRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load documents from Neo4j on mount
  useEffect(() => {
    const loadInitialDocuments = async () => {
      try {
        const docs = await loadDocumentsFromNeo4j();
        // Convert to IngestedDocument format
        const ingestedDocs: IngestedDocument[] = docs.map(doc => ({
          id: doc.id,
          name: doc.name,
          uploadDate: doc.uploadDate ? new Date(doc.uploadDate).toLocaleDateString() : new Date().toLocaleDateString(),
          status: (doc.status as 'processing' | 'ready' | 'error') || 'ready',
          chunks: [], // Chunks loaded separately if needed
          chunkCount: doc.chunkCount || 0 // Preserve chunk count from backend
        }));
        setDocuments(ingestedDocs);
      } catch (error) {
        console.warn('[App] Failed to load documents from Neo4j on mount:', error);
        // Don't show error to user - just start with empty list
      }
    };
    
    loadInitialDocuments();
  }, []);

  // Check R-GCN status on mount and periodically
  useEffect(() => {
    const checkRGCNStatus = async () => {
      try {
        const health = await checkRGCNHealth();
        if (health.available) {
          setRgcnStatus('active');
          setRgcnStats(health);
        } else {
          setRgcnStatus('inactive');
          setRgcnStats(null);
        }
      } catch (error) {
        setRgcnStatus('inactive');
        setRgcnStats(null);
      }
    };
    
    checkRGCNStatus();
    const interval = setInterval(checkRGCNStatus, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Load chat messages from Firestore when user is authenticated
  useEffect(() => {
    if (!currentUser || !appUser) return;

    const loadMessages = async () => {
      isLoadingMessagesRef.current = true;
      try {
        const savedMessages = await loadChatMessages(appUser.uid);
        if (savedMessages.length > 0) {
          setMessages(savedMessages);
        } else {
          // If no saved messages, keep the default welcome message
          setMessages([
            { role: 'system', content: 'Welcome to the Knowledge Graph Chatbot. I can answer questions based on the documents you upload.', timestamp: Date.now() }
          ]);
        }
      } catch (error) {
        console.error('Error loading chat messages:', error);
        // Keep default message on error
      } finally {
        isLoadingMessagesRef.current = false;
      }
    };

    loadMessages();
  }, [currentUser, appUser]);

  // Save chat messages to Firestore when they change (with debouncing)
  useEffect(() => {
    if (!currentUser || !appUser) return;
    if (isLoadingMessagesRef.current) return; // Don't save while loading

    // Don't save if only system message exists
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    if (nonSystemMessages.length === 0) return;

    // Debounce saves to avoid too many writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveChatMessages(appUser.uid, messages);
      } catch (error) {
        console.error('Error saving chat messages:', error);
      }
    }, 1000); // Wait 1 second after last change before saving

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages, currentUser, appUser]);

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
    setPdfParseProgress({ current: 0, total: 0 });

    try {
        const result = await extractContentFromPdf(file, (current, total) => {
          setPdfParseProgress({ current, total });
        });
        
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
        setPdfParseProgress({ current: 0, total: 0 });
    }
  };

  const clearPdfSelection = () => {
    setPdfFileName('');
    setUploadText('');
    setPdfPages([]);
    setPdfStats({ textLen: 0, imgCount: 0 });
  };

  // URL Fetch Handler - automatically processes after fetching
  const handleFetchURL = async () => {
    if (!urlInput.trim()) return;
    
    setIsFetchingUrl(true);
    try {
      const result = await fetchURLContent(urlInput.trim());
      const url = urlInput.trim();
      
      // Set the content, store URL for document naming, and switch to text mode
      setUploadText(result.content);
      setFetchedUrl(url);
      setUploadMode('text');
      setUrlInput('');
      setIsFetchingUrl(false);
      
      // Use requestAnimationFrame to ensure state is updated before calling handleUpload
      requestAnimationFrame(() => {
        handleUpload();
      });
    } catch (error: any) {
      setIsFetchingUrl(false);
      alert(error.message || 'Failed to fetch URL content');
    }
  };

  // 2. UPLOAD & PROCESS
  const handleUpload = async () => {
    const perfStart = performance.now();
    console.log(`[PERF] 🚀 Starting ingestion at ${new Date().toISOString()}`);
    
    if (!uploadText && pdfPages.length === 0 && uploadMode !== 'url') return;
    setIsProcessing(true);
    setProcessingStatus('Initializing ingestion...');
    setIngestProgress({ current: 0, total: 0, phase: 'Initializing' });

    const newDocId = Math.random().toString(36).substr(2, 9);
    let docName: string;
    if (uploadMode === 'pdf' && pdfFileName) {
      docName = pdfFileName;
    } else if (fetchedUrl) {
      // Extract a readable name from URL (e.g., Wikipedia article title)
      try {
        const urlObj = new URL(fetchedUrl);
        if (urlObj.hostname.includes('wikipedia.org')) {
          const title = urlObj.pathname.split('/wiki/')[1]?.replace(/_/g, ' ') || fetchedUrl;
          docName = decodeURIComponent(title);
        } else {
          docName = fetchedUrl;
        }
      } catch {
        docName = fetchedUrl;
      }
    } else {
      docName = `Document ${documents.length + 1}`;
    }
    
    let newNodes: any[] = [];
    let newLinks: any[] = [];
    let chunks: any[] = [];

    // --- STRATEGY A: PDF (HYBRID) ---
    if (uploadMode === 'pdf' && pdfPages.length > 0) {
        const chunkStart = performance.now();
        console.log(`[PERF] 📄 Preparing ${pdfPages.length} PDF pages for chunking...`);
        
        // Validate that we have pages from the expected range
        const pageNumbers = pdfPages.map(p => p.pageNumber).sort((a, b) => a - b);
        const minPage = pageNumbers[0];
        const maxPage = pageNumbers[pageNumbers.length - 1];
        const expectedPages = maxPage - minPage + 1;
        
        if (pdfPages.length !== expectedPages) {
          const missingPages: number[] = [];
          for (let i = minPage; i <= maxPage; i++) {
            if (!pageNumbers.includes(i)) {
              missingPages.push(i);
            }
          }
          console.warn(`[PERF] ⚠️ WARNING: PDF has gaps in page numbers. Expected ${expectedPages} pages (${minPage}-${maxPage}) but have ${pdfPages.length} pages. Missing: ${missingPages.slice(0, 20).join(', ')}${missingPages.length > 20 ? '...' : ''}`);
        }
        
        chunks = pdfPages.map(p => ({
            id: Math.random().toString(36),
            text: p.type === 'text' ? p.content : `[Image Page ${p.pageNumber}]`,
            sourceDoc: newDocId
        }));
        
        const chunkTime = performance.now() - chunkStart;
        console.log(`[PERF] ✅ Chunking complete: ${chunks.length} chunks in ${chunkTime.toFixed(2)}ms`);
        console.log(`[PERF] 📋 Page range: ${minPage}-${maxPage} (${pdfPages.length} pages total)`);

        // Total steps: 1 (NLP extraction) + 2 (graph save + doc save)
        setIngestProgress({ current: 0, total: 3, phase: 'Preparing PDF content' });
        setProcessingStatus(`Processing ${pdfPages.length} pages using NLP extraction...`);
        
        // Extract graph from all pages using async chunked processing
        const extractStart = performance.now();
        const pageRange = pdfPages.length > 0 
          ? `pages ${Math.min(...pdfPages.map(p => p.pageNumber))}-${Math.max(...pdfPages.map(p => p.pageNumber))}`
          : 'all pages';
        console.log(`[PERF] 🔍 Starting ASYNC chunked NLP extraction on ${pdfPages.length} pages (${chunks.length} chunks, ${pageRange})...`);
        
        setProcessingStatus(`Extracting entities from PDF (${pageRange}, processing in chunks to keep UI responsive)...`);
        
        const extracted = await extractGraphFromMixedContent(pdfPages);
        const extractTime = performance.now() - extractStart;
        
        newNodes = [...newNodes, ...extracted.nodes];
        newLinks = [...newLinks, ...extracted.links];
        
        console.log(`[PERF] ✅ NLP extraction complete: ${extracted.nodes.length} nodes, ${extracted.links.length} links in ${extractTime.toFixed(2)}ms`);
        console.log(`[PERF] ✅ Chunked processing kept UI responsive!`);
        
        setIngestProgress({ current: 1, total: 3, phase: 'Entities extracted from PDF' });

    } 
    // --- STRATEGY B: RAW TEXT ---
    else {
        const chunksRaw = chunkText(uploadText);
        chunks = chunksRaw.map(text => ({ id: Math.random().toString(36), text, sourceDoc: newDocId }));
        const totalSteps = chunks.length + 2; // chunks processing + graph save + doc save
        let currentStep = 0;
        setIngestProgress({ current: 0, total: totalSteps, phase: 'Chunking text' });
        
        for (let i = 0; i < chunks.length; i++) {
          setProcessingStatus(`Extracting entities from chunk ${i + 1} of ${chunks.length}...`);
          const chunk = chunks[i];
          const extracted = extractGraphFromChunk(chunk.text);
          newNodes = [...newNodes, ...extracted.nodes];
          newLinks = [...newLinks, ...extracted.links];
          currentStep += 1;
          setIngestProgress({ current: currentStep, total: totalSteps, phase: `Extracted entities from chunk ${i + 1}` });
        }
    }

    setProcessingStatus('Saving to Neo4j database...');

    try {
      // Calculate timeout based on document size (larger docs need more time)
      // Base timeout: 2 minutes for graph, 5 minutes for document
      // Add 1 second per 100 chunks for very large documents
      const graphTimeout = 120000 + Math.max(0, (chunks.length - 100) * 10);
      const docTimeout = 300000 + Math.max(0, (chunks.length - 100) * 50);
      
      // Save graph data to Neo4j
      const graphSaveStart = performance.now();
      console.log(`[PERF] 💾 Starting graph save: ${newNodes.length} nodes, ${newLinks.length} links`);
      
      setIngestProgress(prev => ({
        current: Math.max(prev.current, prev.total > 0 ? prev.total - 2 : 0),
        total: prev.total || (chunks.length > 0 ? chunks.length + 2 : 3),
        phase: 'Saving graph structure to Neo4j'
      }));
      
      // Yield before network call
      await new Promise(resolve => setTimeout(resolve, 0));
      
      await saveGraphToNeo4j(newNodes, newLinks, graphTimeout);
      const graphSaveTime = performance.now() - graphSaveStart;
      console.log(`[PERF] ✅ Graph save complete in ${graphSaveTime.toFixed(2)}ms`);
      
      // Save document and chunks to Neo4j
      const docSaveStart = performance.now();
      console.log(`[PERF] 💾 Starting document save: ${chunks.length} chunks`);
      
      const entityIds = newNodes.map(n => n.id);
      setProcessingStatus(`Saving document chunks (${chunks.length} total)...`);
      setIngestProgress(prev => ({
        current: (prev.total || (chunks.length > 0 ? chunks.length + 2 : 3)) - 1,
        total: prev.total || (chunks.length > 0 ? chunks.length + 2 : 3),
        phase: 'Saving document and chunks to Neo4j'
      }));
      
      // Yield before network call
      await new Promise(resolve => setTimeout(resolve, 0));
      
      await saveDocumentToNeo4j(newDocId, docName, chunks, entityIds, docTimeout);
      const docSaveTime = performance.now() - docSaveStart;
      console.log(`[PERF] ✅ Document save complete in ${docSaveTime.toFixed(2)}ms`);
      
      // VERIFICATION: Verify that all chunks were saved
      setProcessingStatus('Verifying ingestion...');
      try {
        const verifyStart = performance.now();
        // Get auth headers using the same pattern as neo4jService
        const getAuthHeaders = async () => {
          const headers: HeadersInit = { 'Content-Type': 'application/json' };
          try {
            const user = auth.currentUser;
            if (user) {
              const token = await user.getIdToken();
              headers['Authorization'] = `Bearer ${token}`;
            }
          } catch (error) {
            console.warn('Failed to get auth token for verification:', error);
          }
          return headers;
        };
        
        const verifyResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/documents/verify/${newDocId}`, {
          method: 'GET',
          headers: await getAuthHeaders()
        });
        
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          const savedChunks = verifyData.chunkCount || 0;
          const verifyTime = performance.now() - verifyStart;
          
          if (savedChunks === chunks.length) {
            console.log(`[PERF] ✅ Verification passed: All ${chunks.length} chunks saved successfully (${verifyTime.toFixed(2)}ms)`);
          } else {
            console.warn(`[PERF] ⚠️ Verification warning: Expected ${chunks.length} chunks but database has ${savedChunks} chunks`);
            alert(`Warning: Expected ${chunks.length} chunks but only ${savedChunks} were saved. Some pages may be missing.`);
          }
        } else {
          console.warn(`[PERF] ⚠️ Verification endpoint not available (status ${verifyResponse.status})`);
        }
      } catch (error) {
        console.warn(`[PERF] ⚠️ Verification failed (endpoint may not exist):`, error);
        // Don't fail the whole ingestion if verification fails
      }
      
      // Update local documents state immediately (data is saved)
      const newDoc: IngestedDocument = {
        id: newDocId,
        name: docName,
        uploadDate: new Date().toLocaleDateString(),
        status: 'ready',
        chunks,
        chunkCount: chunks.length // Set chunk count for display
      };
      
      setDocuments(prev => [...prev, newDoc]);
      
      // Clear processing immediately - data is saved
      setIsProcessing(false);
      setProcessingStatus('');
      setIngestProgress({ current: 0, total: 0, phase: '' });
      
      // Clear upload state
      if (uploadMode === 'text') {
        setUploadText('');
        setFetchedUrl(''); // Clear fetched URL if it was set
      } else {
        clearPdfSelection();
      }
      
      // Reload graph from Neo4j after saving to ensure UI matches database
      const reloadStart = performance.now();
      console.log(`[PERF] 🔄 Starting graph reload from Neo4j...`);
      
      setProcessingStatus('Reloading graph from database...');
      
      // Yield before network call
      await new Promise(resolve => setTimeout(resolve, 0));
      
      try {
        const updatedGraph = await loadGraphFromNeo4j();
        const reloadTime = performance.now() - reloadStart;
        console.log(`[PERF] ✅ Graph reload complete: ${updatedGraph.nodes.length} nodes, ${updatedGraph.links.length} links in ${reloadTime.toFixed(2)}ms`);
        
        setGraphData(updatedGraph);
      } catch (error) {
        const reloadTime = performance.now() - reloadStart;
        console.warn(`[PERF] ⚠️ Graph reload failed after ${reloadTime.toFixed(2)}ms, using fallback`);
        
        // Fallback: update with extracted data if reload fails
        setGraphData(prev => {
          const allNodes = [...prev.nodes, ...newNodes];
          const allLinks = [...prev.links, ...newLinks];
          
          // Deduplicate nodes (case-insensitive)
          const uniqueNodes = Array.from(
            new Map(allNodes.map(item => [item.id.toLowerCase(), item])).values()
          );
          
          return { nodes: uniqueNodes, links: allLinks };
        });
      } finally {
        setProcessingStatus('');
      }
      
      const totalTime = performance.now() - perfStart;
      console.log(`[PERF] 🎉 Ingestion complete in ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(2)}s)`);
      console.log(`[PERF] 📊 Summary: ${chunks.length} chunks, ${newNodes.length} nodes, ${newLinks.length} links`);
      
    } catch (error: any) {
      const totalTime = performance.now() - perfStart;
      console.error(`[PERF] ❌ Ingestion failed after ${totalTime.toFixed(2)}ms:`, error);
      console.error('[App] Error saving to Neo4j:', error);
      setIsProcessing(false);
      setProcessingStatus('');
      setIngestProgress({ current: 0, total: 0, phase: '' });
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
    
    // If user has R-GCN disabled, skip the per-message health check and use standard messaging.
    if (useRGCN) {
      setProcessingStatus('Checking R-GCN status...');
      try {
        const health = await checkRGCNHealth();
        if (health.available) {
          setRgcnStatus('active');
          setRgcnStats(health);
          setProcessingStatus('Analyzing with R-GCN...');
        } else {
          setRgcnStatus('inactive');
          setRgcnStats(null);
          setProcessingStatus('Thinking...');
        }
      } catch (error) {
        // If check fails, mark as inactive and continue with standard retrieval
        setRgcnStatus('inactive');
        setRgcnStats(null);
        setProcessingStatus('Thinking...');
      }
    } else {
      setProcessingStatus('Thinking...');
    }

    try {
      // Use backend RAG chat endpoint (retrieves context + generates response)
      // This keeps the API key secure on the backend
      const result = await chatWithRAG(query, { useRGCN });
      
      const botMsg: Message = {
        role: 'model',
        content: result.response,
        timestamp: Date.now(),
        retrievedContext: result.context,
        metadata: result.metadata
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
            SecurityPlus Bot
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">Knowledge Graph RAG</p>
        </div>
        
        <nav className="flex-1 px-3 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Workspace</div>
          <NavItem view={AppView.USER_CHAT} icon={MessageSquare} label="Chat" />
          <NavItem view={AppView.QUIZ} icon={BookOpen} label="Quiz" />
          
          {isSuperuser() && (
            <>
              <div className="mt-8 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</div>
              <NavItem view={AppView.ADMIN_UPLOAD} icon={Upload} label="Ingest Data" />
              <NavItem view={AppView.ADMIN_QUIZ_INGEST} icon={BookOpen} label="Ingest Quiz Data" />
              <NavItem view={AppView.ADMIN_GRAPH} icon={Network} label="Graph View" />
            </>
          )}
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
            <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Nodes</span>
                <span>{graphData.nodes.length}</span>
            </div>
            {/* R-GCN Status */}
            <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                    <Network className="text-purple-500" size={12} />
                    <span className="text-xs font-medium text-slate-300">R-GCN</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <div className={`h-2 w-2 rounded-full ${rgcnStatus === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-slate-500">
                        {rgcnStatus === 'active' ? 'Active' : rgcnStatus === 'inactive' ? 'Offline' : 'Checking...'}
                    </span>
                </div>
                {rgcnStatus === 'active' && rgcnStats?.stats && (
                    <div className="text-[10px] text-slate-500 mt-1 pl-4">
                        <div>Nodes: {rgcnStats.stats.nodes || 0}</div>
                        <div>Edges: {rgcnStats.stats.edges || 0}</div>
                    </div>
                )}
            </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{appUser?.email || 'User'}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {isSuperuser() && (
                  <Shield size={10} className="text-yellow-500" />
                )}
                <p className="text-xs text-slate-500">
                  {isSuperuser() ? 'Superuser' : 'User'}
                </p>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <LogOut size={14} />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* VIEW: UPLOAD */}
        {currentView === AppView.ADMIN_UPLOAD && (
          !isSuperuser() ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    Access Restricted
                  </CardTitle>
                  <CardDescription>
                    Only superusers can upload documents.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    You need superuser privileges to access the document upload feature. 
                    Please contact an administrator if you need access.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => setCurrentView(AppView.USER_CHAT)} variant="outline" className="w-full">
                    Go to Chat
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ) : (
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
                            <CardDescription>Supported formats: Plain Text, PDF (OCR/Vision), URL (Wikipedia & more)</CardDescription>
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
                                    <button 
                                        onClick={() => setUploadMode('url')}
                                        className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", uploadMode === 'url' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                                    >
                                        URL
                                    </button>
                                </div>

                                {uploadMode === 'text' ? (
                                    <Textarea 
                                        placeholder="Paste your knowledge base content here..."
                                        className="h-64 font-mono text-sm"
                                        value={uploadText}
                                        onChange={(e) => setUploadText(e.target.value)}
                                    />
                                ) : uploadMode === 'url' ? (
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <Input
                                                type="url"
                                                placeholder="Paste URL (e.g., https://en.wikipedia.org/wiki/Incident_response)"
                                                value={urlInput}
                                                onChange={(e) => setUrlInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && !isFetchingUrl && handleFetchURL()}
                                                className="flex-1"
                                                disabled={isFetchingUrl}
                                            />
                                            <Button 
                                                onClick={handleFetchURL}
                                                disabled={!urlInput.trim() || isFetchingUrl}
                                            >
                                                {isFetchingUrl ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Fetching...
                                                    </>
                                                ) : (
                                                    'Fetch'
                                                )}
                                            </Button>
                                        </div>
                                        {isFetchingUrl && (
                                            <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span>Fetching content from URL...</span>
                                            </div>
                                        )}
                                    </div>
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
                                                            {isParsingPdf && pdfParseProgress.total > 0 
                                                              ? `Processing page ${pdfParseProgress.current} of ${pdfParseProgress.total}...`
                                                              : pdfPages.length > 0 
                                                                ? `${pdfPages.length} pages` 
                                                                : 'Processing...'}
                                                            {pdfStats.imgCount > 0 && ` (${pdfStats.imgCount} images)`}
                                                        </p>
                                                        {isParsingPdf && pdfParseProgress.total > 0 && (
                                                          <div className="mt-1 w-full bg-blue-200 rounded-full h-1">
                                                            <div 
                                                              className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                                                              style={{ width: `${(pdfParseProgress.current / pdfParseProgress.total) * 100}%` }}
                                                            />
                                                          </div>
                                                        )}
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
                                                {/* <p className="text-sm text-slate-500 mt-1 mb-4">Max file size 10MB</p> */}
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
                        <CardFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 border-t bg-slate-50/50 p-4">
                            {isProcessing && (
                                <div className="flex flex-col gap-1 text-sm text-slate-500 sm:mr-2 max-w-xs sm:max-w-sm">
                                    <div className="flex items-center gap-2">
                                        <Loader2 size={14} className="animate-spin" />
                                        <span className="truncate">
                                            {processingStatus || 'Processing document...'}
                                        </span>
                                    </div>
                                    {ingestProgress.total > 0 && (
                                        <span className="text-xs text-slate-400">
                                            Step {Math.min(ingestProgress.current + 1, ingestProgress.total)} of {ingestProgress.total}
                                            {ingestProgress.phase ? ` • ${ingestProgress.phase}` : ''}
                                        </span>
                                    )}
                                </div>
                            )}
                            <Button 
                                onClick={handleUpload} 
                                disabled={isProcessing || (!uploadText && pdfPages.length === 0 && uploadMode !== 'url') || isParsingPdf || isFetchingUrl}
                            >
                                {isProcessing && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {isProcessing ? 'Processing...' : 'Ingest & Build Graph'}
                            </Button>
                            {isProcessing && (
                                <div className="w-full sm:w-64 h-1 bg-slate-200 rounded-full overflow-hidden">
                                    {ingestProgress.total > 0 ? (
                                        <div
                                            className="h-1 bg-blue-500 rounded-full transition-all duration-300"
                                            style={{ width: `${Math.min(100, ((ingestProgress.current + 1) / ingestProgress.total) * 100)}%` }}
                                        />
                                    ) : (
                                        <div className="h-1 w-full bg-blue-500 animate-pulse rounded-full" />
                                    )}
                                </div>
                            )}
                        </CardFooter>
                    </Card>

                    <div className="space-y-6">
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
          )
        )}

        {/* VIEW: GRAPH */}
        {currentView === AppView.ADMIN_GRAPH && (
          !isSuperuser() ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    Access Restricted
                  </CardTitle>
                  <CardDescription>
                    Only superusers can view the graph.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    You need superuser privileges to access the graph visualization. 
                    Please contact an administrator if you need access.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => setCurrentView(AppView.USER_CHAT)} variant="outline" className="w-full">
                    Go to Chat
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ) : (
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
          )
        )}

        {/* VIEW: QUIZ */}
        {currentView === AppView.ADMIN_QUIZ_INGEST && (
          <IngestQuizData />
        )}

        {currentView === AppView.QUIZ && (
          <Quiz />
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
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-slate-500">Gemini 2.5 • RAG Enabled</p>
                                {/* R-GCN Status Badge */}
                                {rgcnStatus === 'active' && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500 text-green-600">
                                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1 animate-pulse" />
                                        R-GCN
                                    </Badge>
                                )}
                                {rgcnStatus === 'inactive' && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-300 text-slate-400">
                                        <div className="h-1.5 w-1.5 rounded-full bg-slate-300 mr-1" />
                                        R-GCN Offline
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* R-GCN Toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 hidden sm:inline">R-GCN Retrieval</span>
                        <button
                          type="button"
                          onClick={() => setUseRGCN((prev) => !prev)}
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                            useRGCN ? "bg-purple-500" : "bg-slate-300"
                          )}
                          aria-pressed={useRGCN}
                          aria-label="Toggle R-GCN retrieval"
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                              useRGCN ? "translate-x-4" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={async () => {
                          setMessages([
                            { role: 'system', content: 'Welcome to the Knowledge Graph Chatbot. I can answer questions based on the documents you upload.', timestamp: Date.now() }
                          ]);
                          // Clear from Firestore
                          if (appUser) {
                            try {
                              await clearChatMessages(appUser.uid);
                            } catch (error) {
                              console.error('Error clearing chat messages:', error);
                            }
                          }
                        }}
                      >
                          Clear Chat
                      </Button>
                    </div>
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
                                        {msg.role === 'user' ? (
                                            <span className="whitespace-pre-wrap">{msg.content}</span>
                                        ) : (
                                            <MarkdownMessage content={msg.content} />
                                        )}
                                    </div>
                                    
                                    {msg.retrievedContext && msg.retrievedContext.length > 0 && (
                                        <div className="mt-2 pl-2">
                                            <details className="text-xs group">
                                                <summary className="list-none text-slate-400 hover:text-blue-600 cursor-pointer flex items-center gap-1 font-medium select-none">
                                                    <Search size={10} />
                                                    View Sources
                                                    {/* Show R-GCN indicator */}
                                                    {msg.metadata?.rgcnUsed && (
                                                        <Badge variant="outline" className="ml-2 text-[9px] px-1 border-purple-300 text-purple-600">
                                                            R-GCN Enhanced
                                                        </Badge>
                                                    )}
                                                </summary>
                                                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 text-slate-500 space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    {/* Show R-GCN similarity scores if available */}
                                                    {msg.metadata?.rgcnSimilarities && msg.metadata.rgcnSimilarities.length > 0 && (
                                                        <div className="mb-2 pb-2 border-b border-slate-200">
                                                            <p className="text-[10px] font-semibold text-purple-600 mb-1">R-GCN Similarity Scores:</p>
                                                            {msg.metadata.rgcnSimilarities.map((sim: any, i: number) => (
                                                                <div key={i} className="text-[10px] flex justify-between">
                                                                    <span className="truncate">{sim.entity}</span>
                                                                    <span className="text-purple-500 ml-2">{(sim.score * 100).toFixed(1)}%</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
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
                                placeholder="Message SecurityPlus Bot..."
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