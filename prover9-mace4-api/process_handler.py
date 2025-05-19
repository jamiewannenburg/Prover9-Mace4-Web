#!/usr/bin/env python3
"""
Process handling module for Prover9-Mace4 API
Handles process creation, monitoring, and management
"""

import os
import re
import time
import tempfile
import subprocess
import threading
import psutil
import json
from typing import Dict, Optional, Union, List
from datetime import datetime
from persistqueue import SQLiteAckQueue

from p9m4_types import (
    ProgramType, ProcessInfo, ProcessState
)
from parse import manual_standardize_mace4_output
from db_models import Session, ProcessModel

# Process queue for currently running processes
PROCESS_QUEUE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'process_queue')
os.makedirs(PROCESS_QUEUE_PATH, exist_ok=True)
process_queue = SQLiteAckQueue(PROCESS_QUEUE_PATH, multithreading=True)
process_lock = threading.Lock()

def binary_ok(fullpath: str) -> bool:
    """Check if binary exists and is executable"""
    return os.path.isfile(fullpath) and os.access(fullpath, os.X_OK)

def get_program_path(program: ProgramType) -> Optional[str]:
    """Get the full path to a program binary"""
    BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin')
    program_map = {
        ProgramType.PROVER9: 'prover9',
        ProgramType.MACE4: 'mace4',
        ProgramType.ISOFILTER: 'isofilter',
        ProgramType.ISOFILTER2: 'isofilter2',
        ProgramType.INTERPFORMAT: 'interpformat',
        ProgramType.PROOFTRANS: 'prooftrans'
    }
    path = os.path.join(BIN_DIR, program_map[program])
    if os.path.isfile(path + '.bat'):
        return path + '.bat'
    elif os.path.isfile(path + '.sh'):
        return path + '.sh'
    elif os.path.isfile(path + '.exe'):
        return path + '.exe'
    else:
        return path

def get_process_stats(pid: int) -> Dict:
    """Get process resource usage statistics"""
    try:
        process = psutil.Process(pid)
        return {
            "cpu_percent": process.cpu_percent(interval=0.1),
            "memory_percent": process.memory_percent(),
            "memory_info": process.memory_info()._asdict(),
            "create_time": datetime.fromtimestamp(process.create_time()),
            "num_threads": process.num_threads(),
            "status": process.status()
        }
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return {}

def get_process_info(process_id: int) -> Optional[ProcessInfo]:
    """Get process information from the queue or database"""
    with process_lock:
        # try:
            # # First check the queue for running processes
            # for item in process_queue.queue():
            #     if item['process_id'] == process_id:
            #         return ProcessInfo(**item)
            
            # If not in queue, check the database
        session = Session()
        try:
            process = session.query(ProcessModel).filter_by(process_id=process_id).first()
            if process:
                return ProcessInfo(
                    pid=process.pid,
                    start_time=process.start_time,
                    state=process.state,
                    program=process.program,
                    input=process.input_text,
                    error=process.error,
                    exit_code=process.exit_code,
                    stats=process.stats,
                    resource_usage=process.resource_usage,
                    options=process.options,
                    fin_path=process.fin_path,
                    fout_path=process.fout_path,
                    ferr_path=process.ferr_path
                )
        finally:
            session.close()
        return None

def add_process_info(process_info: ProcessInfo) -> None:
    """Add process information to both queue and database"""
    with process_lock:
        # Add to database
        session = Session()
        try:
            db_process = ProcessModel(
                process_id=process_info.process_id,
                pid=process_info.pid,
                start_time=process_info.start_time,
                state=process_info.state,
                program=process_info.program,
                input_text=process_info.input,
                error=process_info.error,
                exit_code=process_info.exit_code,
                stats=process_info.stats,
                resource_usage=process_info.resource_usage,
                options=process_info.options,
                fin_path=process_info.fin_path,
                fout_path=process_info.fout_path,
                ferr_path=process_info.ferr_path
            )
            session.add(db_process)
            session.commit()
        finally:
            session.close()

        # # If process is running, add to queue
        # if process_info.state == ProcessState.RUNNING:
        #     process_queue.put(process_info.__dict__)

def remove_process_info(process_id: int) -> None:
    """Remove process information from the queue"""
    with process_lock:
        session = Session()
        try:
            process = session.query(ProcessModel).filter_by(process_id=process_id).first()
            if process:
                session.delete(process)
                session.commit()
        finally:
            session.close()
        # try:
        #     for item in process_queue.queue():
        #         if item['process_id'] == process_id:
        #             process_queue.ack(item)
        #             break
        # except Exception:
        #     pass

def update_process_info(process_id: int, **kwargs) -> None:
    """Update process information in both queue and database"""
    with process_lock:
        # Update database
        session = Session()
        try:
            process = session.query(ProcessModel).filter_by(process_id=process_id).first()
            if process:
                for key, value in kwargs.items():
                    setattr(process, key, value)
                session.commit()
        finally:
            session.close()

        # Update queue if process is running
        # try:
        #     for item in process_queue.queue():
        #         if item['process_id'] == process_id:
        #             item.update(kwargs)
        #             process_queue.put(item)
        #             break
        # except Exception:
        #     pass

