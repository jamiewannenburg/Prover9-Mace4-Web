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
from typing import Dict, Optional, Union
from datetime import datetime
#from persistqueue import PDict
import shelve

from p9m4_types import (
    ProgramType, ProcessInfo, ProcessState
)
from parse import manual_standardize_mace4_output
from sync_lock import SyncLock

# Global process tracking

PROCESS_QUEUE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(PROCESS_QUEUE_PATH, exist_ok=True)

# Create subdirectories for process files
INPUT_DIR = os.path.join(PROCESS_QUEUE_PATH, 'input')
OUTPUT_DIR = os.path.join(PROCESS_QUEUE_PATH, 'output')
ERROR_DIR = os.path.join(PROCESS_QUEUE_PATH, 'error')
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ERROR_DIR, exist_ok=True)

#processes: Dict[int, ProcessInfo] = PDict(PROCESS_QUEUE_PATH,'processes')
processes = shelve.open(os.path.join(PROCESS_QUEUE_PATH,'processes'),writeback=True)
#process_outputs: Dict[int, str] = {}  # Store outputs separately
#process_lock = threading.Lock()
process_lock = SyncLock(processes)


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

# def get_prover9_stats(output: str) -> Dict:
#     """Extract statistics from Prover9 output"""
#     stats = {}
#     if "Given=" in output:
#         match = re.search(r'Given=(\d+)\. Generated=(\d+)\. Kept=(\d+)\. proofs=(\d+)\.User_CPU=(\d*\.\d*),', output)
#         if match:
#             stats = {
#                 "given": int(match.group(1)),
#                 "generated": int(match.group(2)),
#                 "kept": int(match.group(3)),
#                 "proofs": int(match.group(4)),
#                 "cpu_time": float(match.group(5))
#             }
#     return stats

# def get_mace4_stats(output: str) -> Dict:
#     """Extract statistics from Mace4 output"""
#     stats = {}
#     if "Domain_size=" in output:
#         match = re.search(r'Domain_size=(\d+)\. Models=(\d+)\. User_CPU=(\d*\.\d*)\.', output)
#         if match:
#             stats = {
#                 "domain_size": int(match.group(1)),
#                 "models": int(match.group(2)),
#                 "cpu_time": float(match.group(3))
#             }
#     return stats

# def get_isofilter_stats(output: str) -> Dict:
#     """Extract statistics from Isofilter output"""
#     stats = {}
#     if "input=" in output:
#         match = re.search(r'input=(\d+), kept=(\d+)', output)
#         if match:
#             stats = {
#                 "input_models": int(match.group(1)),
#                 "kept_models": int(match.group(2)),
#                 "removed_models": int(match.group(1)) - int(match.group(2))
#             }
#     return stats

def run_program(program: ProgramType, input_text: Union[str,int], process_id: int, options: Optional[Dict] = None) -> None:
    """Run a program in a separate thread"""
    program_path = get_program_path(program)
    if not program_path or not binary_ok(program_path):
        with process_lock:
            processes[str(str(process_id))].state = ProcessState.ERROR
            processes[str(str(process_id))].error = f"{program.value} binary not found or not executable"
        return

    # Create temporary files in data directories
    fin = tempfile.NamedTemporaryFile('w+b', dir=INPUT_DIR, prefix=f"{process_id}_", suffix='.in', delete=False)
    fout = tempfile.NamedTemporaryFile('w+b', dir=OUTPUT_DIR, prefix=f"{process_id}_", suffix='.out', delete=False)
    ferr = tempfile.NamedTemporaryFile('w+b', dir=ERROR_DIR, prefix=f"{process_id}_", suffix='.err', delete=False)

    try:
        if isinstance(input_text, int):
            # get text from process outputs
            process_info = processes[str(input_text)]
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

        # Update process info
        with process_lock:
            processes[str(process_id)].pid = process.pid
            processes[str(process_id)].state = ProcessState.RUNNING
            processes[str(process_id)].fin_path = fin.name
            processes[str(process_id)].fout_path = fout.name
            processes[str(process_id)].ferr_path = ferr.name

        # Monitor process
        while process.poll() is None:
            # Update resource usage
            with process_lock:
                processes[str(process_id)].resource_usage = get_process_stats(process.pid)
            
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

                processes[str(process_id)].stats = stats
            # Check if process was killed
            if processes[str(process_id)].state == ProcessState.KILLED:
                process.terminate()
                break

            time.sleep(0.5)

        # Process finished
        exit_code = process.poll()
        fout.seek(0)
        #output = fout.read().decode('utf-8', errors='replace')
        ferr.seek(0)
        error = ferr.read().decode('utf-8', errors='replace')

        # Update process info
        with process_lock:
            processes[str(process_id)].exit_code = exit_code
            processes[str(process_id)].error = error
            processes[str(process_id)].state = ProcessState.DONE
            #process_outputs[process_id] = output  # Store output separately

    except Exception as e:
        with process_lock:
            processes[str(process_id)].state = ProcessState.ERROR
            processes[str(process_id)].error = str(e)
        # Cleanup files on error
        fin.close()
        fout.close()
        ferr.close()
        # os.unlink(fin.name)
        # os.unlink(fout.name)
        # os.unlink(ferr.name)

def rerun_processes():
    """Rerun processes that are still running after a restart"""
    for process_id, process_info in processes.items():
        if process_info.state == ProcessState.RUNNING:
            run_program(process_info.program, process_info.input, int(process_id), process_info.options)
rerun_processes()