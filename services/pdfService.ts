import * as pdfjsLib from 'pdfjs-dist';

// Vite-specific import to bundle the worker locally.
// The '?url' suffix tells Vite to treat this import as a static asset URL.
// @ts-ignore - Ignores TS error if module definition for ?url is missing
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Handle CJS/ESM interop
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Configure worker to use the local bundle processed by Vite.
// This works in both dev (npm run dev) and production (npm run build).
if (pdfjs && typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
}

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

export const extractContentFromPdf = async (file: File): Promise<ProcessedPdf> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load Document
    // Note: cMaps are not configured here to avoid external CDNs. 
    // If you need support for complex non-Latin fonts, copy 'pdfjs-dist/cmaps/' 
    // to your 'public/cmaps/' directory and set `cMapUrl: '/cmaps/', cMapPacked: true`.
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
    });
    
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pages: PdfPage[] = [];
    let totalTextLength = 0;
    let totalImages = 0;

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
    if (error.message && error.message.includes('worker')) msg = "PDF Worker failed to load.";
    
    throw new Error(msg);
  }
};