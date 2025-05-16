#!/usr/bin/env python3
"""
Prover9-Mace4 API Server
A FastAPI-based REST API for Prover9 and Mace4
"""

import argparse
import os
import re
import sys
import time
import signal
import tempfile
import subprocess
import threading
import psutil
from typing import Dict, List, Union, Set, Tuple, Literal
from typing import Optional as OptionalType
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum

from pyparsing import (
    Word, alphas, alphanums, Literal, Group, Optional, 
    OneOrMore, ZeroOrMore, ParseException, restOfLine,
    QuotedString, delimitedList, ParseResults, Regex, Keyword, OneOrMore, printables
)

# Constants
BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin')

# Process tracking
class ProcessState(Enum):
    READY = "ready"
    RUNNING = "running"
    SUSPENDED = "suspended"
    DONE = "done"
    ERROR = "error"
    KILLED = "killed"

class ProgramType(Enum):
    PROVER9 = "prover9"
    MACE4 = "mace4"
    ISOFILTER = "isofilter"
    ISOFILTER2 = "isofilter2"
    INTERPFORMAT = "interpformat"
    PROOFTRANS = "prooftrans"

class ProcessInfo(BaseModel):
    pid: int
    start_time: datetime
    state: ProcessState
    program: ProgramType
    input: str
    output: OptionalType[str] = None
    error: OptionalType[str] = None
    exit_code: OptionalType[int] = None
    stats: OptionalType[Dict] = None
    resource_usage: OptionalType[Dict] = None
    options: OptionalType[Dict] = None

# infix	a*(b*c)	*(a,*(b,c))	like Prolog's xfx
# infix_left	a*b*c	*(*(a,b),c)	like Prolog's yfx
# infix_right	a*b*c	*(a,*(b,c))	like Prolog's xfy
# prefix	--p	-(-(p))	like Prolog's fy
# prefix_paren	-(-p)	-(-(p))	like Prolog's fx
# postfix	a''	'('(a))	like Prolog's yf
# postfix_paren	(a')'	'('(a))	like Prolog's xf
# ordinary	*(a,b)	*(a,b)	takes away parsing properties
# symbol type type
class SymbolType(Enum):
    INFIX = "infix"
    INFIX_LEFT = "infix_left"
    INFIX_RIGHT = "infix_right"
    PREFIX = "prefix"
    PREFIX_PAREN = "prefix_paren"
    POSTFIX = "postfix"
    POSTFIX_PAREN = "postfix_paren"
    ORDINARY = "ordinary"

# language option type op( precedence, type, symbols(s) ).
class LanguageOption(BaseModel):
    precedence: int
    type: SymbolType
    symbols: List[str]

# ordinary option type op(symbols(s)), type is SymbolType.ORDINARY
class OrdinaryOption(BaseModel):
    symbols: List[str]
    type: SymbolType = SymbolType.ORDINARY
    doc: str = "Set prefined symbols to ordinary symbols"

# flag type (boolean)
class Flag(BaseModel):
    name: str
    value: bool
    doc: OptionalType[str] = None
    label: OptionalType[str] = None

# parameter type (integer, string, boolean)
class Parameter(BaseModel):
    name: str
    value: Union[int, str, bool]
    default: Union[int, str, bool]
    doc: OptionalType[str] = None
    label: OptionalType[str] = None

# value should be between min and max
class IntegerParameter(Parameter):
    value: int
    min: int
    max: int
    default: int

    @model_validator(mode='after')
    def validate_range(self):
        if self.value < self.min:
            raise ValueError(f'value ({self.value}) must be >= min ({self.min})')
        if self.value > self.max:
            raise ValueError(f'value ({self.value}) must be <= max ({self.max})')
        return self

class StringParameter(Parameter):
    value: str
    default: str
    possible_values: List[str]
    doc: str

    @model_validator(mode='after')
    def validate_possible_values(self):
        if self.value not in self.possible_values:
            raise ValueError(f'value ({self.value}) must be in {self.possible_values}')
        return self

class BooleanParameter(Parameter):
    value: bool
    default: bool
    doc: str

