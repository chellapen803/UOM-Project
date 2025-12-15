import { GoogleGenAI, Type } from "@google/genai";
import { GraphData, Node, Link } from "../types";
import { PdfPage } from "./pdfService";

const API_KEY = process.env.API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey: API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * SIMULATED CHUNKING
 */
export const chunkText = (text: string, chunkSize: number = 15000): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
};

// Common Schema
const GRAPH_SCHEMA = {
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
};

/**
 * TEXT ONLY EXTRACTION
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
        responseSchema: GRAPH_SCHEMA
      }
    });

    const json = JSON.parse(response.text || '{"nodes": [], "links": []}');
    return normalizeGraphData(json);

  } catch (error) {
    console.error("Extraction error:", error);
    return { nodes: [], links: [] };
  }
};

/**
 * HYBRID EXTRACTION (TEXT + IMAGES)
 * Handles a mixed array of PDF pages (some text, some images)
 */
export const extractGraphFromMixedContent = async (pages: PdfPage[]): Promise<GraphData> => {
    if (!API_KEY) throw new Error("API Key missing");
  
    try {
      const parts: any[] = [];
  
      // Build the prompt parts sequence
      parts.push({ text: "Analyze the following document pages (which may be text or images). Extract knowledge graph entities (nodes) and relationships (links)." });
  
      pages.forEach(page => {
          if (page.type === 'image') {
              // Image Part
              const data = page.content.replace(/^data:image\/\w+;base64,/, "");
              parts.push({
                  inlineData: {
                      data: data,
                      mimeType: "image/jpeg"
                  }
              });
          } else {
              // Text Part
              parts.push({ text: page.content });
          }
      });
  
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: GRAPH_SCHEMA
        }
      });
  
      const json = JSON.parse(response.text || '{"nodes": [], "links": []}');
      return normalizeGraphData(json);
  
    } catch (error) {
      console.error("Hybrid Extraction error:", error);
      return { nodes: [], links: [] };
    }
  };

const normalizeGraphData = (json: any): GraphData => {
    const nodes: Node[] = (json.nodes || []).map((n: any) => ({ ...n, group: 1 }));
    const links: Link[] = (json.links || []).map((l: any) => ({ ...l }));
    return { nodes, links };
};

/**
 * RAG ANSWER GENERATION
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
