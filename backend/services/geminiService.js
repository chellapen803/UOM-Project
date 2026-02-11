import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-2.5-flash';

// Initialize client only if API key is available
let ai = null;
if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (error) {
    console.error("Failed to initialize GoogleGenAI:", error);
  }
}

/**
 * Clean context chunks by removing page number markers and other metadata
 * that could cause the LLM to list chunks instead of synthesizing
 * Exported for use in rate limit fallback scenarios
 */
export function cleanContextChunks(chunks) {
  if (!chunks || chunks.length === 0) return [];
  
  return chunks.map(chunk => {
    if (typeof chunk !== 'string') return chunk;
    
    // Remove page number markers like [Page 158], [Page X], etc.
    let cleaned = chunk.replace(/\[Page\s+\d+\]/gi, '');
    
    // Remove standalone page references at the start of lines
    cleaned = cleaned.replace(/^\s*\[\d+\]\s*/gm, '');
    
    // Remove excessive whitespace that might be left
    cleaned = cleaned.trim();
    
    return cleaned;
  }).filter(chunk => chunk && chunk.trim().length > 0);
}

/**
 * Generate RAG response using Gemini API
 * This is called from the backend to keep API keys secure
 */
export async function generateRAGResponse(query, context) {
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.");
  }

  if (!ai) {
    throw new Error("Failed to initialize the AI client. Please check your API key configuration.");
  }

  // Clean context chunks to remove page numbers and metadata
  const cleanedContext = cleanContextChunks(context);
  
  const contextBlock = cleanedContext && cleanedContext.length > 0 
    ? cleanedContext.join("\n\n---\n\n") 
    : "No relevant context was found in the knowledge graph for this query. The material you have ingested may not cover this exact topic.";

  const prompt = `You are a helpful AI assistant answering questions based on information from a knowledge graph.

**CRITICAL INSTRUCTIONS:**
1. **PRIORITIZE DEFINITION/EXPLANATION CHUNKS**: If the context contains chunks that start with the topic or define it (e.g., "MD5 was released..." or "Pretexting is..."), use those FIRST and most prominently in your answer
2. **Write a direct, natural answer** to the user's question as if you're an expert explaining the topic
3. **Start with the definition**: If there's a definition-style chunk (starting with the topic name), begin your answer with that definition/explanation
4. **Then add context**: After the definition, you can add related details from other chunks (vulnerabilities, uses, etc.)
5. **Synthesize and summarize** the relevant information into a clear, coherent response
6. **DO NOT list page numbers, chunk numbers, or references** (ignore any "[Page X]" markers in the context)
7. **DO NOT repeat the context verbatim** - instead, extract the key information and explain it naturally
8. **DO NOT format your response as a list of chunks or citations** - write it as a flowing, natural explanation
9. If multiple chunks discuss the same topic, **prioritize definition chunks**, then combine other relevant information
10. **Start directly answering** the question without phrases like "Based on the context" or "Here's what I found"
11. Use clear, readable formatting (paragraphs, bullet points if helpful, but not raw chunk dumps)
12. **If the context section indicates that no relevant context was found**, you should STILL answer the question using your general cybersecurity and technical knowledge. You may briefly note that the knowledge graph does not cover this topic, but do not refuse to answer if you can answer from general knowledge.

**Example of GOOD response for "explain MD5":**
"MD5 (Message Digest 5) was released in 1991 by Ron Rivest as the next version of his message digest algorithm. It processes 512-bit blocks of the message, uses four distinct rounds of computation, and produces a digest of 128 bits. However, security researchers have demonstrated that MD5 is subject to collisions, which prevents its use for ensuring message integrity."

**Example of BAD response (DO NOT DO THIS):**
"[Page 158] Pretexting is mentioned as a type of attack... [Page 142] Chapter 4 discusses pretexting... [Page 149] Pretexting is described as..."

**IMPORTANT**: The context chunks are ordered by relevance - the FIRST chunk(s) are most likely to contain the definition/explanation you need. Start your answer with information from the first chunk(s), then add related details from other chunks.

---
Context from Knowledge Graph (ordered by relevance - most relevant first):
${contextBlock}
---

User Question: ${query}

Provide a clear, direct answer to the question. Start with the definition/explanation from the most relevant chunks (usually the first ones), then add related details. Write naturally as if explaining to a colleague, not as if listing search results.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      thinkingConfig: {
        includeThoughts: true,
        budgetTokens: 256,
      },
    });
    
    const responseText = response.text;
    
    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }
    
    return responseText;
  } catch (error) {
    console.error("Gemini API error:", error);
    
    // Parse rate limit errors with more detail
    if (error?.status === 429) {
      let errorMessage = "Rate limit exceeded. ";
      
      // Try to extract retry delay and quota info from error message
      const errorMsg = error?.message || '';
      const retryMatch = errorMsg.match(/Please retry in ([\d.]+)s/i);
      const quotaMatch = errorMsg.match(/limit: (\d+), model: ([\w.-]+)/i);
      
      if (quotaMatch) {
        const limit = quotaMatch[1];
        const model = quotaMatch[2];
        errorMessage += `Free tier limit reached: ${limit} requests per day for ${model}. `;
      }
      
      if (retryMatch) {
        const retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
        errorMessage += `Please try again in ${retrySeconds} seconds, or wait until tomorrow when the quota resets.`;
      } else {
        errorMessage += "Please try again later. The free tier allows 20 requests per day.";
      }
      
      // Include helpful links
      errorMessage += " For more information, visit: https://ai.google.dev/gemini-api/docs/rate-limits";
      
      throw new Error(errorMessage);
    }
    
    // Provide more helpful error messages
    if (error?.message?.includes('API key') || error?.message?.includes('authentication')) {
      throw new Error("API key error. Please check your GEMINI_API_KEY configuration in the backend .env file.");
    }
    if (error?.status === 400) {
      throw new Error("Invalid request. Please check your query and try again.");
    }
    if (error?.status === 403) {
      throw new Error("Access forbidden. Please check your API key permissions and billing status.");
    }
    
    throw new Error(`Error generating response: ${error?.message || 'Unknown error'}`);
  }
}