# Type for Mace4 options
# assign(start_size, n).  % default n=2, range [2 .. INT_MAX]  % command-line -n n
# assign(end_size, n).  % default n=-1, range [-1 .. INT_MAX]  % command-line -N n
# assign(increment, n).  % default n=1, range [1 .. INT_MAX]  % command-line -i n
# assign(iterate, string).  % default string=all, range [all,evens,odds,primes,nonprimes]
# assign(max_models, n).  % default n=1, range [-1 .. INT_MAX]  % command-line -m n
# assign(max_seconds, n).  % default n=-1, range [-1 .. INT_MAX]  % command-line -t n
# assign(max_seconds_per, n).  % default n=-1, range [-1 .. INT_MAX]  % command-line -s n
# assign(max_megs, n).  % default n=200, range [-1 .. INT_MAX]  % command-line -b n
# set(print_models).      % default set    % command-line -P 1
# clear(print_models).                     % command-line -P 0
# set(integer_ring).                       % command-line -R 1
# clear(integer_ring).    % default clear  % command-line -R 0
# set(order_domain).
# clear(order_domain).        % default clear
# set(arithmetic).
# clear(arithmetic).        % default clear
# set(verbose).                       % command-line -v 1
# clear(verbose).    % default clear  % command-line -v 0
# set(trace).                       % command-line -T 1
# clear(trace).    % default clear  % command-line -T 0
class Mace4Options(BaseModel):
    start_size: IntegerParameter = Field(
        default=IntegerParameter(name="start_size", 
                                 value=2, 
                                 min=2, 
                                 max=sys.maxsize, 
                                 default=2,
                                 doc="Initial domain size to search for structures. Default is 2, with range [2 .. INT_MAX]. Command-line -n",
                                 label="Start Size"))
    end_size: IntegerParameter = Field(default=IntegerParameter(name="end_size", 
                                                                value=-1, 
                                                                min=-1, 
                                                                max=sys.maxsize, 
                                                                default=-1,
                                                                doc="Maximum domain size to search. Default is -1 (no limit), with range [-1 .. INT_MAX]. Command-line -N",
                                                                label="End Size"))
    increment: IntegerParameter = Field(default=IntegerParameter(name="increment", 
                                                                value=1, 
                                                                min=1, 
                                                                max=sys.maxsize, 
                                                                default=1,
                                                                doc="Increment by which domain size increases if a model is not found. Default is 1, with range [1 .. INT_MAX]. Command-line -i",
                                                                label="Increment"))
    iterate: StringParameter = Field(default=StringParameter(name="iterate", 
                                                            value="all", 
                                                            possible_values=["all", "evens", "odds", "primes", "nonprimes"], 
                                                            default="all",
                                                            doc="Add additional constraint to domain sizes. Can be used with increment. Options: all, evens, odds, primes, nonprimes",
                                                            label="Iterate"))
    max_models: IntegerParameter = Field(default=IntegerParameter(name="max_models", 
                                                                value=1, 
                                                                min=-1, 
                                                                max=sys.maxsize, 
                                                                default=1,
                                                                doc="Stop searching when this many structures have been found. Default is 1, -1 means no limit. Command-line -m",
                                                                label="Max Models"))
    max_seconds: IntegerParameter = Field(default=IntegerParameter(name="max_seconds", 
                                                                value=-1, 
                                                                min=-1, 
                                                                max=sys.maxsize, 
                                                                default=-1,
                                                                doc="Stop searching after this many seconds. Default is -1 (no limit). Command-line -t",
                                                                label="Max Seconds"))
    max_seconds_per: IntegerParameter = Field(default=IntegerParameter(name="max_seconds_per", 
                                                                      value=-1, 
                                                                      min=-1, 
                                                                      max=sys.maxsize, 
                                                                      default=-1,
                                                                      doc="Maximum seconds allowed for each domain size. Default is -1 (no limit). Command-line -s",
                                                                      label="Max Seconds Per Iteration"))
    max_megs: IntegerParameter = Field(default=IntegerParameter(name="max_megs", 
                                                                value=200, 
                                                                min=-1, 
                                                                max=sys.maxsize, 
                                                                default=200,
                                                                doc="Stop searching when about this many megabytes of memory have been used. Default is 200, -1 means no limit. Command-line -b",
                                                                label="Max Megs"))
    print_models: Flag = Field(default=Flag(name="print_models", value=True,
                                            doc="If set, structures found are printed in 'standard' form suitable as input to other LADR programs. Default is set. Command-line -P",
                                            label="Print Models"))
    print_models_tabular: Flag = Field(default=Flag(name="print_models_tabular", value=False,
                                                    doc="If set, structures found are printed in tabular form. If both print_models and print_models_tabular are set, the last one in input takes effect. Default is clear. Command-line -p",
                                                    label="Print Models Tabular"))
    integer_ring: Flag = Field(default=Flag(name="integer_ring", value=False,
                                            doc="If set, a ring structure is applied to search. Operations {+,-,*} are assumed to be ring of integers (mod domain_size). Default is clear. Command-line -R",
                                            label="Integer Ring"))
    order_domain: Flag = Field(default=Flag(name="order_domain", value=False,
                                            doc="If set, the relations < and <= are fixed as order relations on the domain in the obvious way. Default is clear. Command-line -O",
                                            label="Order Domain"))
    arithmetic: Flag = Field(default=Flag(name="arithmetic", value=False,
                                            doc="If set, several function and relation symbols are interpreted as operations and relations on integers. Default is clear. Command-line -A",
                                            label="Arithmetic"))
    verbose: Flag = Field(default=Flag(name="verbose", value=False,
                                        doc="If set, output includes info about the search, including initial partial model and timing statistics for each domain size. Default is clear. Command-line -v",
                                        label="Verbose"))
    trace: Flag = Field(default=Flag(name="trace", value=False,
                                    doc="If set, detailed information about the search, including trace of all assignments and backtracking, is printed. Use only on small searches as it produces a lot of output. Default is clear. Command-line -T",
                                    label="Trace"))
    extra_flags: List[Flag] = Field(default=[])
    extra_parameters: List[Parameter] = Field(default=[])

