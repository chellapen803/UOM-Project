# Neo4j Data Dump/Export Guide

## Method 1: Using Neo4j Admin Dump (Recommended for Full Backup)

This creates a complete backup of your Neo4j database.

### If using Docker:

```bash
# Stop Neo4j first (optional, but recommended)
docker stop neo4j

# Create a dump file
docker exec neo4j neo4j-admin database dump neo4j --to-path=/tmp

# Copy the dump file from container to your machine
docker cp neo4j:/tmp/neo4j.dump ./neo4j-backup.dump

# Start Neo4j again
docker start neo4j
```

### Restore from dump:

```bash
# Stop Neo4j
docker stop neo4j

# Restore from dump
docker exec neo4j neo4j-admin database load neo4j --from-path=/tmp --overwrite-destination=true
docker cp ./neo4j-backup.dump neo4j:/tmp/neo4j.dump
docker exec neo4j neo4j-admin database load neo4j --from-path=/tmp --overwrite-destination=true

# Start Neo4j
docker start neo4j
```

## Method 2: Export to Cypher Script (Human-readable)

This exports all data as Cypher CREATE statements that you can read and understand.

### Export all nodes and relationships:

```bash
# Connect to Neo4j container and export
docker exec -it neo4j cypher-shell -u neo4j -p password123 -d neo4j \
  "CALL apoc.export.cypher.all(null, {format: 'cypher-shell', streamStatements: true}) YIELD cypherStatements RETURN cypherStatements"
```

**Note:** This requires APOC plugin. If APOC is not installed, use Method 3.

### Or use cypher-shell directly:

```bash
# Export nodes
docker exec neo4j cypher-shell -u neo4j -p password123 \
  "MATCH (n) RETURN n" > nodes-export.txt

# Export relationships  
docker exec neo4j cypher-shell -u neo4j -p password123 \
  "MATCH (a)-[r]->(b) RETURN a, r, b" > relationships-export.txt
```

## Method 3: Export to CSV/JSON (Simple, Readable)

### Export nodes to CSV:

```bash
# Export all nodes
docker exec neo4j cypher-shell -u neo4j -p password123 --format plain \
  "MATCH (n) RETURN n.id as id, labels(n)[0] as label, n.group as group" \
  > nodes-export.csv
```

### Export relationships to CSV:

```bash
# Export all relationships
docker exec neo4j cypher-shell -u neo4j -p password123 --format plain \
  "MATCH (a)-[r]->(b) RETURN a.id as source, b.id as target, type(r) as type" \
  > relationships-export.csv
```

### Export to JSON using APOC:

```bash
docker exec neo4j cypher-shell -u neo4j -p password123 \
  "CALL apoc.export.json.all('/tmp/neo4j-export.json', {}) YIELD file RETURN file"
docker cp neo4j:/tmp/neo4j-export.json ./neo4j-export.json
```

## Method 4: Simple Script-Based Export

Create a simple export script that queries all data and saves it:

```bash
#!/bin/bash
# export-neo4j.sh

NEO4J_USER=neo4j
NEO4J_PASSWORD=password123

# Export nodes
echo "Exporting nodes..."
docker exec neo4j cypher-shell -u $NEO4J_USER -p $NEO4J_PASSWORD \
  "MATCH (n) WHERE NOT n:Document AND NOT n:Chunk RETURN n.id as id, labels(n)[0] as label, n.group as group" \
  > neo4j-nodes-export.csv

# Export relationships
echo "Exporting relationships..."
docker exec neo4j cypher-shell -u $NEO4J_USER -p $NEO4J_PASSWORD \
  "MATCH (a)-[r]->(b) WHERE NOT a:Document AND NOT a:Chunk AND NOT b:Document AND NOT b:Chunk RETURN a.id as source, b.id as target, type(r) as type" \
  > neo4j-relationships-export.csv

echo "✅ Export complete! Files saved as:"
echo "   - neo4j-nodes-export.csv"
echo "   - neo4j-relationships-export.csv"
```

## Method 5: Query Specific Data

Export only your graph data (excluding Document/Chunk nodes):

```bash
# Export graph nodes
docker exec neo4j cypher-shell -u neo4j -p password123 --format plain \
  "MATCH (n) WHERE NOT n:Document AND NOT n:Chunk RETURN n.id, labels(n)[0], n.group" \
  > graph-nodes.csv

# Export graph relationships
docker exec neo4j cypher-shell -u neo4j -p password123 --format plain \
  "MATCH (a)-[r]->(b) WHERE NOT a:Document AND NOT a:Chunk AND NOT b:Document AND NOT b:Chunk RETURN a.id, b.id, type(r)" \
  > graph-relationships.csv
```

## Quick Backup Script

Save this as `backend/backup-neo4j.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./neo4j-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/neo4j-backup-$TIMESTAMP.dump"

mkdir -p $BACKUP_DIR

echo "Creating Neo4j backup..."

# Stop Neo4j
docker stop neo4j

# Create dump
docker exec neo4j neo4j-admin database dump neo4j --to-path=/tmp
docker cp neo4j:/tmp/neo4j.dump $BACKUP_FILE

# Start Neo4j
docker start neo4j

echo "✅ Backup created: $BACKUP_FILE"
```

## Restore Data

### From dump file:

```bash
# Stop Neo4j
docker stop neo4j

# Copy dump to container
docker cp ./neo4j-backup.dump neo4j:/tmp/neo4j.dump

# Load database
docker exec neo4j neo4j-admin database load neo4j --from-path=/tmp --overwrite-destination=true

# Start Neo4j
docker start neo4j
```

### From CSV (manual import):

You would need to write a script to read CSV and create nodes/relationships using Cypher.

## Important Notes

1. **Backup Neo4j container**: The easiest way to backup everything is to backup the entire Neo4j data directory:
   ```bash
   docker cp neo4j:/data ./neo4j-data-backup
   ```

2. **APOC Plugin**: Some export methods require APOC plugin. Install it by adding to docker run:
   ```bash
   -e NEO4J_PLUGINS='["apoc"]'
   ```

3. **Password**: Replace `password123` with your actual Neo4j password.

4. **Timing**: For large databases, exports can take time. Be patient!

