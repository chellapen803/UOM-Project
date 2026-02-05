# URL Ingestion Feature

## Overview

The URL ingestion feature allows you to automatically fetch content from web URLs and ingest it into your knowledge graph. This is particularly useful for Wikipedia articles, but works with any HTML page.

## How It Works

### User Flow

1. **Select URL Mode**: In the upload interface, click the "URL" tab
2. **Paste URL**: Enter a URL (e.g., `https://en.wikipedia.org/wiki/Incident_response`)
3. **Click Fetch**: The system automatically:
   - Fetches content from the URL
   - Extracts clean text from HTML
   - Processes it into the knowledge graph
   - No manual steps required!

### Technical Flow

```
User Input (URL)
    ↓
Frontend: handleFetchURL()
    ↓
Frontend Service: fetchURLContent() (services/urlService.ts)
    ↓
Backend API: POST /api/documents/fetch-url
    ↓
Backend Service: fetchURLContent() (backend/services/urlService.js)
    ├─→ Wikipedia? → Use Wikipedia REST API
    └─→ Generic URL → Fetch HTML & Extract Text
    ↓
HTML → Text Extraction (extractTextFromHTML)
    ↓
Return Clean Text to Frontend
    ↓
Automatic: handleUpload()
    ├─→ Chunk Text
    ├─→ Extract Entities (NLP)
    ├─→ Extract Relationships
    ├─→ Save to Neo4j
    └─→ Update Graph Visualization
```

## Features

### 1. Wikipedia Optimization

Wikipedia URLs receive special treatment:

- **Uses Wikipedia REST API**: Clean, structured content
- **Full Article First**: Attempts to fetch complete article HTML
- **Summary Fallback**: Falls back to article summary if full article unavailable
- **Smart Naming**: Automatically extracts article title as document name

**Example**:
```
URL: https://en.wikipedia.org/wiki/Incident_response
Document Name: "Incident response"
```

### 2. Generic URL Support

For non-Wikipedia URLs:

- **HTML Fetching**: Fetches the HTML page directly
- **Text Extraction**: Extracts readable text from HTML
- **Timeout Protection**: 10-second timeout to prevent hanging
- **Error Handling**: Clear error messages for failures

### 3. HTML to Text Extraction

The `extractTextFromHTML()` function performs:

1. **Removes Non-Content**:
   - Scripts (`<script>` tags)
   - Styles (`<style>` tags)
   - NoScript elements
   - HTML comments

2. **Preserves Structure**:
   - Paragraphs (`<p>`) → Double line breaks
   - Headings (`<h1-h6>`) → Double line breaks
   - List items (`<li>`) → Line breaks
   - Divs (`<div>`) → Line breaks

3. **Cleans Text**:
   - Removes all HTML tags
   - Decodes HTML entities (`&nbsp;`, `&amp;`, etc.)
   - Normalizes whitespace
   - Trims each line

### 4. Automatic Processing

After fetching:
- Content is automatically processed (no manual "Ingest" button needed)
- Same NLP extraction as text/PDF modes
- Entities and relationships are extracted
- Everything is saved to Neo4j

## Supported URLs

### ✅ Supported

- **Wikipedia Articles**: All language versions
  - Example: `https://en.wikipedia.org/wiki/Cybersecurity`
  - Example: `https://es.wikipedia.org/wiki/Ciberseguridad`

- **Generic HTML Pages**: Any publicly accessible HTTP/HTTPS page
  - Example: `https://example.com/article`
  - Example: `https://blog.example.com/post`

### ❌ Not Supported

- **Non-HTTP Protocols**: Only `http://` and `https://` are allowed
- **Private/Protected Pages**: Requires authentication
- **JavaScript-Heavy Sites**: Content loaded dynamically may not be captured
- **PDFs via URL**: Use PDF upload mode instead

## Security Features

1. **URL Validation**: Ensures valid URL format
2. **Protocol Restriction**: Only HTTP/HTTPS allowed
3. **Authentication Required**: Backend route requires valid Firebase token
4. **Timeout Protection**: 10-second timeout prevents hanging requests
5. **Error Handling**: Graceful error messages for invalid URLs or fetch failures

## Backend Implementation

### Service: `backend/services/urlService.js`

**Main Function**: `fetchURLContent(url)`

```javascript
// Validates URL
// Detects Wikipedia URLs
// Fetches content (Wikipedia API or generic HTML)
// Extracts text from HTML
// Returns clean text
```

**Helper Functions**:
- `fetchWikipediaArticle(url)`: Handles Wikipedia-specific fetching
- `fetchGenericURL(url)`: Handles generic HTML pages
- `extractTextFromHTML(html)`: Converts HTML to clean text

### Route: `backend/routes/documents.js`

**Endpoint**: `POST /api/documents/fetch-url`

**Request**:
```json
{
  "url": "https://en.wikipedia.org/wiki/Incident_response"
}
```

**Response**:
```json
{
  "success": true,
  "content": "Incident response is a systematic approach...",
  "url": "https://en.wikipedia.org/wiki/Incident_response",
  "length": 583
}
```

## Frontend Implementation

### Service: `services/urlService.ts`

**Function**: `fetchURLContent(url: string)`

- Makes authenticated API call to backend
- Handles errors gracefully
- Returns fetched content with metadata

### Component: `App.tsx`

**Function**: `handleFetchURL()`

- Calls frontend URL service
- Stores fetched content in state
- Automatically triggers `handleUpload()` for processing

## Example Usage

### Wikipedia Article

1. Select "URL" mode
2. Paste: `https://en.wikipedia.org/wiki/Incident_response`
3. Click "Fetch"
4. System automatically:
   - Fetches article content
   - Extracts entities (people, organizations, concepts)
   - Builds knowledge graph
   - Updates visualization

### Generic Article

1. Select "URL" mode
2. Paste: `https://example.com/security-guide`
3. Click "Fetch"
4. System fetches and processes the page content

## Troubleshooting

### "Invalid URL format"
- Ensure URL starts with `http://` or `https://`
- Check for typos in the URL

### "Failed to fetch URL"
- URL may be inaccessible (private, requires login)
- Server may be down
- Network connectivity issues

### "Request timeout"
- URL took longer than 10 seconds to respond
- Try again or use a different URL

### "Could not extract sufficient text content"
- Page may be mostly images or JavaScript
- Try a different URL with more text content

## Best Practices

1. **Wikipedia Articles**: Best results with Wikipedia due to clean structure
2. **Article-Style Pages**: Works best with article/blog-style content
3. **Avoid**: JavaScript-heavy single-page applications
4. **Large Pages**: Very large pages are automatically chunked during processing

## Limitations

1. **Dynamic Content**: Content loaded via JavaScript after page load won't be captured
2. **Authentication**: Pages requiring login cannot be accessed
3. **Rate Limiting**: Some sites may rate-limit requests
4. **Format**: Only HTML pages supported (not PDFs, images, etc.)

## Future Enhancements

Potential improvements:
- Support for multiple URLs at once
- Preview of fetched content before ingestion
- Support for RSS feeds
- Better handling of JavaScript-rendered content
- Caching of frequently accessed URLs

