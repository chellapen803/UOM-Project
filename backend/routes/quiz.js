import express from 'express';
import { verifyToken, requireAuth } from '../middleware/auth.js';
import { GoogleGenAI } from "@google/genai";
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
 * Extract questions and answers from PDF content
 * Expects pages array with text and/or image content
 */
router.post('/extract-questions', verifyToken, requireAuth, async (req, res) => {
  try {
    const { pages } = req.body;
    
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'pages array is required' });
    }

    if (!API_KEY || !ai) {
      return res.status(500).json({ error: 'Gemini API key is not configured' });
    }

    // Combine all text pages and prepare images
    const textContent = pages
      .filter(p => p.type === 'text')
      .map(p => p.content)
      .join('\n\n');

    const imagePages = pages.filter(p => p.type === 'image');

    // Check if we have any content
    if (!textContent && imagePages.length === 0) {
      return res.status(400).json({ error: 'No extractable content found in PDF pages' });
    }

    // Build prompt for question extraction
    const prompt = textContent 
      ? `Extract all questions and their correct answers from the following content. 
Return the results as a JSON array where each question has:
- id: unique identifier (number starting from 1)
- question: the question text
- options: array of 4 options (A, B, C, D) - if less than 4 options exist, use what's available
- correctAnswer: the letter of the correct answer (A, B, C, or D)
- explanation: brief explanation of why this answer is correct (optional)

Format:
{
  "questions": [
    {
      "id": 1,
      "question": "What is...?",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correctAnswer": "A",
      "explanation": "Brief explanation"
    }
  ]
}

Content:
${textContent}`
      : `Extract all questions and their correct answers from the images provided below. 
Return the results as a JSON array where each question has:
- id: unique identifier (number starting from 1)
- question: the question text
- options: object with 4 options (A, B, C, D) - if less than 4 options exist, use what's available
- correctAnswer: the letter of the correct answer (A, B, C, or D)
- explanation: brief explanation of why this answer is correct (optional)

Format:
{
  "questions": [
    {
      "id": 1,
      "question": "What is...?",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correctAnswer": "A",
      "explanation": "Brief explanation"
    }
  ]
}

Please analyze the images and extract all questions with their answers.`;

    // Prepare content parts for Gemini (multimodal)
    const parts = [{ text: prompt }];

    // Add images if any (limit to 5 images to avoid token limits)
    for (const imgPage of imagePages.slice(0, 5)) {
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

    // Call Gemini API with multimodal content
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts }],
    });

    const responseText = response.text;
    
    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }

    // Try to parse JSON from response
    // Sometimes Gemini wraps JSON in markdown code blocks
    let jsonText = responseText.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonText);
    
    // Validate structure
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error("Invalid response format: expected questions array");
    }

    // Validate each question
    const validatedQuestions = parsed.questions.map((q, idx) => {
      if (!q.question || !q.options || !q.correctAnswer) {
        throw new Error(`Question ${idx + 1} is missing required fields`);
      }
      
      // Ensure correctAnswer is uppercase letter
      const correctAnswer = q.correctAnswer.toUpperCase().trim();
      if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
        throw new Error(`Question ${idx + 1} has invalid correctAnswer: ${correctAnswer}`);
      }

      return {
        id: q.id || idx + 1,
        question: q.question.trim(),
        options: q.options,
        correctAnswer: correctAnswer,
        explanation: q.explanation || ''
      };
    });

    res.json({ 
      success: true, 
      questions: validatedQuestions,
      count: validatedQuestions.length
    });

  } catch (error) {
    console.error('Error extracting questions:', error);
    
    // Provide helpful error messages
    if (error.message.includes('JSON')) {
      return res.status(500).json({ 
        error: 'Failed to parse questions from PDF. The PDF may not contain questions in a recognizable format.',
        details: error.message
      });
    }
    
    // Handle quota/rate limit errors
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

