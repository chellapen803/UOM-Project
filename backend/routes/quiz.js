import express from 'express';
import { verifyToken, requireAuth, requireSuperuser } from '../middleware/auth.js';
import { GoogleGenAI } from "@google/genai";
import { saveQuizQuestions, getQuizQuestions, hasQuizQuestions } from '../services/neo4jService.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

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
 * Retry helper with exponential backoff
 * Retries on 503 (service unavailable) and 429 (rate limit) errors
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable (503 or 429)
      const isRetryable = error?.status === 503 || 
                         error?.status === 429 ||
                         error?.message?.includes('overloaded') ||
                         error?.message?.includes('UNAVAILABLE');
      
      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === maxRetries || !isRetryable) {
        throw error;
      }
      
      // Calculate delay with exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`[Quiz] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay. Error: ${error?.message || error?.status}`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Attempt to repair malformed JSON
 * Fixes common issues like trailing commas, unclosed brackets, etc.
 */
function repairJson(jsonText) {
  let repaired = jsonText;
  
  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  
  // Try to close unclosed arrays/objects
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  
  // Close unclosed objects
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }
  
  // Close unclosed arrays
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  
  return repaired;
}

/**
 * Parse JSON with repair attempts
 */
function parseJsonWithRepair(jsonText) {
  // First, try to extract JSON from markdown code blocks
  let extracted = jsonText.trim();
  
  // Pattern 1: ```json ... ```
  let jsonMatch = extracted.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    extracted = jsonMatch[1];
  } else {
    // Pattern 2: ```json\n...\n``` (with newlines)
    jsonMatch = extracted.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\n?\s*```/);
    if (jsonMatch) {
      extracted = jsonMatch[1];
    } else {
      // Pattern 3: Find JSON object in the text (look for first { to last })
      const firstBrace = extracted.indexOf('{');
      const lastBrace = extracted.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        extracted = extracted.substring(firstBrace, lastBrace + 1);
      }
    }
  }
  
  extracted = extracted.trim();
  
  // Try parsing as-is first
  try {
    return JSON.parse(extracted);
  } catch (e) {
    // If that fails, try repairing
    try {
      const repaired = repairJson(extracted);
      return JSON.parse(repaired);
    } catch (e2) {
      // If repair fails, try to extract partial JSON (up to the error position)
      const errorPos = e.message.match(/position (\d+)/);
      if (errorPos) {
        const pos = parseInt(errorPos[1]);
        // Try to find the last complete question before the error
        const partial = extracted.substring(0, pos);
        const lastCompleteQuestion = partial.lastIndexOf('},');
        if (lastCompleteQuestion > 0) {
          try {
            const partialJson = extracted.substring(0, lastCompleteQuestion + 1) + ']}';
            return JSON.parse(partialJson);
          } catch (e3) {
            // Last resort: throw original error
            throw e;
          }
        }
      }
      throw e;
    }
  }
}

/**
 * Check if quiz questions exist (for all authenticated users)
 */
router.get('/check', verifyToken, requireAuth, async (req, res) => {
  try {
    const exists = await hasQuizQuestions();
    res.json({ hasQuestions: exists });
  } catch (error) {
    console.error('Error checking quiz questions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all quiz questions (for all authenticated users)
 */
router.get('/questions', verifyToken, requireAuth, async (req, res) => {
  try {
    const questions = await getQuizQuestions();
    res.json({
      success: true,
      questions: questions,
      count: questions.length
    });
  } catch (error) {
    console.error('Error getting quiz questions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Extract questions and answers from PDF content
 * Expects pages array with text and/or image content
 * Requires superuser access
 */
router.post('/extract-questions', verifyToken, requireSuperuser, async (req, res) => {
  try {
    const { pages } = req.body;
    
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'pages array is required' });
    }

    // Check if questions already exist globally
    try {
      const existingQuestions = await getQuizQuestions();
      if (existingQuestions && existingQuestions.length > 0) {
        console.log(`[Quiz] Found ${existingQuestions.length} existing questions`);
        return res.json({
          success: true,
          questions: existingQuestions,
          count: existingQuestions.length,
          cached: true
        });
      }
    } catch (error) {
      console.warn(`[Quiz] Could not check for existing questions:`, error.message);
      // Continue with extraction if check fails
    }

    if (!API_KEY || !ai) {
      return res.status(500).json({ error: 'Gemini API key is not configured' });
    }

    // Process pages in batches to avoid token limits and JSON truncation
    // Increased batch size for faster processing (fewer API calls)
    const BATCH_SIZE = 100; // Process 100 pages at a time (increased from 50)
    const textPages = pages.filter(p => p.type === 'text');
    const imagePages = pages.filter(p => p.type === 'image');
    
    // Check if we have any content
    if (textPages.length === 0 && imagePages.length === 0) {
      return res.status(400).json({ error: 'No extractable content found in PDF pages' });
    }

    // Process ALL batches in parallel for maximum speed
    // No concurrency limit - process everything at once
    const allQuestions = [];
    const totalBatches = Math.ceil(textPages.length / BATCH_SIZE);
    
    console.log(`[Quiz] Processing ${textPages.length} text pages in ${totalBatches} batch(es) (all parallel)`);
    
    // Helper function to process a single batch
    const processBatch = async (batchIndex, startQuestionId) => {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, textPages.length);
      const batchPages = textPages.slice(startIdx, endIdx);
      
      console.log(`[Quiz] Processing batch ${batchIndex + 1}/${totalBatches} (pages ${startIdx + 1}-${endIdx})`);
      
      // Combine text content for this batch
      const textContent = batchPages
        .map(p => p.content)
        .join('\n\n');

      // Build prompt for question extraction
      const prompt = `Extract all questions and their correct answers from the following content. 
IMPORTANT: Return ONLY valid JSON. Do not include any markdown formatting or extra text outside the JSON.

Return the results as a JSON object with a "questions" array where each question has:
- id: unique identifier (number starting from ${startQuestionId})
- question: the question text
- options: object with 4 options (A, B, C, D) - if less than 4 options exist, use what's available
- correctAnswer: the letter of the correct answer (A, B, C, or D)
- explanation: brief explanation of why the correct answer is correct (optional)
- optionExplanations: object with explanations for each option (A, B, C, D) explaining why each option is correct or incorrect (optional but highly recommended)

Format (return ONLY this JSON, no markdown):
{
  "questions": [
    {
      "id": ${startQuestionId},
      "question": "What is...?",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correctAnswer": "A",
      "explanation": "Brief explanation of why A is correct",
      "optionExplanations": {
        "A": "Explanation of why A is correct",
        "B": "Explanation of why B is incorrect",
        "C": "Explanation of why C is incorrect",
        "D": "Explanation of why D is incorrect"
      }
    }
  ]
}

IMPORTANT: If the source material provides explanations for why each option is correct or incorrect, include them in optionExplanations. This helps users understand not just the right answer, but why other options are wrong.

Content:
${textContent}`;

      // Prepare content parts for Gemini
      const parts = [{ text: prompt }];

      // Add images if any (limit to 5 images per batch to avoid token limits)
      const batchImagePages = imagePages.slice(batchIndex * 5, (batchIndex + 1) * 5);
      for (const imgPage of batchImagePages) {
        // Extract base64 data from data URL (format: data:image/jpeg;base64,...)
        const base64Data = imgPage.content.includes(',') 
          ? imgPage.content.split(',')[1] 
          : imgPage.content;
        
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Data
          }
        });
        
        // Add text context for each image
        parts.push({ text: `\n[Image from Page ${imgPage.pageNumber}]` });
      }

      // Call Gemini API with retry logic
      const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model: MODEL_NAME,
          contents: [{ role: 'user', parts }],
        });
      });

      const responseText = response.text;
      
      if (!responseText) {
        console.warn(`[Quiz] Empty response from Gemini API for batch ${batchIndex + 1}`);
        return { batchIndex, questions: [] };
      }

      // Parse JSON with repair logic
      let parsed;
      try {
        parsed = parseJsonWithRepair(responseText);
      } catch (parseError) {
        console.error(`[Quiz] JSON Parse Error for batch ${batchIndex + 1}:`, parseError.message);
        console.error(`[Quiz] Response preview:`, responseText.substring(0, 500));
        return { batchIndex, questions: [] };
      }
      
      // Validate structure
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        console.warn(`[Quiz] Invalid response format for batch ${batchIndex + 1}: expected questions array`);
        return { batchIndex, questions: [] };
      }

      // Validate and process questions from this batch
      const batchQuestions = parsed.questions.map((q, idx) => {
        if (!q.question || !q.options || !q.correctAnswer) {
          console.warn(`[Quiz] Question ${idx + 1} in batch ${batchIndex + 1} is missing required fields`);
          return null;
        }
        
        // Ensure correctAnswer is uppercase letter
        const correctAnswer = q.correctAnswer.toUpperCase().trim();
        if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
          console.warn(`[Quiz] Question ${idx + 1} in batch ${batchIndex + 1} has invalid correctAnswer: ${correctAnswer}`);
          return null;
        }

        return {
          id: startQuestionId + idx,
          question: q.question.trim(),
          options: q.options,
          correctAnswer: correctAnswer,
          explanation: q.explanation || '',
          optionExplanations: q.optionExplanations || {}
        };
      }).filter(q => q !== null); // Remove invalid questions

      console.log(`[Quiz] Extracted ${batchQuestions.length} questions from batch ${batchIndex + 1}`);
      return { batchIndex, questions: batchQuestions };
    };

    // Set up streaming response for progress updates
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    // Send initial progress
    res.write(JSON.stringify({
      type: 'progress',
      batch: 0,
      totalBatches,
      questionsExtracted: 0,
      status: 'Starting extraction... Processing all batches in parallel'
    }) + '\n');
    
    // Process ALL batches in parallel for maximum speed
    const batchPromises = [];
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Use batch index * 100 as starting ID (will be renumbered later)
      batchPromises.push(processBatch(batchIndex, batchIndex * 100 + 1));
    }
    
    // Wait for all batches to complete
    const results = await Promise.all(batchPromises);
    
    // Sort results by batch index to maintain order
    results.sort((a, b) => a.batchIndex - b.batchIndex);
    
    // Process results and send progress updates
    let completedBatches = 0;
    for (const result of results) {
      const renumberedQuestions = result.questions.map((q, idx) => ({
        ...q,
        id: allQuestions.length + idx + 1
      }));
      allQuestions.push(...renumberedQuestions);
      completedBatches++;
      
      // Send progress update as each batch completes
      res.write(JSON.stringify({
        type: 'progress',
        batch: completedBatches,
        totalBatches,
        questionsExtracted: allQuestions.length,
        status: `Processed batch ${result.batchIndex + 1}/${totalBatches} (${result.questions.length} questions)`
      }) + '\n');
    }

    // If no questions were extracted, return error
    if (allQuestions.length === 0) {
      res.write(JSON.stringify({
        type: 'error',
        error: 'Failed to extract any questions from PDF. The PDF may not contain questions in a recognizable format, or all batches failed to parse.',
        details: `Processed ${totalBatches} batch(es) but found no valid questions`
      }) + '\n');
      res.end();
      return;
    }
    
    // Save questions to Neo4j for future use (globally)
    try {
      await saveQuizQuestions(allQuestions);
      console.log(`[Quiz] Saved ${allQuestions.length} questions to database`);
    } catch (saveError) {
      console.error(`[Quiz] Failed to save questions to database:`, saveError);
      // Continue even if save fails - questions are still returned
    }
    
    // Send final result
    res.write(JSON.stringify({
      type: 'complete',
      success: true,
      questions: allQuestions,
      count: allQuestions.length,
      cached: false
    }) + '\n');
    
    res.end();
    return;

  } catch (error) {
    console.error('Error extracting questions:', error);
    
    // Provide helpful error messages
    if (error.message.includes('JSON') || error.message.includes('parse')) {
      return res.status(500).json({ 
        error: 'Failed to parse questions from PDF. The PDF may not contain questions in a recognizable format, or the AI response was not in the expected JSON format.',
        details: error.message
      });
    }
    
    // Handle service unavailable/overloaded errors (503)
    if (error?.status === 503 || error?.message?.includes('overloaded') || error?.message?.includes('UNAVAILABLE')) {
      return res.status(503).json({ 
        error: 'Gemini API is currently overloaded. The request was automatically retried but still failed. Please try again in a few moments.',
        details: error?.message || 'Service temporarily unavailable',
        type: 'service_unavailable',
        retryable: true
      });
    }
    
    // Handle quota/rate limit errors (429)
    if (error?.status === 429) {
      let errorMessage = 'Gemini API quota exceeded. ';
      const errorMsg = error?.message || '';
      
      // Check if it's a quota issue (not just rate limit)
      if (errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMessage += 'You have exceeded your current API quota. ';
        errorMessage += 'This could mean:\n';
        errorMessage += '• Free tier daily quota reached (typically 20 requests/day)\n';
        errorMessage += '• Monthly quota exceeded\n';
        errorMessage += '• Billing limit reached\n\n';
        errorMessage += '**Solutions:**\n';
        errorMessage += '• Wait for quota reset (free tier resets daily)\n';
        errorMessage += '• Check your usage: https://ai.dev/rate-limit\n';
        errorMessage += '• Upgrade your plan: https://ai.google.dev/pricing\n';
        errorMessage += '• Review billing: https://console.cloud.google.com/billing';
      } else {
        errorMessage += 'Rate limit exceeded. Please try again in a few moments.';
      }
      
      return res.status(429).json({ 
        error: errorMessage,
        details: errorMsg,
        type: 'quota_exceeded'
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to extract questions from PDF'
    });
  }
});

export default router;