# assign(max_seconds, n).  % default n=-1, range [-1 .. INT_MAX]  % command-line -t n
# assign(max_weight, n).  % default n=100, range [INT_MIN .. INT_MAX]
# assign(pick_given_ratio, n).  % default n=0, range [0 .. INT_MAX]
# assign(order, string).  % default string=lpo, range [lpo,rpo,kbo]
# assign(eq_defs, string).  % default string=unfold, range [unfold,fold,pass]

# PROVER9_FLAGS = [
# set(expand_relational_defs).
# clear(expand_relational_defs).    % default clear
# set(restrict_denials).
# clear(restrict_denials).    % default clear
# ]
class Prover9Options(BaseModel):
    max_seconds: IntegerParameter = Field(default=IntegerParameter(name="max_seconds", 
                                                                  value=-1, 
                                                                  min=-1, 
                                                                  max=sys.maxsize, 
                                                                  default=-1,
                                                                  doc="Stop searching after this many seconds. Default is -1 (no limit). Command-line -t",
                                                                  label="Max Seconds"))
    max_weight: IntegerParameter = Field(default=IntegerParameter(name="max_weight", 
                                                                  value=100, 
                                                                  min=-sys.maxsize, 
                                                                  max=sys.maxsize, 
                                                                  default=100,
                                                                  doc="Derived clauses with weight greater then n will be discarded. For this parameter, -1 does not mean infinity, because -1 is a reasonable value (clauses can have negative weights). This parameter is never applied to initial clauses, and it is not applied to clauses that match hints unless the flag limit_hint_matchers is set.",
                                                                  label="Max Weight"))
    pick_given_ratio: IntegerParameter = Field(default=IntegerParameter(name="pick_given_ratio", 
                                                                       value=0,
                                                                       min=0,
                                                                       max=sys.maxsize,
                                                                       default=0,
                                                                       doc="""If n>0, the given clauses are chosen in the ratio one part by age, and n parts by weight. The false/true distinction is ignored. This parameter works by making the following changes. (Note that this parameter does not alter hints_part, so that clauses matching hints may still be selected.)
  assign(pick_given_ratio, n) -> assign(age_part, 1).
  assign(pick_given_ratio, n) -> assign(weight_part, n).
  assign(pick_given_ratio, n) -> assign(false_part, 0).
  assign(pick_given_ratio, n) -> assign(true_part, 0).
  assign(pick_given_ratio, n) -> assign(random_part, 0).""",
                                                                       label="Pick Given Ratio"))
    order: StringParameter = Field(default=StringParameter(name="order", 
                                                          value="lpo", 
                                                          possible_values=["lpo", "rpo", "kbo"], 
                                                          default="lpo",
                                                          doc="This option is used to select the primary term ordering to be used for orienting equalities and for determining maximal literals in clauses. The choices are lpo (Lexicographic Path Ordering), rpo (Recursive Path Ordering), and kbo (Knuth-Bendix Ordering).",
                                                          label="Order"))
    eq_defs: StringParameter = Field(default=StringParameter(name="eq_defs", 
                                                          value="unfold", 
                                                          possible_values=["unfold", "fold", "pass"], 
                                                          default="unfold",
                                                          doc="""If string=unfold, and if the input contains an equational definition, say j(x,y) = f(f(x,x),f(y,y)), the defined symbol j will be eliminated from the problem before the search starts. This procedure works by adjusting the symbol precedence so that the defining equation becomes a demodulator. If there is more than one equational definition, cycles are avoided by choosing a cycle-free subset of the definitions. If the primary term ordering is KBO, this option may admit demodulators that do not satisfy the KBO ordering, because a variable may have more variables on the right-hand side. However, this exception is safe (does not cause non-termination).
If string=fold, and if the input contains an equational definition, say j(x,y) = f(f(x,x),f(y,y)), the term ordering will be adjusted so that equation is flipped and becomes a demodulator which introduces the defined symbol whenever possible during the search.

If string=pass, nothing special happens. In this case, functions may still be unfolded or folded if the term ordering and symbol precedence happen to arrange the demodulators to do so.""",
                                                          label="Equational Definitions"))
    expand_relational_defs: Flag = Field(default=Flag(name="expand_relational_defs", value=False,
                                                      doc="If this flag is set, Prover9 looks for relational definitions in the assumptions and uses them to rewrite all occurrences of the defined relations elsewhere in the input, before the start of the search. The expansion steps are detailed in the output file and appear in proofs with the justification expand_def. Relational definitions must be closed formulas for example.",
                                                      label="Expand Relational Definitions"))
    restrict_denials: Flag = Field(default=Flag(name="restrict_denials", value=False,
                                                doc="""If the flag is set, negative clauses (clauses in which all literals are negative) are referred to as restricted denials and are given special treatment.

The inference rules (i.e., paramodulation and the resolution rules) will not be applied to restricted denials. However, restricted denials will be simplified by back demodulation and back unit deletion.

In addition, restricted denials will not be deleted if they are over the weight limit (max_weight).

The effect of setting restrict_denials is that proofs will usually be more forward or direct. This option can speed up proofs, it can delay proofs, and it can block all proofs.""",
                                                label="Restrict Denials"))
    extra_flags: List[Flag] = Field(default=[])
    extra_parameters: List[Parameter] = Field(default=[])

