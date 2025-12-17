import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import graphRoutes from './routes/graph.js';
import documentRoutes from './routes/documents.js';
import ragRoutes from './routes/rag.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit to handle large graph data
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes (keep /api prefix - will be handled by Vercel routing)
app.use('/api/graph', graphRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/rag', ragRoutes);

// Health check (accessible at /api/health)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    neo4j: process.env.NEO4J_URI || 'not configured'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}

// Export for Vercel serverless
export default app;

