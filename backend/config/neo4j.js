import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

// Test connection
driver.verifyConnectivity()
  .then(() => {
    console.log('✅ Connected to Neo4j');
  })
  .catch((error) => {
    console.error('❌ Neo4j connection error:', error.message);
    console.error('Please ensure Neo4j is running and credentials are correct.');
  });

export default driver;