# Global process tracking
processes: Dict[int, ProcessInfo] = {}
process_lock = threading.Lock()

# Program exit codes
PROGRAM_EXITS = {
    ProgramType.PROVER9: {
        0: 'Proof',
        1: 'Fatal Error',
        2: 'Exhausted',
        3: 'Memory Limit',
        4: 'Time Limit',
        5: 'Given Limit',
        6: 'Kept Limit',
        7: 'Action Exit',
        101: 'Interrupted',
        102: 'Crashed',
        -9: 'Killed', # Linux, Mac
        -1: 'Killed' # Win32
    },
    ProgramType.MACE4: {
        0: 'Model Found',
        1: 'Fatal Error',
        2: 'Domain Too Small',
        3: 'Memory Limit',
        4: 'Time Limit',
        5: 'Max Models',
        6: 'Domain Size Limit',
        7: 'Action Exit',
        101: 'Interrupted',
        102: 'Crashed',
        -9: 'Killed', # Linux, Mac
        -1: 'Killed' # Win32
    },
    ProgramType.ISOFILTER: {
        0: 'Success',
        1: 'Error',
        2: 'No Models'
    },
    ProgramType.ISOFILTER2: {
        0: 'Success',
        1: 'Error',
        2: 'No Models'
    },
    ProgramType.INTERPFORMAT: {
        0: 'Success',
        1: 'Error',
        2: 'Invalid Format'
    },
    ProgramType.PROOFTRANS: {
        0: 'Success',
        1: 'Error',
        2: 'Invalid Format'
    }
}


