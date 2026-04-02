
The HTTP API is implemented with **FastAPI** and runs the LADR tools through **`pyp9m4`** (async facades and binary resolution), not the legacy subprocess/shelve `process_handler` flow.

## HTTP API (summary)

**Program runs** — each program has its own endpoint; the request body is `ProgramRunRequestV2` (`input`, optional `name`, optional `options`, `delivery_mode`):

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/prover9`, `/mace4`, `/prooftrans`, `/interpformat`, `/isofilter` | Start a run; returns `RunAccepted` (`run_id`, `program`, `delivery_mode`, `lifecycle`, `created_at`, optional `stream_url`) |
| `GET` | `/runs` | List persisted runs |
| `GET` | `/runs/{run_id}/status` | Run summary / lifecycle |
| `GET` | `/runs/{run_id}/artifacts` | All artifacts (persisted mode) |
| `GET` | `/runs/{run_id}/artifacts/{artifact}` | Single artifact |
| `GET` | `/runs/{run_id}/download/{artifact}` | Download artifact as plain text |
| `DELETE` | `/runs/{run_id}` | Remove run state |
| `POST` | `/runs/{run_id}/cancel` | Cancel an active run |
| `GET` | `/runs/{run_id}/stream` | SSE stream of run events (`stream` delivery mode) |

**Helpers** (unchanged from the plan):

| Method | Path |
| --- | --- |
| `POST` | `/parse` |
| `POST` | `/generate_input` |

**Removed (breaking):** generic `POST /start` and the old process-centric routes — see `API_GUI_MIGRATION.md` for old→new mapping and GUI changes.

**Input:** `input` is a tagged union: `kind: "text"` (inline `text`), `kind: "file"` (`file_ref`), or `kind: "process_output"` (`run_id`, `artifact`) for chaining from a **completed persisted** run.

**Lifecycle contract:** run status is reported as `queued`, `running`, `completed`, `failed`, or `cancelled` on `GET /runs/{run_id}/status`.

**Delivery:** `delivery_mode` is `persisted` (artifacts and listing) or `stream` (live SSE; no durable artifact API; artifact endpoints return `400` for stream runs).

## Dependencies

Install from the project directory:

```
pip install -r requirements.txt
```

Core runtime packages include FastAPI, uvicorn, pydantic, pyparsing, and **`pyp9m4`** (LADR tool integration). Ensure LADR binaries are on `PATH` (the Docker image installs them under `/app/bin`).

**Mace4 vs Prover9 output:** `pyp9m4.arun("mace4")` does not attach subprocess `stdout`/`stderr` to the envelope (unlike Prover9). This API exposes **`stdout` / `stderr`** when present, plus **`models`** and **`models_text`** for interpretation text. See [`docs/pyp9m4_mace4_stdout_issue.md`](docs/pyp9m4_mace4_stdout_issue.md).

### `p9m4_gui` conda environment upgrade path

When running this API alongside the GUI conda environment, upgrade `pyp9m4` in `p9m4_gui` first, verify the installed version, then reinstall backend deps:

```bash
conda activate p9m4_gui
python -m pip install --upgrade "pyp9m4>=0.5.0"
python -c "import pyp9m4; print(getattr(pyp9m4, '__version__', 'unknown'))"
python -m pip install -r requirements.txt
```

## Docker

Start the API using Docker; you can use a `docker-compose.yml` like:

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
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

Or build locally from this directory:

```bash
cd prover9-mace4-api
docker compose up
```

Or build the image manually:

```bash
cd prover9-mace4-api
docker build -t prover9-mace4-web-api .
docker run -p 8000:8000 -d prover9-mace4-web-api
```

The Dockerfile downloads LADR binaries into `/app/bin` and sets `PATH` so `pyp9m4` can resolve `prover9`, `mace4`, etc.

To host your own image:

```bash
docker login
docker tag prover9-mace4-web-api yourusername/prover9-mace4-web-api:latest
docker push yourusername/prover9-mace4-web-api:latest
```

Example:

```bash
docker tag prover9-mace4-web-api jamiewannenburg/prover9-mace4-web-api:latest
docker push jamiewannenburg/prover9-mace4-web-api:latest
```

## Run without Docker

Download binaries from https://github.com/jamiewannenburg/ladr/releases or https://github.com/laitep/ladr/releases into the `bin` subdirectory (the Docker build does this automatically).

1. Install dependencies: `pip install -r requirements.txt`
2. Start the server: `python api_server.py`

For production-style bind:

```
python api_server.py --production --host 0.0.0.0 --port 8000
```
