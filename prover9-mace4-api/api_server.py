#!/usr/bin/env python3
"""
Prover9-Mace4 API Server
A FastAPI-based REST API for Prover9 and Mace4
"""

import argparse
import asyncio
import os
import sys
from typing import Dict, List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, PlainTextResponse
from contextlib import asynccontextmanager

from p9m4_types import (
    ParseInput,
    ParseOutput,
    ProgramRunRequestV2,
    ProgramType,
    GuiOutput,
    RunAccepted,
    RunActionResponse,
    RunArtifact,
    RunArtifacts,
    RunSummary,
)
from delivery_manager import DeliveryManager

from parse import parse_string
from parse import generate_input as p9m4_generate_input
from pyparsing import ParseException

# Constants
BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin')

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

# FastAPI app
app = FastAPI(title="Prover9-Mace4 API", lifespan=lifespan)
delivery_manager = DeliveryManager()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.post("/prover9")
async def start_prover9(request: ProgramRunRequestV2) -> RunAccepted:
    """Start a Prover9 run with persisted or stream delivery."""
    return await delivery_manager.create_run(ProgramType.PROVER9, request)


@app.post("/mace4")
async def start_mace4(request: ProgramRunRequestV2) -> RunAccepted:
    """Start a Mace4 run with persisted or stream delivery."""
    return await delivery_manager.create_run(ProgramType.MACE4, request)


@app.post("/prooftrans")
async def start_prooftrans(request: ProgramRunRequestV2) -> RunAccepted:
    """Start a Prooftrans run with persisted or stream delivery."""
    return await delivery_manager.create_run(ProgramType.PROOFTRANS, request)


@app.post("/interpformat")
async def start_interpformat(request: ProgramRunRequestV2) -> RunAccepted:
    """Start an Interpformat run with persisted or stream delivery."""
    return await delivery_manager.create_run(ProgramType.INTERPFORMAT, request)


@app.post("/isofilter")
async def start_isofilter(request: ProgramRunRequestV2) -> RunAccepted:
    """Start an Isofilter run with persisted or stream delivery."""
    return await delivery_manager.create_run(ProgramType.ISOFILTER, request)


@app.get("/runs")
async def list_runs() -> List[RunSummary]:
    """List persisted runs."""
    return delivery_manager.list_runs()


@app.get("/runs/{run_id}/status")
async def get_run_status(run_id: str) -> RunSummary:
    """Get lifecycle status for a run."""
    return delivery_manager.get_summary(run_id)


@app.get("/runs/{run_id}/artifacts")
async def get_run_artifacts(run_id: str) -> RunArtifacts:
    """Return all persisted artifacts for a run."""
    run = delivery_manager.get_run(run_id)
    if run.delivery_mode.value != "persisted":
        raise HTTPException(status_code=400, detail="artifacts are available only for persisted runs")
    return RunArtifacts(run_id=run_id, artifacts=run.artifacts)


@app.get("/runs/{run_id}/artifacts/{artifact}")
async def get_run_artifact(run_id: str, artifact: str) -> RunArtifact:
    """Return a single persisted artifact by stable key."""
    return RunArtifact(
        run_id=run_id,
        artifact=artifact,
        content=delivery_manager.get_artifact(run_id, artifact),
    )


@app.get("/runs/{run_id}/download/{artifact}")
async def download_run_artifact(run_id: str, artifact: str) -> PlainTextResponse:
    """Download artifact as plain text."""
    payload = delivery_manager.get_artifact(run_id, artifact)
    if isinstance(payload, str):
        text = payload
    else:
        import json
        text = json.dumps(payload, indent=2)
    return PlainTextResponse(
        text,
        headers={"Content-Disposition": f'attachment; filename="{run_id}_{artifact}.txt"'},
    )


@app.delete("/runs/{run_id}")
async def delete_run(run_id: str) -> RunActionResponse:
    """Delete run and associated in-memory state."""
    return RunActionResponse(**delivery_manager.delete_run(run_id))


@app.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str) -> RunActionResponse:
    """Cancel an active run."""
    return RunActionResponse(**delivery_manager.cancel_run(run_id))


@app.get("/runs/{run_id}/stream")
async def stream_run(run_id: str) -> StreamingResponse:
    """Subscribe to lifecycle/output events for one run via SSE."""
    return StreamingResponse(
        delivery_manager.stream_events(run_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

@app.post("/parse")
def parse(input: ParseInput) -> ParseOutput:
    """Parse the input to extract assumptions, goals, and options using pyparsing"""
    content = input.input
    # Parse the content
    try:
        result = parse_string(content)
    except ParseException as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}")
    return result

@app.post("/generate_input")
def generate_input(input: GuiOutput) -> str:
    """Generate input for Prover9/Mace4"""
    return p9m4_generate_input(input)

# Serve static files from samples directory
app.mount("/samples", StaticFiles(directory="samples"), name="samples")

# Give a list of samples
@app.get("/samples")
async def list_samples() -> List[Dict]:
    def build_tree(directory, base_path=""):
        items = []
        for item in sorted(os.listdir(directory)):
            item_path = os.path.join(directory, item)
            relative_path = os.path.join(base_path, item) if base_path else item
            
            if os.path.isdir(item_path):
                node = {
                    "name": item,
                    "type": "directory",
                    "path": relative_path,
                    "children": build_tree(item_path, relative_path)
                }
            else:
                node = {
                    "name": item,
                    "type": "file", 
                    "path": relative_path
                }
            items.append(node)
        return items
    
    return build_tree("samples")

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        # pyp9m4 async runner uses asyncio subprocess APIs which require Proactor on Windows.
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--production", action="store_true")
    args = parser.parse_args()
    import uvicorn
    if args.debug:
        # set reload to true if not specified
        if not args.reload:
            args.reload = True
    if args.production:
        # set reload to false
        args.reload = False
        # set host to 0.0.0.0 if not specified
        if args.host == "localhost":
            args.host = "0.0.0.0"
            
    uvicorn.run("api_server:app", host=args.host, port=args.port, reload=args.reload) 