# Define basic tokens
period = Literal(".")
identifier = Word(alphanums+"_")
quoted_string = QuotedString('"', escChar='\\')

# Define comment
comment = Group(Literal("%") + restOfLine)

# Define option patterns
set_option = Group(Literal("set")+ Literal("(").suppress() + (identifier | quoted_string) + Literal(")").suppress() + period)+Optional(comment)
clear_option = Group(Literal("clear")+ Literal("(").suppress() + (identifier | quoted_string) + Literal(")").suppress() + period)+Optional(comment)
assign_option = Group(Literal("assign")+ Literal("(").suppress() + (identifier | quoted_string) + Literal(",").suppress() + (Word(alphanums+"_"+'-') | quoted_string) + Literal(")").suppress() + period)+Optional(comment)
language_option = Group(Literal("op")+ Literal("(").suppress() + (identifier | quoted_string) + ZeroOrMore(Literal(",").suppress() + (Word(alphanums+"_"+'-') | quoted_string)) + Literal(")").suppress() + period)+Optional(comment)

# Define section markers
formulas_assumptions = Group(Literal("formulas(assumptions)") + period)+Optional(comment)
formulas_goals = Group(Literal("formulas(goals)") + period)+Optional(comment)
end_of_list = Group(Literal("end_of_list") + period)+Optional(comment)

# Define program blocks
if_prover9 = Group(Literal("if(Prover9)") + period)+Optional(comment)
if_mace4 = Group(Literal("if(Mace4)") + period)+Optional(comment)
end_if = Group(Literal("end_if") + period)+Optional(comment)

# Define formula (anything ending with period, excluding comments and special markers)
formula =  Group(~(end_of_list)+Word(printables)+restOfLine) #| if_prover9 | if_mace4 | end_if formulas_assumptions | formulas_goals |

# Define sections
assumptions_section = formulas_assumptions + ZeroOrMore(formula, stop_on=end_of_list) + end_of_list
goals_section = formulas_goals + ZeroOrMore(formula, stop_on=end_of_list) + end_of_list

# Define program blocks
prover9_block = if_prover9 + ZeroOrMore(comment | set_option | assign_option | clear_option) + end_if
mace4_block = if_mace4 + ZeroOrMore(comment | set_option | assign_option | clear_option) + end_if

# Define global options
#global_flags = ZeroOrMore(set_option | assign_option | clear_option)

# Define the complete grammar 
#grammar = Optional(ZeroOrMore(comment)) + Optional(global_flags) + Optional(ZeroOrMore(comment)) + Optional(ZeroOrMore(language_option)) + Optional(ZeroOrMore(comment)) + Optional(prover9_block) + Optional(ZeroOrMore(comment)) + Optional(mace4_block) + Optional(ZeroOrMore(comment)) + Optional(assumptions_section) + Optional(ZeroOrMore(comment)) + Optional(goals_section)
grammar = ZeroOrMore( comment | prover9_block | mace4_block | assumptions_section | goals_section | set_option | assign_option | clear_option | language_option)

# Utility functions

def binary_ok(fullpath: str) -> bool:
    """Check if binary exists and is executable"""
    return os.path.isfile(fullpath) and os.access(fullpath, os.X_OK)

def get_program_path(program: ProgramType) -> OptionalType[str]:
    """Get the full path to a program binary"""
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
            "cpu_percent": process.cpu_percent(),
            "memory_percent": process.memory_percent(),
            "memory_info": process.memory_info()._asdict(),
            "create_time": datetime.fromtimestamp(process.create_time()),
            "num_threads": process.num_threads(),
            "status": process.status()
        }
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return {}

def get_prover9_stats(output: str) -> Dict:
    """Extract statistics from Prover9 output"""
    stats = {}
    if "Given=" in output:
        match = re.search(r'Given=(\d+)\. Generated=(\d+)\. Kept=(\d+)\. proofs=(\d+)\.User_CPU=(\d*\.\d*),', output)
        if match:
            stats = {
                "given": int(match.group(1)),
                "generated": int(match.group(2)),
                "kept": int(match.group(3)),
                "proofs": int(match.group(4)),
                "cpu_time": float(match.group(5))
            }
    return stats

