#!/bin/bash

# Delete All Neo4j Data Script
# WARNING: This will delete ALL nodes and relationships!

# Read password from .env
if [ -f .env ]; then
    NEO4J_PASSWORD=$(grep NEO4J_PASSWORD .env | cut -d '=' -f2)
else
    NEO4J_PASSWORD="password123"
fi

echo "⚠️  WARNING: This will delete ALL data in Neo4j!"
echo "   This includes:"
echo "   - All nodes (Person, Location, Organization, Concept, Document, Chunk)"
echo "   - All relationships"
echo ""
read -p "Are you sure? Type 'yes' to confirm: " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled. No data was deleted."
    exit 0
fi

echo ""
echo "🗑️  Deleting all data..."

# Check if Neo4j is running
if ! docker ps --format '{{.Names}}' | grep -q "^neo4j$"; then
    echo "❌ Neo4j container is not running!"
    echo "   Start it first: docker start neo4j"
    exit 1
fi

# Delete all nodes and relationships
docker exec neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD \
  "MATCH (n) DETACH DELETE n" 2>&1

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All data deleted successfully!"
    echo ""
    echo "Verifying deletion..."
    
    # Verify deletion
    NODE_COUNT=$(docker exec neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD \
      "MATCH (n) RETURN count(n)" --format plain 2>/dev/null | tail -1)
    
    echo "   Remaining nodes: $NODE_COUNT"
    
    if [ "$NODE_COUNT" = "0" ] || [ -z "$NODE_COUNT" ]; then
        echo "✅ Database is now empty!"
    else
        echo "⚠️  Some nodes may still exist"
    fi
else
    echo "❌ Failed to delete data. Check Neo4j connection."
    exit 1
fi

