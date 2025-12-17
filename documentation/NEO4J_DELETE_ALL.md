# Delete All Data in Neo4j

## Method 1: Using Neo4j Browser (Easiest)

Go to http://localhost:7474 and run these queries:

### Delete Everything (All Nodes and Relationships):

```cypher
MATCH (n)
DETACH DELETE n
```

This will:
- Delete all nodes
- Delete all relationships (DETACH removes relationships first)
- Clear everything from the database

### Verify Everything is Deleted:

```cypher
MATCH (n)
RETURN count(n) as nodeCount
```

Should return: `0`

## Method 2: Delete Specific Types Only

### Delete Only Graph Nodes (Keep Documents/Chunks):

```cypher
MATCH (n)
WHERE NOT n:Document AND NOT n:Chunk
DETACH DELETE n
```

### Delete Only Documents and Chunks:

```cypher
MATCH (n)
WHERE n:Document OR n:Chunk
DETACH DELETE n
```

### Delete Only Relationships (Keep Nodes):

```cypher
MATCH ()-[r]->()
DELETE r
```

## Method 3: Reset Entire Database (Docker)

### Stop Neo4j:

```bash
docker stop neo4j
```

### Delete the Data Volume:

```bash
# Remove container and its data
docker rm -f neo4j

# If you want to keep the container but delete data:
docker volume ls  # Find the Neo4j volume name
docker volume rm <volume-name>
```

### Start Fresh Neo4j:

```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  neo4j:latest
```

**Warning:** This completely removes the container and all data!

## Method 4: Using Cypher-Shell (Command Line)

```bash
# Delete all nodes and relationships
docker exec neo4j cypher-shell -u neo4j -p password123 \
  "MATCH (n) DETACH DELETE n"
```

## Quick Delete Script

Create `backend/delete-all-neo4j.sh`:

```bash
#!/bin/bash

# Read password from .env
if [ -f .env ]; then
    NEO4J_PASSWORD=$(grep NEO4J_PASSWORD .env | cut -d '=' -f2)
else
    NEO4J_PASSWORD="password123"
fi

echo "⚠️  WARNING: This will delete ALL data in Neo4j!"
read -p "Are you sure? Type 'yes' to confirm: " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo "Deleting all data..."
docker exec neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD \
  "MATCH (n) DETACH DELETE n"

echo "✅ All data deleted!"
```

## Verification Queries

After deletion, verify:

```cypher
// Count all nodes
MATCH (n) RETURN count(n)

// Count all relationships
MATCH ()-[r]->() RETURN count(r)

// List all node types
CALL db.labels()

// Should all return 0 or empty
```