def get_mace4_stats(output: str) -> Dict:
    """Extract statistics from Mace4 output"""
    stats = {}
    if "Domain_size=" in output:
        match = re.search(r'Domain_size=(\d+)\. Models=(\d+)\. User_CPU=(\d*\.\d*)\.', output)
        if match:
            stats = {
                "domain_size": int(match.group(1)),
                "models": int(match.group(2)),
                "cpu_time": float(match.group(3))
            }
    return stats

def get_isofilter_stats(output: str) -> Dict:
    """Extract statistics from Isofilter output"""
    stats = {}
    if "input=" in output:
        match = re.search(r'input=(\d+), kept=(\d+)', output)
        if match:
            stats = {
                "input_models": int(match.group(1)),
                "kept_models": int(match.group(2)),
                "removed_models": int(match.group(1)) - int(match.group(2))
            }
    return stats

def run_program(program: ProgramType, input_text: str, process_id: int, options: OptionalType[Dict] = None) -> None:
    """Run a program in a separate thread"""
    program_path = get_program_path(program)
    if not program_path or not binary_ok(program_path):
        with process_lock:
            processes[process_id].state = ProcessState.ERROR
            processes[process_id].error = f"{program.value} binary not found or not executable"
        return

    # Create temporary files
    fin = tempfile.TemporaryFile('w+b')
    fout = tempfile.TemporaryFile('w+b')
    ferr = tempfile.TemporaryFile('w+b')

    try:
        # Write input to stdin
        if isinstance(input_text, str):
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
            stderr=ferr
        )

        # Update process info
        with process_lock:
            processes[process_id].pid = process.pid
            processes[process_id].state = ProcessState.RUNNING

        # Monitor process
        while process.poll() is None:
            # Update resource usage
            with process_lock:
                processes[process_id].resource_usage = get_process_stats(process.pid)
            
            # Check if process was killed
            if processes[process_id].state == ProcessState.KILLED:
                process.terminate()
                break

            time.sleep(0.5)

        # Process finished
        exit_code = process.poll()
        fout.seek(0)
        output = fout.read().decode('utf-8', errors='replace')
        ferr.seek(0)
        error = ferr.read().decode('utf-8', errors='replace')

        # Update process info
        with process_lock:
            processes[process_id].exit_code = exit_code
            processes[process_id].output = output
            processes[process_id].error = error
            processes[process_id].state = ProcessState.DONE
            
            # Update statistics
            if program == ProgramType.PROVER9:
                processes[process_id].stats = get_prover9_stats(output)
            elif program == ProgramType.MACE4:
                processes[process_id].stats = get_mace4_stats(output)
            elif program in [ProgramType.ISOFILTER, ProgramType.ISOFILTER2]:
                processes[process_id].stats = get_isofilter_stats(output)

    finally:
        # Cleanup
        fin.close()
        fout.close()
        ferr.close()

# FastAPI app
app = FastAPI(title="Prover9-Mace4 API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class ProgramInput(BaseModel):
    program: ProgramType
    input: str
    options: OptionalType[Dict] = None

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
        options=input.options
    )

    # Add to tracking
    with process_lock:
        processes[process_id] = process_info

    # Start process in background
    background_tasks.add_task(run_program, input.program, input.input, process_id, input.options)

    return {"process_id": process_id}

@app.get("/status/{process_id}")
async def get_status(process_id: int) -> ProcessInfo:
    """Get the status of a process"""
    with process_lock:
        if process_id not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        return processes[process_id]

@app.get("/processes")
async def list_processes() -> List[int]:
    """List all tracked processes"""
    with process_lock:
        return list(processes.keys())

@app.post("/kill/{process_id}")
async def kill_process(process_id: int) -> Dict:
    """Kill a running process"""
    with process_lock:
        if process_id not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[process_id]
        if process_info.state not in [ProcessState.RUNNING, ProcessState.SUSPENDED]:
            raise HTTPException(status_code=400, detail="Process is not running or suspended")
        
        os.kill(process_info.pid, signal.SIGKILL)
        process_info.state = ProcessState.KILLED
        return {"status": "success", "message": f"Process {process_id} killed"}

