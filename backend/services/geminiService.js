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

  const contextBlock = context && context.length > 0 
    ? context.join("\n\n---\n\n") 
    : "No relevant context found in the knowledge graph for this query.";

  const prompt = `You are a helpful assistant for a Knowledge Graph system.
Your role is to answer questions based on the Context information retrieved from the knowledge graph.

**Instructions:**
1. Carefully analyze the Context provided below
2. Extract relevant information that relates to the user's question
3. If the Context contains relevant information (even if partial), synthesize it into a helpful answer
4. If the Context mentions related concepts, entities, or topics, use them to provide context-aware answers
5. Only say "not enough information" if the Context is completely unrelated to the question
6. If the Context lists entities or concepts, try to infer relationships or provide general knowledge that connects to the question

---
Context from Knowledge Graph:
${contextBlock}
---

User Question: ${query}

Please provide a helpful and informative answer. If the context contains any relevant information (even tangentially related), use it to provide a thoughtful response.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
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

