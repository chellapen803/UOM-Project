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
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load Document
    // We use the CDN for cMaps as well to ensure robust text extraction for 
    // PDFs with non-standard fonts, matching the library version.
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://esm.sh/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });
    
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pages: PdfPage[] = [];
    let totalTextLength = 0;
    let totalImages = 0;

    // Process pages with progress tracking
    // For large PDFs, yield to browser periodically to prevent freezing
    const BATCH_SIZE = 50; // Process 50 pages at a time before yielding
    
    for (let i = 1; i <= totalPages; i++) {
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
        }
      }
      
      // Report progress
      if (onProgress) {
        onProgress(i, totalPages);
      }
      
      // Yield to browser every BATCH_SIZE pages to prevent UI freezing
      if (i % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
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