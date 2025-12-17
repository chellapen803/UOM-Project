// Vercel Serverless Function Entry Point
// This handles all /api/* requests and routes them to Express

import app from '../backend/server.js';

// Export the Express app directly - Vercel will handle routing
export default app;
