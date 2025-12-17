# Fix Docker Permission Error

## The Problem
You're getting: `permission denied while trying to connect to the Docker daemon socket`

This means your user doesn't have permission to use Docker.

## Solution: Add your user to the docker group

Run these commands in your terminal:

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in (or restart your computer) for changes to take effect
# OR use this command to apply changes to current session:
newgrp docker
```

After running `newgrp docker`, try the installation script again.

## Alternative: Use sudo (temporary solution)

If you prefer to use sudo for now:

```bash
sudo docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  neo4j:latest
```

Then update `backend/.env`:
```env
NEO4J_PASSWORD=password123
```

**Note:** Using sudo for Docker is less secure. Adding to docker group is recommended.

