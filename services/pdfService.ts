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

// Singleton promise to ensure worker is only set up once
let workerSetupPromise: Promise<void> | null = null;

const setupPdfWorker = async () => {
  if (typeof window === 'undefined' || !pdfjs) return;
  
  // Safety check: ensure GlobalWorkerOptions exists
  if (!pdfjs.GlobalWorkerOptions) {
      console.warn("pdfjs.GlobalWorkerOptions is undefined, skipping worker setup");
      return;
  }
  
  // If workerSrc is already set (e.g. by another component), skip
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;

  const workerUrl = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  try {
    // STRATEGY 1: Fetch the worker code directly and create a Blob.
    // This bypasses 'importScripts' CORS restrictions because the code effectively becomes local (blob: origin).
    const response = await fetch(workerUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch worker script: ${response.statusText}`);
    }
    const workerScript = await response.text();
    const blob = new Blob([workerScript], { type: 'text/javascript' });
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    console.log("PDF Worker loaded via direct fetch blob.");
  } catch (fetchError) {
    console.warn("Direct fetch for PDF worker failed, falling back to importScripts shim.", fetchError);
    
    // STRATEGY 2: Fallback to importScripts shim. 
    // This relies on the browser allowing importScripts from blob to CDN.
    // Requires correct CSP: worker-src blob:; connect-src https://esm.sh;
    const blob = new Blob([`importScripts('${workerUrl}');`], { type: 'application/javascript' });
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  }
};

export const extractContentFromPdf = async (file: File): Promise<ProcessedPdf> => {
  // Ensure worker is set up before we start
  if (!workerSetupPromise) {
    workerSetupPromise = setupPdfWorker();
  }
  await workerSetupPromise;

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
    if (error.message && error.message.includes('worker')) msg = "PDF Worker failed to load. Please check your internet connection and reload.";
    
    throw new Error(msg);
  }
};