/**
 * URL Content Fetching Service
 * Fetches and extracts text content from URLs, with special handling for Wikipedia
 */

/**
 * Extract clean text from HTML content
 */
function extractTextFromHTML(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  let text = html;

  // Remove script and style elements
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Replace block-level elements with line breaks
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&hellip;/g, '...');

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n'); // Multiple blank lines to double
  text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single
  text = text.replace(/^\s+|\s+$/gm, ''); // Trim each line
  text = text.trim();

  return text;
}

/**
 * Fetch Wikipedia article using Wikipedia REST API
 * Returns clean text content
 */
async function fetchWikipediaArticle(url) {
  try {
    // Extract article title from URL
    // e.g., https://en.wikipedia.org/wiki/Incident_response -> Incident_response
    const urlMatch = url.match(/\/wiki\/(.+)$/);
    if (!urlMatch) {
      throw new Error('Invalid Wikipedia URL format');
    }

    const articleTitle = decodeURIComponent(urlMatch[1].replace(/_/g, ' '));

    // Try to get full article HTML first (more complete)
    try {
      const fullArticleUrl = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(articleTitle)}`;
      const fullResponse = await fetch(fullArticleUrl, {
        headers: {
          'User-Agent': 'KnowledgeGraphBot/1.0 (https://github.com/your-repo)',
          'Accept': 'text/html'
        }
      });

      if (fullResponse.ok) {
        const html = await fullResponse.text();
        const fullText = extractTextFromHTML(html);
        
        // Only return if we got substantial content
        if (fullText.length > 500) {
          return fullText;
        }
      }
    } catch (e) {
      console.warn('Could not fetch full Wikipedia article, trying summary:', e.message);
    }

    // Fallback to summary/extract
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
    const summaryResponse = await fetch(summaryUrl, {
      headers: {
        'User-Agent': 'KnowledgeGraphBot/1.0 (https://github.com/your-repo)',
        'Accept': 'application/json'
      }
    });

    if (!summaryResponse.ok) {
      throw new Error(`Wikipedia API error: ${summaryResponse.status}`);
    }

    const data = await summaryResponse.json();
    return data.extract || data.description || '';

  } catch (error) {
    throw new Error(`Failed to fetch Wikipedia article: ${error.message}`);
  }
}

/**
 * Fetch content from a generic URL
 * Extracts text from HTML
 */
async function fetchGenericURL(url) {
  try {
    // Create AbortController for timeout (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeGraphBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const text = extractTextFromHTML(html);

    if (!text || text.length < 100) {
      throw new Error('Could not extract sufficient text content from URL');
    }

    return text;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout: URL took too long to respond');
    }
    throw new Error(`Failed to fetch URL: ${error.message}`);
  }
}

/**
 * Fetch content from URL
 * Handles Wikipedia specially, falls back to generic HTML extraction
 * 
 * @param {string} url - The URL to fetch
 * @returns {Promise<string>} Extracted text content
 */
export async function fetchURLContent(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required');
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error('Invalid URL format');
  }

  // Only allow http/https protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }

  // Check if it's Wikipedia
  if (parsedUrl.hostname.includes('wikipedia.org')) {
    return await fetchWikipediaArticle(url);
  }

  // Generic URL
  return await fetchGenericURL(url);
}
