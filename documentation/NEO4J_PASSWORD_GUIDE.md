# How to Get/Set Neo4j Password

## If Neo4j is NOT installed yet:

### Method 1: Use the Installation Script (Recommended)
```bash
cd backend
bash install-neo4j.sh
```
The script will ask you to set a password, then tell you what to put in `.env`

### Method 2: Manual Docker Installation
```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/YOUR_PASSWORD_HERE \
  neo4j:latest
```

Then update `backend/.env`:
```env
NEO4J_PASSWORD=YOUR_PASSWORD_HERE
```

## If Neo4j is already installed:

### Check if container exists:
```bash
docker ps -a | grep neo4j
```

### If it's running but you forgot the password:

**Option A: Reset the password**
1. Go to Neo4j Browser: http://localhost:7474
2. Default username is `neo4j`
3. If you can't login, you'll need to reset it (see below)

**Option B: Reset via Docker**
```bash
# Stop the container
docker stop neo4j

# Remove the container (WARNING: This deletes data!)
docker rm neo4j

# Create new one with known password
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/newpassword123 \
  neo4j:latest
```

## Default Password (if using Neo4j Desktop):

If you installed Neo4j Desktop:
1. Open Neo4j Desktop
2. Click on your database
3. Click "Manage" or "Open Browser"
4. The password was set when you created the database
5. If forgotten, you can reset it in Neo4j Desktop settings

## Quick Test:

After setting password in `.env`, test connection:
```bash
cd backend
npm start
```

You should see: `✅ Connected to Neo4j`

If you see an error, check:
1. Neo4j container is running: `docker ps | grep neo4j`
2. Password in `.env` matches the one used to create container
3. Port 7687 is accessible

