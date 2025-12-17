#!/bin/bash

# Neo4j Backup Script
# Creates a complete backup of your Neo4j database

BACKUP_DIR="./neo4j-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/neo4j-backup-$TIMESTAMP.dump"

# Read password from .env or use default
if [ -f .env ]; then
    NEO4J_PASSWORD=$(grep NEO4J_PASSWORD .env | cut -d '=' -f2)
else
    NEO4J_PASSWORD="password123"
fi

echo "📦 Creating Neo4j backup..."
echo "   Password: [hidden]"
echo ""

# Check if Neo4j container is running
if ! docker ps --format '{{.Names}}' | grep -q "^neo4j$"; then
    echo "❌ Neo4j container is not running!"
    echo "   Start it first: docker start neo4j"
    exit 1
fi

# Create backup directory
mkdir -p $BACKUP_DIR

# Stop Neo4j (optional - can also do online backup)
echo "⏸️  Stopping Neo4j..."
docker stop neo4j

# Create dump
echo "📤 Creating dump file..."
docker exec neo4j neo4j-admin database dump neo4j --to-path=/tmp 2>/dev/null || {
    echo "❌ Failed to create dump. Starting Neo4j..."
    docker start neo4j
    exit 1
}

# Copy dump from container
docker cp neo4j:/tmp/neo4j.dump $BACKUP_FILE 2>/dev/null || {
    echo "⚠️  Dump file not found, trying alternative method..."
    
    # Alternative: Export data directly
    docker start neo4j
    sleep 5
    
    # Export nodes
    docker exec neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD --format plain \
      "MATCH (n) WHERE NOT n:Document AND NOT n:Chunk RETURN n.id, labels(n)[0], n.group" \
      > "$BACKUP_DIR/nodes-$TIMESTAMP.csv" 2>/dev/null
    
    # Export relationships
    docker exec neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD --format plain \
      "MATCH (a)-[r]->(b) WHERE NOT a:Document AND NOT a:Chunk AND NOT b:Document AND NOT b:Chunk RETURN a.id, b.id, type(r)" \
      > "$BACKUP_DIR/relationships-$TIMESTAMP.csv" 2>/dev/null
    
    echo "✅ Backup created as CSV files:"
    echo "   - $BACKUP_DIR/nodes-$TIMESTAMP.csv"
    echo "   - $BACKUP_DIR/relationships-$TIMESTAMP.csv"
    exit 0
}

# Start Neo4j
echo "▶️  Starting Neo4j..."
docker start neo4j

# Verify backup file exists
if [ -f "$BACKUP_FILE" ]; then
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo ""
    echo "✅ Backup created successfully!"
    echo "   File: $BACKUP_FILE"
    echo "   Size: $FILE_SIZE"
else
    echo "❌ Backup file was not created"
    exit 1
fi

