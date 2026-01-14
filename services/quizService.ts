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
  explanation?: string;
}

export interface ExtractQuestionsResponse {
  success: boolean;
  questions: QuizQuestion[];
  count: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Extract questions from PDF pages
 */
export async function extractQuestionsFromPdf(
  pages: PdfPage[],
  token: string
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
    
    // Provide better error messages for quota/rate limit errors
    if (response.status === 429) {
      const errorMessage = error.error || 'API quota exceeded';
      const errorObj = new Error(errorMessage);
      (errorObj as any).type = error.type || 'quota_exceeded';
      (errorObj as any).details = error.details;
      throw errorObj;
    }
    
    throw new Error(error.error || `HTTP ${response.status}: Failed to extract questions`);
  }

  return response.json();
}

