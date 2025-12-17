import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey: API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * RAG ANSWER GENERATION
 * This is the only function that uses Gemini - for chatbot responses only
 */
export const generateRAGResponse = async (query: string, context: string[]): Promise<string> => {
  if (!API_KEY) return "Please provide a valid API Key to use the chatbot.";

  const contextBlock = context.join("\n\n");
  
  const prompt = `
  You are a helpful assistant for a Knowledge Graph system.
  Use the provided Context information retrieved from our knowledge base to answer the user's question.
  
  ---
  Context:
  ${contextBlock}
  ---
  
  User Question: ${query}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text || "No response generated.";
  } catch (error) {
    console.error("Chat error:", error);
    return "Sorry, I encountered an error generating the response.";
  }
};