@app.delete("/process/{process_id}")
async def remove_process(process_id: int) -> Dict:
    """Remove a completed process from the list"""
    with process_lock:
        if process_id not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[process_id]
        if process_info.state not in [ProcessState.DONE, ProcessState.ERROR, ProcessState.KILLED]:
            raise HTTPException(status_code=400, detail="Can only remove completed, errored, or killed processes")
        
        del processes[process_id]
        return {"status": "success", "message": f"Process {process_id} removed"}

@app.post("/pause/{process_id}")
async def pause_process(process_id: int) -> Dict:
    """Pause a running process"""
    with process_lock:
        if process_id not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[process_id]
        if process_info.state != ProcessState.RUNNING:
            raise HTTPException(status_code=400, detail="Process is not running")
        # windows cannot pause a process
        if os.name == 'nt':
            raise HTTPException(status_code=400, detail="Windows cannot pause a process")
        # Update state and send signal
        process_info.state = ProcessState.SUSPENDED
        os.kill(process_info.pid, signal.SIGSTOP)
        return {"status": "success", "message": "Process paused"}

@app.post("/resume/{process_id}")
async def resume_process(process_id: int) -> Dict:
    """Resume a paused process"""
    with process_lock:
        if process_id not in processes:
            raise HTTPException(status_code=404, detail="Process not found")
        
        process_info = processes[process_id]
        if process_info.state != ProcessState.SUSPENDED:
            raise HTTPException(status_code=400, detail="Process is not paused")
        # windows cannot resume a process
        if os.name == 'nt':
            raise HTTPException(status_code=400, detail="Windows cannot resume a process")
        # Update state and send signal
        process_info.state = ProcessState.RUNNING
        os.kill(process_info.pid, signal.SIGCONT)
        return {"status": "success", "message": "Process resumed"}


class ParseInput(BaseModel):
    input: str

class ParseOutput(BaseModel):
    assumptions: str
    goals: str
    global_parameters: List[Parameter]
    global_flags: List[Flag]
    prover9_options: Prover9Options
    mace4_options: Mace4Options
    language_options: str


@app.post("/parse")
def parse(input: ParseInput) -> ParseOutput:
    """Parse the input to extract assumptions, goals, and options using pyparsing"""
    content = input.input
    # Parse the content
    try:
        result = grammar.parseString(content)
    except ParseException as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}")
    
    # Initialize result containers
    parsed = ParseOutput(
        assumptions='',
        goals='',
        global_parameters=[],
        global_flags=[],
        prover9_options=Prover9Options(),
        mace4_options=Mace4Options(),
        language_options=''
    )
    
    # Process the parsed results
    current_section = None
    current_program = None
    
    for item in result:
        if item[0] == "formulas(assumptions)":
            current_section = "assumptions"
        elif item[0] == "formulas(goals)":
            current_section = "goals"
        elif item[0] == "end_of_list":
            current_section = None
        elif item[0] == "if(Prover9)":
            current_program = "prover9"
        elif item[0] == "if(Mace4)":
            current_program = "mace4"
        elif item[0] == "end_if":
            current_program = None
        elif item[0] == "set":
            option = item[1]
            if current_program == "prover9":
                flag = getattr(parsed.prover9_options, option)
                if flag:
                    flag.value = True
                else:
                    parsed.prover9_options.extra_flags.append(Flag(name=option, value=True))
            elif current_program == "mace4":
                flag = getattr(parsed.mace4_options, option)
                if flag:
                    flag.value = True
                else:
                    parsed.mace4_options.extra_flags.append(Flag(name=option, value=True))
            else:
                parsed.global_flags.append(Flag(name=option, value=True))
        elif item[0] == "clear":
            option = item[1]
            if current_program == "prover9":
                flag = getattr(parsed.prover9_options, option)
                if flag:
                    flag.value = False
                else:
                    parsed.prover9_options.extra_flags.append(Flag(name=option, value=False))
            elif current_program == "mace4":
                flag = getattr(parsed.mace4_options, option)
                if flag:
                    flag.value = False
                else:
                    parsed.mace4_options.extra_flags.append(Flag(name=option, value=False))
            else:
                parsed.global_flags.append(Flag(name=option, value=False))
        elif item[0] == "assign":
            option_name = item[1]
            option_value = item[2]
            if current_program == "prover9":
                parameter = getattr(parsed.prover9_options, option_name)
                if parameter:
                    parameter.value = option_value
                else:
                    parsed.prover9_options.extra_parameters.append(Parameter(name=option_name, value=option_value))
            elif current_program == "mace4":
                parameter = getattr(parsed.mace4_options, option_name)
                if parameter:
                    parameter.value = option_value
                else:
                    parsed.mace4_options.extra_parameters.append(Parameter(name=option_name, value=option_value))
            else:
                parsed.global_parameters.append(Parameter(name=option_name, value=option_value))
        elif item[0] == "op":
            parsed.language_options+='op('+', '.join(item[1:-1])+').\n'
        elif current_section == "assumptions":
            # concatenate the item list to a string
            parsed.assumptions += ''.join(item)+'\n'
        elif current_section == "goals":
            parsed.goals += ''.join(item)+'\n'
    return parsed

