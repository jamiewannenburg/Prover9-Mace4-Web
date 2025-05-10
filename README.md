# Prover9-Mace4 Web UI

A modern browser-based user interface for Prover9 and Mace4 based on PyWebIO.

## Features

- Browser-based interface (works on desktop, tablet, and mobile)
- Modern, responsive design
- Easy to deploy via Docker
- Can start long running processes on a server
- Preserves most of the functionality of the original wxPython GUI
- Syntax highlighting for input and output

## Installation and Usage

First download binaries from https://github.com/jamiewannenburg/ladr/releases or https://github.com/laitep/ladr/releases into the `bin` directory (docker should do this).

### Option 1: Run with Python directly

1. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the api server:
   ```
   python api_server.py
   ```

3. Open your browser and go to http://localhost:8080

### Option 2: Run with Docker

Get the image at https://docker.io/jamiewannenburg/prover9-mace4-web

Or build locally:

1. Build and start the container using Docker Buildx (recommended method):
   ```
   # Enable BuildKit by default (only needed once)
   export DOCKER_BUILDKIT=1
   
   # Build and run with docker-compose
   docker compose up -d
   ```

   Alternatively, you can use the classic Docker build method:
   ```
   docker compose up -d
   ```

2. Open your browser and go to http://localhost:8080/web

### Option 3: Build using Docker Buildx CLI directly

If you want to use advanced Buildx features:

```bash
# Create a new builder instance (first time only)
docker buildx create --name mybuilder --use

# Build the image
docker buildx build -t prover9-mace4-web .

# Run the container
docker run -p 8000:8000 -d prover9-mace4-web
```

This method allows multi-platform builds and other advanced features.

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

Unit tests for the API are available in `test_api.py`. To run the tests:

```bash
python -m unittest test_api.py
```