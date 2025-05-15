export interface Process {
  id: number;
  program: string;
  state: string;
  start_time: string;
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
}

export interface ParsedInput {
  assumptions: string;
  goals: string;
  prover9_flags: string[];
  mace4_flags: string[];
  language_options: string;
  global_flags: string[];
  global_parameters: Record<string, string>;
  prover9_parameters: Record<string, string>;
  mace4_parameters: Record<string, string>;
}

export interface Prover9Options {
  max_seconds: number;
  max_megs: number;
  max_given: number;
  max_kept: number;
  max_proofs: number;
  auto: boolean;
  auto2: boolean;
  raw: boolean;
  verbose: boolean;
  print_initial_clauses: boolean;
  print_given: boolean;
  print_kept: boolean;
  print_proofs: boolean;
  propositional: boolean;
  theorem_status: string;
  output_format: string;
}

export interface Mace4Options {
  max_seconds: number;
  max_megs: number;
  domain_size: number;
  start_size: number;
  end_size: number;
  increment: number;
  iterate: boolean;
  print_models: number;
  print_all_models: boolean;
  all_models: boolean;
  trace_assign: boolean;
  trace_choices: boolean;
  trace_models: boolean;
  verbose: boolean;
  output_format: string;
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
