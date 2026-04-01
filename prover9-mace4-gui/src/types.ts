export enum ProgramType {
  PROVER9 = "prover9",
  MACE4 = "mace4",
  ISOFILTER = "isofilter",
  INTERPFORMAT = "interpformat",
  PROOFTRANS = "prooftrans"
}

export interface InterpFormat {
  label: string;
  value: string;
  doc: string;
}

export const INTERP_FORMATS: InterpFormat[] = [
  { 
    label: 'Standard', 
    value: 'standard',
    doc: 'This transformation simply extracts the structure from the file and reprints it in the same (standard) format, with one line for each operation. The result should be acceptable to any of the LADR programs that take standard structures.'
  },
  { 
    label: 'Standard2', 
    value: 'standard2',
    doc: 'This is similar to standard, except that the binary operations are split across multiple lines to make them more human-readable. The result should be acceptable to any of the LADR programs that take standard structures.'
  },
  { 
    label: 'Portable', 
    value: 'portable',
    doc: 'This form is list of ... of lists of strings and natural numbers. It can be parsed by several scripting systems such as GAP, Python, and Javascript.'
  },
  { 
    label: 'Tabular', 
    value: 'tabular',
    doc: 'This form is designed to be easily readable by humans. It is not meant for input to other programs.'
  },
  { 
    label: 'Raw', 
    value: 'raw',
    doc: 'This form is a sequence of natural numbers.'
  },
  { 
    label: 'Cooked', 
    value: 'cooked',
    doc: 'This form is a sequence of ground terms.'
  },
  { 
    label: 'XML', 
    value: 'xml',
    doc: 'This is an XML form. It includes a DTD for LADR interpretations and an XML stylesheet for transforming the XML to HTML.'
  },
  { 
    label: 'TeX', 
    value: 'tex',
    doc: 'This generates LaTeX source for the interpretation.'
  }
]


export interface ProoftransOption {
  format: string;
  label: string;
  doc: string;
  parents_only?: boolean;
  expand?: boolean;
  renumber?: boolean;
  striplabels?: boolean;
  //label_option?: string;
}

export const PROOFTRANS_OPTIONS: ProoftransOption[] = [
  {
    format: "",
    label: "Default",
    doc: "If no additional argument is given, Prooftrans simply extracts the proof from the Prover9 output file.",
    parents_only: false,
    expand: false,
    renumber: false,
    striplabels: false,
  },
  {
    format: "xml",
    label: "XML",
    doc: "Tell Prooftrans to produce proofs in XML. ",
    expand: false,
    renumber: false,
  },
  {
    format: "ivy",
    label: "Ivy",
    doc: "Tell Prooftrans to produce proofs in Ivy format tell Prooftrans to produce very detailed proofs that can be checked with the Ivy proof checker.",
    renumber: false,
  },
  {
    format: "hints",
    label: "Hints",
    doc: "The option hints tells Prooftrans to take all of the proofs in the file and produce one list of hints that can be given to Prover9 to guide subsequent searches on related conjectures.",
    expand: false,
    striplabels: false,
    //label_option: "hints",
  }
];

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

/** API v2: persisted vs stream delivery (matches `DeliveryMode` in p9m4_types.py). */
export type DeliveryMode = "persisted" | "stream";

/** Tagged input kinds for `ProgramRunRequestV2` (matches `InputKind` in p9m4_types.py). */
export type InputKind = "text" | "file" | "process_output";

export interface TextInputSource {
  kind: "text";
  text: string;
}

export interface FileInputSource {
  kind: "file";
  file_ref: string;
}

export interface ProcessOutputInputSource {
  kind: "process_output";
  run_id: string;
  artifact: string;
}

/** Discriminated union for `ProgramRunRequestV2.input`. */
export type ProgramInputSource =
  | TextInputSource
  | FileInputSource
  | ProcessOutputInputSource;

/** Request body for POST `/prover9`, `/mace4`, `/prooftrans`, etc. */
export interface ProgramRunRequestV2 {
  input: ProgramInputSource;
  name?: string;
  options?: Record<string, string | number | boolean>;
  delivery_mode?: DeliveryMode;
}

/** Response when a run is accepted (matches `RunAccepted` in p9m4_types.py). */
export interface RunAccepted {
  run_id: string;
  program: ProgramType;
  delivery_mode: DeliveryMode;
  lifecycle: string;
  created_at: string;
  stream_url?: string | null;
}

/** Persisted run row from `GET /runs` / `GET /runs/{id}/status` (matches `RunSummary`). */
export interface RunSummary {
  run_id: string;
  name?: string | null;
  program: ProgramType;
  delivery_mode: DeliveryMode;
  lifecycle: string;
  created_at: string;
  completed_at?: string | null;
  source_run_id?: string | null;
  source_artifact?: string | null;
  error?: string | null;
}

/** Values returned for a single artifact key (string or structured JSON). */
export type ArtifactContent = string | Record<string, unknown> | unknown[];

/** `GET /runs/{run_id}/artifacts/{artifact}` JSON body. */
export interface RunArtifactPayload {
  run_id: string;
  artifact: string;
  content: ArtifactContent;
}

/** `GET /runs/{run_id}/artifacts` JSON body (matches `RunArtifacts`). */
export interface RunArtifactsPayload {
  run_id: string;
  artifacts: Record<string, ArtifactContent>;
}

/** Parsed SSE JSON payload (matches `StreamEvent` in p9m4_types.py; `ts` is ISO from the server). */
export interface StreamEvent {
  event: string;
  run_id: string;
  program: ProgramType;
  lifecycle?: string | null;
  data?: ArtifactContent | null;
  ts: string;
}

/** Result of `DELETE /runs/{id}` or `POST /runs/{id}/cancel`. */
export interface RunMutationResult {
  status: string;
  message: string;
}

/** Stream-mode run tracked client-side until it appears in `GET /runs` or is dismissed. */
export interface ActiveStreamRun {
  runId: string;
  program: ProgramType;
  streamUrl: string;
}

export interface ParseOutput {
  assumptions: string;
  goals: string;
  global_parameters: Parameter[];
  global_flags: Flag[];
  prover9_options: Prover9Options;
  mace4_options: Mace4Options;
  language_options: string;
  additional_input: string;
}

export interface GuiOutput {
  assumptions: string;
  goals: string;
  prover9_options: Prover9Options;
  mace4_options: Mace4Options;
  language_options: string;
  additional_input: string;
}
