
Start the api using docker make the following `docker-compose.yml` file:

```yaml
services:
  api:
    image: docker.io/jamiewannenburg/prover9-mace4-web-api:latest
    container_name: prover9-mace4-web-api
    command: python api_server.py --production --host 0.0.0.0 --port 8000
    ports:
      - "127.0.0.1:8000:8000"
    expose:
      - "8000"
    environment:
      - PYTHONPATH=/app
    restart: unless-stopped
```

Or to build locally clone the git directory:

```bash
cd prover9-mace4-api
docker compose up
```

Or build locally:

```bash
cd prover9-mace4-api
# Build the image
docker build -t prover9-mace4-web-api .

# Run the container
docker run -p 8000:8000 -d prover9-mace4-web-api
```

Or to run directly:

First download binaries from https://github.com/jamiewannenburg/ladr/releases or https://github.com/laitep/ladr/releases into the `bin` subdirectory (docker does this automatically).

1. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the api server:
   ```
   python api_server.py
   ```
