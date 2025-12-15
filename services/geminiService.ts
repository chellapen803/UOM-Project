import { GoogleGenAI, Type } from "@google/genai";
import { GraphData, Node, Link } from "../types";

const API_KEY = process.env.API_KEY || '';

// Initialize client
// Note: In a production app, do not expose API keys on the client.
// This is for demonstration purposes within the secure sandbox environment.
const ai = new GoogleGenAI({ apiKey: API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * SIMULATED CHUNKING
 * Breaks text into roughly equal parts.
 */
export const chunkText = (text: string, chunkSize: number = 500): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * ENTITY EXTRACTION
 * Uses Gemini to extract graph nodes and edges from text chunks.
 */
export const extractGraphFromChunk = async (chunk: string): Promise<GraphData> => {
  if (!API_KEY) throw new Error("API Key missing");

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Extract entities and relationships from the following text to build a knowledge graph. 
      Identify key subjects (Nodes) and their connections (Links).
      
      Text: "${chunk}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Unique identifier for the entity" },
                  label: { type: Type.STRING, description: "Type of entity (e.g. Person, Location, Concept)" }
                },
                required: ["id", "label"]
              }
            },
            links: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING, description: "ID of the source node" },
                  target: { type: Type.STRING, description: "ID of the target node" },
                  type: { type: Type.STRING, description: "Relationship type (e.g. CONTAINS, AUTHOR_OF)" }
                },
                required: ["source", "target", "type"]
              }
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text || '{"nodes": [], "links": []}');
    
    // Normalize data for D3
    const nodes: Node[] = json.nodes.map((n: any) => ({ ...n, group: 1 }));
    const links: Link[] = json.links.map((l: any) => ({ ...l }));

    return { nodes, links };

  } catch (error) {
    console.error("Extraction error:", error);
    return { nodes: [], links: [] };
  }
};

/**
 * RAG ANSWER GENERATION
 * Uses retrieved context to answer the user query.
 */
export const generateRAGResponse = async (query: string, context: string[]): Promise<string> => {
  if (!API_KEY) return "Please provide a valid API Key to use the chatbot.";

  const contextBlock = context.join("\n\n");
  
  const prompt = `
  You are a helpful assistant for a Knowledge Graph system.
  Use the provided Context information retrieved from our knowledge base (Neo4j simulation) to answer the user's question.
  If the answer is not in the context, say you don't know based on the available data.
  
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
