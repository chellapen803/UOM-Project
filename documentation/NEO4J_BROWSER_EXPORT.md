# Exporting Neo4j Data via Browser (http://localhost:7474)

## Access Neo4j Browser

1. Go to: **http://localhost:7474**
2. Login with:
   - Username: `neo4j`
   - Password: `password123` (or whatever you set)

## Method 1: Export All Nodes and Relationships

### Step 1: Export All Nodes

In the Neo4j Browser, run this query:

```cypher
MATCH (n)
WHERE NOT n:Document AND NOT n:Chunk
RETURN n.id as id, labels(n)[0] as label, n.group as group
ORDER BY id
```

**To export:**
1. Click the **"Export CSV"** button (download icon) at the bottom of the results
2. Or click the **"Download JSON"** button
3. Save the file (e.g., `nodes-export.csv` or `nodes-export.json`)

### Step 2: Export All Relationships

Run this query:

```cypher
MATCH (a)-[r]->(b)
WHERE NOT a:Document AND NOT a:Chunk 
  AND NOT b:Document AND NOT b:Chunk
RETURN a.id as source, b.id as target, type(r) as type
ORDER BY source, target
```

**To export:**
1. Click **"Export CSV"** or **"Download JSON"**
2. Save the file (e.g., `relationships-export.csv`)

## Method 2: Export Everything (Including Documents)

### All Nodes:

```cypher
MATCH (n)
RETURN n.id as id, labels(n)[0] as label, properties(n) as properties
ORDER BY id
```

### All Relationships:

```cypher
MATCH (a)-[r]->(b)
RETURN a.id as source, b.id as target, type(r) as type, properties(r) as properties
ORDER BY source, target
```

## Method 3: Export Specific Data

### Export only Person nodes:

```cypher
MATCH (n:Person)
RETURN n.id as id, n.label as label, n.group as group
```

### Export relationships of a specific type:

```cypher
MATCH (a)-[r:WORKS_FOR]->(b)
RETURN a.id as source, b.id as target, type(r) as type
```

### Export connected subgraph (e.g., everything connected to "Apple"):

```cypher
MATCH path = (start {id: 'apple'})-[*1..2]-(connected)
WHERE NOT start:Document AND NOT start:Chunk
  AND NOT connected:Document AND NOT connected:Chunk
RETURN DISTINCT connected.id as id, labels(connected)[0] as label
```

## Method 4: Visual Export

1. **View Graph**: Run any query and you'll see the graph visualization
2. **Screenshot**: Take a screenshot of the visualization
3. **Export Graph**: Some Neo4j Browser versions have a "Download Graph" option

## Method 5: APOC Export (If APOC Plugin is Installed)

If you have APOC plugin installed, you can use:

```cypher
CALL apoc.export.csv.all("neo4j-export.csv", {})
```

Or for JSON:

```cypher
CALL apoc.export.json.all("neo4j-export.json", {})
```

## Quick Export Queries

### Complete Graph Data Export:

**Nodes:**
```cypher
MATCH (n)
WHERE NOT n:Document AND NOT n:Chunk
RETURN n.id as id, labels(n)[0] as label, n.group as group
```

**Relationships:**
```cypher
MATCH (a)-[r]->(b)
WHERE NOT a:Document AND NOT a:Chunk 
  AND NOT b:Document AND NOT b:Chunk
RETURN a.id as source, b.id as target, type(r) as type
```

### Full Export (Including Documents and Chunks):

**All Nodes:**
```cypher
MATCH (n)
RETURN n.id as id, labels(n) as labels, properties(n) as properties
```

**All Relationships:**
```cypher
MATCH (a)-[r]->(b)
RETURN labels(a) as sourceLabels, a.id as source, 
       type(r) as relationshipType,
       labels(b) as targetLabels, b.id as target,
       properties(r) as relationshipProperties
```

## Tips

1. **Large Results**: If you have many nodes, the browser might limit results. Add `LIMIT 10000` if needed:
   ```cypher
   MATCH (n)
   RETURN n
   LIMIT 10000
   ```

2. **Export Format**: 
   - **CSV**: Good for Excel/spreadsheet analysis
   - **JSON**: Good for programmatic import/export

3. **Filtering**: You can filter before export:
   ```cypher
   MATCH (n)
   WHERE n.label = 'Person'
   RETURN n
   ```

4. **Count First**: Check how much data you have:
   ```cypher
   MATCH (n)
   WHERE NOT n:Document AND NOT n:Chunk
   RETURN count(n) as nodeCount
   ```

## Restoring from Browser

Unfortunately, you can't directly import CSV/JSON via the browser UI easily. For restoration, you'd typically use:
- The `neo4j-admin load` command
- Or write a script that reads the CSV/JSON and creates nodes via Cypher

## Summary

**Easiest way:**
1. Go to http://localhost:7474
2. Run the export queries above
3. Click "Export CSV" or "Download JSON"
4. Save the files

This gives you readable, portable backups of your data!

