#!/bin/bash

# Neo4j Installation Script
# This script helps you install Neo4j using Docker

echo "🚀 Neo4j Installation Script"
echo "=============================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✅ Docker is installed"
echo ""

# Check if Neo4j container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^neo4j$"; then
    echo "⚠️  Neo4j container already exists!"
    read -p "Do you want to remove it and create a new one? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker stop neo4j 2>/dev/null
        docker rm neo4j 2>/dev/null
        echo "✅ Removed existing Neo4j container"
    else
        echo "Keeping existing container. Starting it..."
        docker start neo4j
        echo "✅ Neo4j container started"
        echo ""
        echo "📝 Your Neo4j password was set when you created the container."
        echo "   Check your .env file or the command you used to create it."
        exit 0
    fi
fi

# Get password from user
echo "Please choose a password for Neo4j:"
read -sp "Password: " PASSWORD
echo ""
read -sp "Confirm password: " PASSWORD_CONFIRM
echo ""

if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
    echo "❌ Passwords don't match!"
    exit 1
fi

if [ -z "$PASSWORD" ]; then
    echo "❌ Password cannot be empty!"
    exit 1
fi

echo ""
echo "📦 Starting Neo4j container..."
echo ""

# Run Neo4j container
docker run -d \
  --name neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/$PASSWORD \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:latest

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Neo4j container started successfully!"
    echo ""
    echo "📝 Update your backend/.env file with:"
    echo "   NEO4J_PASSWORD=$PASSWORD"
    echo ""
    echo "🌐 Neo4j Browser will be available at: http://localhost:7474"
    echo "🔌 Connection URI: bolt://localhost:7687"
    echo ""
    echo "⏳ Waiting for Neo4j to be ready (this may take 30 seconds)..."
    sleep 5
    
    # Wait for Neo4j to be ready
    for i in {1..30}; do
        if docker exec neo4j cypher-shell -u neo4j -p $PASSWORD "RETURN 1" &>/dev/null; then
            echo "✅ Neo4j is ready!"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
else
    echo "❌ Failed to start Neo4j container"
    exit 1
fi

