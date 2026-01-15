import { PdfPage } from './pdfService';

export interface QuizQuestion {
  id: number;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string; // General explanation or explanation for correct answer
  optionExplanations?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  }; // Explanations for each option (why it's correct or incorrect)
}

export interface ExtractQuestionsResponse {
  success: boolean;
  questions: QuizQuestion[];
  count: number;
}

export interface ExtractionProgress {
  type: 'progress' | 'complete';
  batch?: number;
  totalBatches?: number;
  questionsExtracted?: number;
  status?: string;
  questions?: QuizQuestion[];
  count?: number;
  success?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Check if quiz questions exist
 */
export async function checkQuizQuestions(token: string): Promise<{ hasQuestions: boolean }> {
  const response = await fetch(`${API_BASE_URL}/quiz/check`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to check quiz questions`);
  }

  return response.json();
}

/**
 * Get all quiz questions
 */
export async function getQuizQuestionsFromApi(token: string): Promise<ExtractQuestionsResponse> {
  const response = await fetch(`${API_BASE_URL}/quiz/questions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to get quiz questions`);
  }

  return response.json();
}

/**
 * Extract questions from PDF pages with progress updates
 */
export async function extractQuestionsFromPdf(
  pages: PdfPage[],
  token: string,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<ExtractQuestionsResponse> {
  const response = await fetch(`${API_BASE_URL}/quiz/extract-questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ pages }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    // Handle service unavailable/overloaded errors (503)
    if (response.status === 503) {
      const errorMessage = error.error || 'Gemini API is currently overloaded. Please try again in a few moments.';
      const errorObj = new Error(errorMessage);
      (errorObj as any).type = error.type || 'service_unavailable';
      (errorObj as any).details = error.details;
      (errorObj as any).retryable = error.retryable !== false;
      throw errorObj;
    }
    
    // Provide better error messages for quota/rate limit errors (429)
    if (response.status === 429) {
      const errorMessage = error.error || 'API quota exceeded';
      const errorObj = new Error(errorMessage);
      (errorObj as any).type = error.type || 'quota_exceeded';
      (errorObj as any).details = error.details;
      throw errorObj;
    }
    
    throw new Error(error.error || `HTTP ${response.status}: Failed to extract questions`);
  }

  // Check if response is streaming (chunked)
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  if (reader && onProgress) {
    // Handle streaming response with progress updates
    let buffer = '';
    let finalResult: ExtractQuestionsResponse | null = null;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const progress: ExtractionProgress = JSON.parse(line);
          
          if (progress.type === 'complete' && progress.questions) {
            finalResult = {
              success: progress.success || true,
              questions: progress.questions,
              count: progress.count || progress.questions.length
            };
          } else if (progress.type === 'progress') {
            onProgress(progress);
          }
        } catch (e) {
          console.warn('Failed to parse progress update:', e);
        }
      }
    }
    
    if (finalResult) {
      return finalResult;
    }
  }
  
  // Fallback to regular JSON response
  return response.json();
}