@app.post("/generate_input")
def generate_input(input: ParseOutput) -> str:
    """Generate input for Prover9/Mace4"""
    print(input)
    assumptions = input.assumptions
    goals = input.goals
    print(input)
    print(input.additional_input)
    parsed = parse(ParseInput(input=input.additional_input))

    # Start with optional settings
    content = "% Saved by Prover9-Mace4 Web GUI\n\n"
    #content += "set(ignore_option_dependencies). % GUI handles dependencies\n\n" #TODO: I'm not handling dependencies
    
    # Add language options
    # if "prolog_style_variables" in input.language_flags: #TODO: I'm not handling language flags
    #     content += "set(prolog_style_variables).\n"
    content += input.language_options
    content += parsed.language_options

    # Add Prover9 options
    content += "if(Prover9). % Options for Prover9\n"
    # loop through Prover9Options
    for name in Prover9Options.model_fields:
        input_field = getattr(input.prover9_options, name)
        additional_field = getattr(parsed.prover9_options, name)
        if isinstance(input_field, Parameter):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                content += f"  assign({name}, {additional_field.value}).\n"
            elif input_field.value != input_field.default:
                content += f"  assign({name}, {input_field.value}).\n"
        elif isinstance(input_field, Flag):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                if additional_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
            elif input_field.value != input_field.default:
                if input_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
    for parameter in input.prover9_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in input.prover9_options.extra_flags:
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    for parameter in parsed.prover9_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in parsed.prover9_options.extra_flags: #TODO: This might produce duplicates
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    content += "end_if.\n\n"
    
    # Add Mace4 options
    content += "if(Mace4). % Options for Mace4\n"
    # loop through Mace4Options
    for name in Mace4Options.model_fields:
        input_field = getattr(input.mace4_options, name)
        additional_field = getattr(parsed.mace4_options, name)
        if isinstance(input_field, Parameter):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                content += f"  assign({name}, {additional_field.value}).\n"
            elif input_field.value != input_field.default:
                content += f"  assign({name}, {input_field.value}).\n"
        elif isinstance(input_field, Flag):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                if additional_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
            elif input_field.value != input_field.default:
                if input_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
    for parameter in input.mace4_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in input.mace4_options.extra_flags:
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    for parameter in parsed.mace4_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in parsed.mace4_options.extra_flags: #TODO: This might produce duplicates
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    content += "end_if.\n\n"
    
    # Add global options and flags
    for option in [input,parsed]:
        for param in option.global_parameters:
            content += f"assign({param.name}, {param.value}).\n"
        for flag in option.global_flags:
            if flag.value:
                content += f"set({flag.name}).\n"
            else:
                content += f"clear({flag.name}).\n"
    # add assumptions and goals
    content += "formulas(assumptions).\n"
    content += assumptions + "\n"
    content += "end_of_list.\n\n"
    content += "formulas(goals).\n"
    content += goals + "\n"
    content += "end_of_list.\n\n"
    return content


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
    parser.add_argument("--reload", action="store_false")
    parser.add_argument("--debug", action="store_false")
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