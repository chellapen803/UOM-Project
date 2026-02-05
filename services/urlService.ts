/**
 * URL Content Fetching Service
 * Fetches content from URLs via backend API
 */

import { auth } from '../config/firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface FetchURLResponse {
  success: boolean;
  content: string;
  url: string;
  length: number;
}

/**
 * Get authentication headers
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('Failed to get auth token:', error);
  }
  
  return headers;
}

/**
 * Fetch content from a URL
 * The backend will handle fetching and extracting text content
 * 
 * @param url - The URL to fetch content from
 * @returns Promise with fetched content and metadata
 */
export async function fetchURLContent(url: string): Promise<FetchURLResponse> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_BASE_URL}/documents/fetch-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || `Failed to fetch URL: ${response.statusText}`);
  }
  
  return data;
}