def process_list() -> List[int]:
    """Get a list of all process ids"""
    with process_lock:
        session = Session()
        try:
            # Get all process IDs from database
            db_processes = session.query(ProcessModel.process_id).all()
            process_ids = [p[0] for p in db_processes]
            
            # # Add any running processes from queue that might not be in DB
            # for item in process_queue.queue():
            #     if item['process_id'] not in process_ids:
            #         process_ids.append(item['process_id'])
            
            return process_ids
        finally:
            session.close()

def run_program(program: ProgramType, input_text: Union[str,int], process_id: int, options: Optional[Dict] = None) -> None:
    """Run a program in a separate thread"""
    program_path = get_program_path(program)
    if not program_path or not binary_ok(program_path):
        update_process_info(process_id, state=ProcessState.ERROR, error=f"{program.value} binary not found or not executable")
        return

    # Create temporary files
    fin = tempfile.NamedTemporaryFile('w+b', delete=False)
    fout = tempfile.NamedTemporaryFile('w+b', delete=False)
    ferr = tempfile.NamedTemporaryFile('w+b', delete=False)

    try:
        if isinstance(input_text, int):
            # get text from process outputs
            process_info = get_process_info(input_text)
            if process_info:
                with open(process_info.fout_path, 'rb') as f:
                    input_text = f.read().decode('utf-8', errors='replace')
        # Write input to stdin
        if program in [ProgramType.ISOFILTER, ProgramType.ISOFILTER2]:
            input_text = manual_standardize_mace4_output(input_text)
        input_text = input_text.encode('utf-8')
            
        fin.write(input_text)
        fin.seek(0)

        # Build command
        command = [program_path]
        
        # Add program-specific options
        if program == ProgramType.MACE4:
            command.append("-c")
        elif program == ProgramType.ISOFILTER and options:
            if options.get("wrap"):
                command.append("wrap")
            if options.get("ignore_constants"):
                command.append("ignore_constants")
            if options.get("check"):
                command.append("check")
                command.append(options["check"])
            if options.get("output"):
                command.append("output")
                command.append(options["output"])
        elif program == ProgramType.INTERPFORMAT and options:
            if options.get("format"):
                command.append(options["format"])
        elif program == ProgramType.PROOFTRANS and options:
            if options.get("format"):
                command.append(options["format"])
            if options.get("expand"):
                command.append("expand")
            if options.get("renumber"):
                command.append("renumber")
            if options.get("striplabels"):
                command.append("striplabels")

        process = subprocess.Popen(
            command,
            stdin=fin,
            stdout=fout,
            stderr=ferr,
            bufsize=1
        )

        # Create initial process info
        process_info = ProcessInfo(
            process_id=process_id,
            pid=process.pid,
            state=ProcessState.RUNNING,
            program=program,
            input=input_text.decode('utf-8'),
            fin_path=fin.name,
            fout_path=fout.name,
            ferr_path=ferr.name,
            start_time=datetime.now(),
            resource_usage={},
            stats="",
            error="",
            exit_code=None,
            options=options
        )
        
        # Add to both queue and database
        add_process_info(process_info)

        # Monitor process
        while process.poll() is None:
            # Update resource usage
            update_process_info(process_id, resource_usage=get_process_stats(process.pid))
            
            fout.seek(0)  # rewind
            # iterate over lines
            stats = ""
            started = False
            domain_size = 0
            for line in fout:
                line = line.decode('utf-8', errors='replace')
                if program in [ProgramType.ISOFILTER, ProgramType.ISOFILTER2]:
                    if line.startswith("% isofilter"):
                        stats = line
                else:
                    if program == ProgramType.MACE4:
                        m = re.search(r'DOMAIN SIZE (\d+)', line)
                        if m:
                            domain_size = int(m.group(1))
                    if not started:
                        if "STATISTICS" in line:
                            started = True
                            stats = ""
                    else:
                        if line.startswith("==="):
                            started = False
                        else:
                            stats += line

            if domain_size > 0:
                stats = f"Domain size: {domain_size}\n{stats}"

            update_process_info(process_id, stats=stats)

            # Check if process was killed
            process_info = get_process_info(process_id)
            if process_info and process_info.state == ProcessState.KILLED:
                process.terminate()
                break

            time.sleep(0.5)

        # Process finished
        exit_code = process.poll()
        fout.seek(0)
        ferr.seek(0)
        error = ferr.read().decode('utf-8', errors='replace')

        # Update process info and remove from queue
        update_process_info(
            process_id,
            exit_code=exit_code,
            error=error,
            state=ProcessState.DONE
        )
        remove_process_info(process_id)

    except Exception as e:
        update_process_info(
            process_id,
            state=ProcessState.ERROR,
            error=str(e)
        )
        remove_process_info(process_id)
        # Cleanup files on error
        fin.close()
        fout.close()
        ferr.close()
        os.unlink(fin.name)
        os.unlink(fout.name)
        os.unlink(ferr.name)

def restore_unfinished_processes():
    """Restore any unfinished processes from the database"""
    session = Session()
    try:
        # Get all running processes from database
        running_processes = session.query(ProcessModel).filter_by(state=ProcessState.RUNNING).all()
        
        for process in running_processes:
            # Create a new thread to restart the process
            thread = threading.Thread(
                target=run_program,
                args=(
                    process.program,
                    process.input_text,
                    process.process_id,
                    process.options
                )
            )
            thread.daemon = True
            thread.start()
    finally:
        session.close()

# Initialize by restoring any unfinished processes
restore_unfinished_processes()
print("Process handler initialized")
