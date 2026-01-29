import * as pdfjsLib from 'pdfjs-dist';

// Handle CJS/ESM interop
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

export interface PdfPage {
  pageNumber: number;
  type: 'text' | 'image';
  content: string; // Text string or Base64 image string
}

export interface ProcessedPdf {
  pages: PdfPage[];
  totalTextLength: number;
  totalImages: number;
}

// Use the worker file from the public directory
// This avoids CORS and CSP issues with blob URLs or external CDN loading
if (pdfjs && typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
  // Point to the worker file in the public directory
  // Files in the public directory are served at the root path
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

export const extractContentFromPdf = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedPdf> => {
  const perfStart = performance.now();
  console.log(`[PERF-PDF] 📄 Starting PDF extraction for file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  
  try {
    const loadStart = performance.now();
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[PERF-PDF] ⏱️ File loaded in ${(performance.now() - loadStart).toFixed(2)}ms`);
    
    // Load Document
    // We use the CDN for cMaps as well to ensure robust text extraction for 
    // PDFs with non-standard fonts, matching the library version.
    const parseStart = performance.now();
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://esm.sh/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });
    
    const pdf = await loadingTask.promise;
    const parseTime = performance.now() - parseStart;
    const totalPages = pdf.numPages;
    console.log(`[PERF-PDF] ⏱️ PDF parsed: ${totalPages} pages in ${parseTime.toFixed(2)}ms`);
    
    const pages: PdfPage[] = [];
    let totalTextLength = 0;
    let totalImages = 0;
    const processedPages = new Set<number>(); // Track which pages were successfully processed
    const failedPages: number[] = []; // Track pages that failed

    // Process pages with progress tracking
    // For large PDFs, yield to browser periodically to prevent freezing
    const BATCH_SIZE = 50; // Process 50 pages at a time before yielding
    const pageProcessStart = performance.now();
    let lastYieldTime = performance.now();
    
    for (let i = 1; i <= totalPages; i++) {
      const pageStart = performance.now();
      
      try {
        const page = await pdf.getPage(i);
        
        // 1. Attempt Text Extraction
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .trim();

        // 2. Decide: Text or Image?
        // Threshold: If less than 50 characters, assume it's a diagram/scan/image page.
        if (pageText.length > 50) {
          pages.push({
            pageNumber: i,
            type: 'text',
            content: `[Page ${i}] ${pageText}`
          });
          totalTextLength += pageText.length;
          processedPages.add(i);
        } else {
          // Render as Image
          const viewport = page.getViewport({ scale: 1.5 }); // 1.5x scale for balance between quality and token usage
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            // Convert to base64 (JPEG 0.8 quality is sufficient for LLM vision)
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            pages.push({
              pageNumber: i,
              type: 'image',
              content: base64
            });
            totalImages++;
            processedPages.add(i);
          } else {
            console.error(`[PERF-PDF] ❌ Failed to get canvas context for page ${i}`);
            failedPages.push(i);
          }
        }
      } catch (error: any) {
        console.error(`[PERF-PDF] ❌ Error processing page ${i}:`, error);
        failedPages.push(i);
        // Continue processing other pages even if one fails
      }
      
      // Report progress
      if (onProgress) {
        onProgress(i, totalPages);
      }
      
      const pageTime = performance.now() - pageStart;
      if (pageTime > 100) {
        console.warn(`[PERF-PDF] ⚠️ Page ${i} took ${pageTime.toFixed(2)}ms (SLOW)`);
      }
      
      // Yield to browser every BATCH_SIZE pages to prevent UI freezing
      if (i % BATCH_SIZE === 0) {
        const timeSinceLastYield = performance.now() - lastYieldTime;
        console.log(`[PERF-PDF] 🔄 Yielding after ${BATCH_SIZE} pages (${timeSinceLastYield.toFixed(2)}ms since last yield)`);
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYieldTime = performance.now();
      }
    }
    
    const pageProcessTime = performance.now() - pageProcessStart;
    const totalTime = performance.now() - perfStart;
    
    // Validation: Check if all pages were processed
    const missingPages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (!processedPages.has(i)) {
        missingPages.push(i);
      }
    }
    
    console.log(`[PERF-PDF] ✅ PDF extraction complete: ${pages.length} pages (${totalTextLength} chars text, ${totalImages} images) in ${totalTime.toFixed(2)}ms`);
    console.log(`[PERF-PDF] 📊 Page processing took ${pageProcessTime.toFixed(2)}ms (avg ${(pageProcessTime / totalPages).toFixed(2)}ms/page)`);
    console.log(`[PERF-PDF] 📋 Processed pages: ${processedPages.size}/${totalPages} (${((processedPages.size / totalPages) * 100).toFixed(1)}%)`);
    
    if (failedPages.length > 0) {
      console.warn(`[PERF-PDF] ⚠️ Failed to process ${failedPages.length} page(s): ${failedPages.slice(0, 10).join(', ')}${failedPages.length > 10 ? '...' : ''}`);
    }
    
    if (missingPages.length > 0) {
      console.warn(`[PERF-PDF] ⚠️ Missing ${missingPages.length} page(s) from extraction: ${missingPages.slice(0, 10).join(', ')}${missingPages.length > 10 ? '...' : ''}`);
    }
    
    if (pages.length !== totalPages) {
      console.warn(`[PERF-PDF] ⚠️ WARNING: Expected ${totalPages} pages but extracted ${pages.length} pages. Some pages may be missing!`);
    }

    return {
      pages,
      totalTextLength,
      totalImages
    };

  } catch (error: any) {
    console.error("Error parsing PDF:", error);
    // Provide a more user-friendly error message
    let msg = "Failed to process PDF.";
    if (error.name === 'PasswordException') msg = "The PDF is password protected.";
    if (error.name === 'InvalidPDFException') msg = "The file is not a valid PDF.";
    if (error.message && error.message.includes('worker')) msg = "PDF Worker failed to load. Please check your internet connection and reload.";
    if (error.message && error.message.includes('memory')) msg = "PDF is too large. Try splitting it into smaller files.";
    
    throw new Error(msg);
  }
};