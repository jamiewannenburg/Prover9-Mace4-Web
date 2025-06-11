from typing import Dict, List, Union, Set, Tuple, Literal, Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum
import tempfile

import sys

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

class ProgramInput(BaseModel):
    program: ProgramType
    input: Union[str, int]
    name: Optional[str] = None  # Optional name for the process
    options: Optional[Dict] = None

class ProcessInfo(BaseModel):
    pid: int
    start_time: datetime
    state: ProcessState
    program: ProgramType
    input: Union[str, int]
    name: Optional[str] = None  # Optional name for the process
    error: Optional[str] = None
    exit_code: Optional[int] = None
    stats: Optional[str] = None
    resource_usage: Optional[Dict] = None
    options: Optional[Dict] = None
    fin_path: Optional[str] = None  # Input file path
    fout_path: Optional[str] = None  # Output file path
    ferr_path: Optional[str] = None  # Error file path

class ProcessOutput(BaseModel):
    output: str
    total_lines: int
    page: int
    page_size: int
    has_more: bool

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
    default: Optional[bool] = None
    doc: Optional[str] = None
    label: Optional[str] = None

# parameter type (integer, string, boolean)
class Parameter(BaseModel):
    name: str
    value: Union[int, str, bool]
    default: Optional[Union[int, str, bool]] = None
    doc: Optional[str] = None
    label: Optional[str] = None

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

# Input output types

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

class GuiOutput(BaseModel):
    assumptions: str
    goals: str
    prover9_options: Prover9Options
    mace4_options: Mace4Options
    language_options: str
    additional_input: str
