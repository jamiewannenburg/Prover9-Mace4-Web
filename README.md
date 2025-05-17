# Prover9-Mace4 Web UI

A modern browser-based user interface for Prover9 and Mace4 based on PyWebIO.

## Features

- Browser-based interface (works on desktop, tablet, and mobile)
- Modern, responsive design
- Easy to deploy via Docker
- Can start long running processes on a server
- Preserves most of the functionality of the original wxPython GUI
- Syntax highlighting for input and output

## Deploying api and gui with docker

Deploy the following `docker-compose.yml` file with `docker compose up`:

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
   gui:
    image: docker.io/jamiewannenburg/prover9-mace4-web-gui:latest
    container_name: prover9-mace4-web-gui
    ports:
      - "127.0.0.1:80:80"
    expose:
      - "80"
    depends_on:
      - api
    environment:
      - REACT_APP_API_URL=http://127.0.0.1:8000
    restart: unless-stopped 
```

Or clone the git repository and run:

1. Build and start the container using Docker Buildx (recommended method):
   ```
   # Enable BuildKit by default (only needed once)
   export DOCKER_BUILDKIT=1
   
   # Build and run with docker-compose
   docker compose up
   ```

To run without docker, see the Readme in the `prover9-mace4-api` and `prover9-mace4-gui` directories.

## Usage

The web interface is organized similarly to the original wxPython GUI:

1. **Setup Panel**: Configure inputs and options
   - Formulas: Enter assumptions and goals
   - Language Options: Set language-specific options
   - Prover9 Options: Configure Prover9-specific settings
   - Mace4 Options: Configure Mace4-specific settings
   - Additional Input: Enter any additional input

2. **Run Panel**: Execute and view results
   - Prover9: Run the theorem prover and view results
   - Mace4: Run the model finder and view results

## Sample Workflow

1. Enter assumptions and goals in the Formula tab
2. Set desired options in the Prover9 or Mace4 tabs
3. Switch to the Run tab and click "Start Prover9" or "Start Mace4"
4. View the results in the output area

## License

This project is licensed under the GNU General Public License v2.0.

## Credits

- Original Prover9-Mace4 by William McCune
- Help from Cursor IDE
- Web UI implementation using PyWebIO 
- See the browser-gui branch of https://github.com/jamiewannenburg/Prover9-Mace4-v05

## API Documentation

The Prover9-Mace4 Web UI provides a REST API for programmatic access to its functionality. The API runs on port 8000 by default.

### Endpoints

#### Start a Process
```http
POST /start
Content-Type: application/json

{
    "program": "prover9|mace4|interpformat|isofilter|prooftrans",
    "input": "string",
    "options": {
        // Optional program-specific options
    }
}
```

#### Check Process Status
```http
GET /status/{process_id}
```

#### List All Processes
```http
GET /processes
```

#### Control Process
```http
POST /pause/{process_id}
POST /resume/{process_id}
POST /kill/{process_id}
```

### Example Usage

Here's a Python example showing how to use the API:

```python
import requests

# Start a Prover9 process
response = requests.post("http://localhost:8000/start", json={
    "program": "prover9",
    "input": "formulas(assumptions).\nall x (P(x) -> Q(x)).\nP(a).\nend_of_list.\n\nformulas(goals).\nQ(a).\nend_of_list."
})
process_id = response.json()["process_id"]

# Check status
status = requests.get(f"http://localhost:8000/status/{process_id}").json()

# Control the process
requests.post(f"http://localhost:8000/pause/{process_id}")
requests.post(f"http://localhost:8000/resume/{process_id}")
requests.post(f"http://localhost:8000/kill/{process_id}")
```

### Testing

Unit tests for the API are available in `test_api.py` and `test_parse.py`. To run the tests:

```bash
python -m pytest
```