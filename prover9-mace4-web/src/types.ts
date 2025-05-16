export enum ProcessState {
  READY = "ready",
  RUNNING = "running",
  SUSPENDED = "suspended",
  DONE = "done",
  ERROR = "error",
  KILLED = "killed"
}

export enum ProgramType {
  PROVER9 = "prover9",
  MACE4 = "mace4",
  ISOFILTER = "isofilter",
  ISOFILTER2 = "isofilter2",
  INTERPFORMAT = "interpformat",
  PROOFTRANS = "prooftrans"
}

export enum SymbolType {
  INFIX = "infix",
  INFIX_LEFT = "infix_left",
  INFIX_RIGHT = "infix_right",
  PREFIX = "prefix",
  PREFIX_PAREN = "prefix_paren",
  POSTFIX = "postfix",
  POSTFIX_PAREN = "postfix_paren",
  ORDINARY = "ordinary"
}

export interface Process {
  id: number;
  program: ProgramType;
  state: ProcessState;
  start_time: string;
  input?: string;
  output?: string;
  error?: string;
  exit_code?: number;
  stats?: {
    given?: number;
    generated?: number;
    kept?: number;
    proofs?: number;
    cpu_time?: number;
    domain_size?: number;
    models?: number;
    input_models?: number;
    kept_models?: number;
    removed_models?: number;
  };
  resource_usage?: {
    cpu_percent?: number;
    memory_percent?: number;
  };
  options?: Record<string, any>;
}

export interface Flag {
  name: string;
  value: boolean;
  doc: string;
  label: string;
}

export interface Parameter {
  name: string;
  value: number | string | boolean;
  default: number | string | boolean;
  doc: string;
  label: string;
}

export interface IntegerParameter extends Parameter {
  value: number;
  min: number;
  max: number;
  default: number;
}

export interface StringParameter extends Parameter {
  value: string;
  default: string;
  possible_values: string[];
}

export interface BooleanParameter extends Parameter {
  value: boolean;
  default: boolean;
}

export interface LanguageOption {
  precedence: number;
  type: SymbolType;
  symbols: string[];
}

export interface OrdinaryOption {
  symbols: string[];
  type: SymbolType.ORDINARY;
  doc: string;
}

export interface ParsedInput {
  assumptions: string;
  goals: string;
  global_parameters: Parameter[];
  global_flags: Flag[];
  prover9_options: Prover9Options;
  mace4_options: Mace4Options;
  language_options: string;
}

export interface Prover9Options {
  max_seconds: IntegerParameter;
  max_weight: IntegerParameter;
  pick_given_ratio: IntegerParameter;
  order: StringParameter;
  eq_defs: StringParameter;
  expand_relational_defs: Flag;
  restrict_denials: Flag;
  extra_flags: Flag[];
  extra_parameters: Parameter[];
}

export interface Mace4Options {
  start_size: IntegerParameter;
  end_size: IntegerParameter;
  increment: IntegerParameter;
  iterate: StringParameter;
  max_models: IntegerParameter;
  max_seconds: IntegerParameter;
  max_seconds_per: IntegerParameter;
  max_megs: IntegerParameter;
  print_models: Flag;
  print_models_tabular: Flag;
  integer_ring: Flag;
  order_domain: Flag;
  arithmetic: Flag;
  verbose: Flag;
  trace: Flag;
  extra_flags: Flag[];
  extra_parameters: Parameter[];
}

export interface FormulasState {
  assumptions: string;
  goals: string;
  additionalInput: string;
  languageOptions: string;
}

export interface SavedFile {
  name: string;
  path: string;
} 

export interface SampleNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: SampleNode[];
}

export interface SampleTreeProps {
  nodes: SampleNode[];
  onSelectFile: (path: string) => void;
  level?: number;
}

export interface ProgramInput {
  program: ProgramType;
  input: string;
  options?: Record<string, any>;
}

export interface ParseOutput {
  assumptions: string;
  goals: string;
  global_parameters: Parameter[];
  global_flags: Flag[];
  prover9_options: Prover9Options;
  mace4_options: Mace4Options;
  language_options: string;
}
