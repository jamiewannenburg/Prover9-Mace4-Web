#!/usr/bin/env python3
"""
Prover9-Mace4 API Server
A FastAPI-based REST API for Prover9 and Mace4
"""

import argparse
import os
import sys
import time
import signal
from typing import Dict, List, Optional, Union
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

from p9m4_types import (
    ProgramInput, ParseInput, ParseOutput, ProgramType, ProcessInfo, 
    ProcessState, GuiOutput, ProcessOutput, Parameter, Flag, Mace4Options, Prover9Options
)

from parse import parse_string
from parse import generate_input as p9m4_generate_input
from pyparsing import ParseException
# TODO should not need process_lock any more
from process_handler import (
    process_lock, processes,
    run_program, 
    #get_prover9_stats, get_mace4_stats, get_isofilter_stats
    #, process_outputs
    processes,
    clean_up
)
from process_handler import remove_process as remove_process_handler
from process_handler import kill_process as kill_process_handler

# Constants
BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin')

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Clean up processes and close the shelve database when the application shuts down
    clean_up()

# FastAPI app
app = FastAPI(title="Prover9-Mace4 API", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.post("/start")
async def start_program(input: ProgramInput, background_tasks: BackgroundTasks) -> Dict:
    """Start a new process"""
    # Generate process ID
    process_id = int(time.time() * 1000)
    # Create process info
    process_info = ProcessInfo(
        pid=0,
        start_time=datetime.now(),
        state=ProcessState.READY,
        program=input.program,
        input=input.input,
        name=input.name,
        options=input.options
    )

    # Add to tracking
    with process_lock:
        processes[str(process_id)] = process_info

    # Start process in background
    background_tasks.add_task(run_program, input.program, input.input, process_id, input.options)

    return {"process_id": process_id}

@app.get("/status/{process_id}")
async def get_status(process_id: int) -> ProcessInfo:
    """Get the status of a process"""
    if str(process_id) not in processes:
        raise HTTPException(status_code=404, detail="Process not found")
    return processes[str(process_id)]

@app.get("/processes")
async def list_processes() -> List[int]:
    """List all tracked processes"""
    return [int(process_id) for process_id in processes]

@app.post("/kill/{process_id}")
async def kill_process(process_id: int) -> Dict:
    """Kill a running process"""
    if str(process_id) not in processes:
        raise HTTPException(status_code=404, detail="Process not found")
    
    success = kill_process_handler(process_id)
    if not success:
        raise HTTPException(status_code=400, detail="Process is not running or suspended")
    
    return {"status": "success", "message": f"Process {process_id} killed"}

@app.get('/download/{process_id}')
async def download_process(process_id: int) -> StreamingResponse:
    """Download the output of a process"""
    with process_lock:
        if str(process_id) not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
            
        process_info = processes[str(process_id)]
        if not process_info.fout_path:
            raise HTTPException(status_code=404, detail="Process output file not found")
        
        # get the extension of the file
        if process_info.program == ProgramType.PROVER9:
            extension = 'proof'
        elif process_info.program == ProgramType.MACE4:
            extension = 'out'
        elif process_info.program == ProgramType.ISOFILTER:
            extension = 'model'
        elif process_info.program == ProgramType.INTERPFORMAT:
            extension = 'model'
        elif process_info.program == ProgramType.PROOFTRANS:
            extension = 'proof'
        else:
            extension = 'txt'

        return StreamingResponse(
            open(process_info.fout_path, 'rb'), 
            media_type='text/plain',
            headers={
                'Content-Disposition': f'attachment; filename=output_{process_id}.{extension}'
            })


@app.get("/output/{process_id}")
async def get_process_output(process_id: int, page: Optional[int] = None, page_size: Optional[int] = None) -> ProcessOutput:
    """Get the output of a process with optional pagination"""
    with process_lock:
        if str(process_id) not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[str(process_id)]
        if not process_info.fout_path:
            raise HTTPException(status_code=404, detail="Process output file not found")
        
        # Get total number of lines
        with open(process_info.fout_path, 'rb') as f:
            total_lines = sum(1 for _ in f)
        
        # If no pagination parameters are provided, stream the entire output
        if page is None or page_size is None:
            with open(process_info.fout_path, 'rb') as f:
                output = f.read().decode('utf-8', errors='replace')
            return ProcessOutput(
                output=output,
                total_lines=total_lines,
                page=1,
                page_size=total_lines,
                has_more=False
            )
        
        # Calculate pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        has_more = end_idx < total_lines
        
        # Get the requested page of lines
        lines = []
        with open(process_info.fout_path, 'rb') as f:
            for i, line in enumerate(f):
                if i >= start_idx and i < end_idx:
                    lines.append(line.decode('utf-8', errors='replace').rstrip('\n'))
                elif i >= end_idx:
                    break
        
        page_output = "\n".join(lines)
        
        return ProcessOutput(
            output=page_output,
            total_lines=total_lines,
            page=page,
            page_size=page_size,
            has_more=has_more
        )

@app.delete("/process/{process_id}")
async def remove_process(process_id: int) -> Dict:
    """Remove a completed process from the list"""
    success = remove_process_handler(process_id)
    if not success:
        raise HTTPException(status_code=404, detail="Process not found")
    return {"status": "success", "message": f"Process {process_id} removed"}

@app.post("/pause/{process_id}")
async def pause_process(process_id: int) -> Dict:
    """Pause a running process"""
    with process_lock:
        if str(process_id) not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[str(process_id)]
        if process_info.state != ProcessState.RUNNING:
            raise HTTPException(status_code=400, detail="Process is not running")
        # windows cannot pause a process
        if os.name == 'nt':
            raise HTTPException(status_code=400, detail="Windows cannot pause a process")
        # Update state and send signal
        processes[str(process_id)].state = ProcessState.SUSPENDED
        os.kill(process_info.pid, signal.SIGSTOP)
        return {"status": "success", "message": "Process paused"}

@app.post("/resume/{process_id}")
async def resume_process(process_id: int) -> Dict:
    """Resume a paused process"""
    with process_lock:
        if str(process_id) not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[str(process_id)]
        if process_info.state != ProcessState.SUSPENDED:
            raise HTTPException(status_code=400, detail="Process is not paused")
        # windows cannot resume a process
        if os.name == 'nt':
            raise HTTPException(status_code=400, detail="Windows cannot resume a process")
        # Update state and send signal
        processes[str(process_id)].state = ProcessState.RUNNING
        os.kill(process_info.pid, signal.SIGCONT)
        return {"status": "success", "message": "Process resumed"}

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