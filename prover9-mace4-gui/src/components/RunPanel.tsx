import React, { useState, useRef } from 'react';
import { Button, ButtonGroup, Alert, Row, Col, Modal, Form } from 'react-bootstrap';
import {
  ActiveStreamRun,
  SampleNode,
  SampleTreeProps,
  Mace4Options,
  Prover9Options,
  ParseOutput,
  GuiOutput,
  DeliveryMode,
  ProgramRunRequestV2,
  RunAccepted,
  ProgramType,
} from '../types';
import { useFormulas } from '../context/FormulaContext';
import { useMace4Options } from '../context/Mace4OptionsContext';
import { useProver9Options } from '../context/Prover9OptionsContext';
import { useLanguageOptions } from '../context/LanguageOptionsContext';
import { useAdditionalOptions } from '../context/AdditionalOptionsContext';
import { DEFAULT_OPTIONS as PROVER9_DEFAULT_OPTIONS } from './Prover9OptionsPanel';
import { DEFAULT_OPTIONS as MACE4_DEFAULT_OPTIONS } from './Mace4OptionsPanel';
import { launchMace4, launchProver9 } from '../api/runs';

/** Flat primitives for `ProgramRunRequestV2.options` (API accepts JSON scalars; runner uses `_extract_option_value`). */
function prover9OptionsForApi(o: Prover9Options): Record<string, string | number | boolean> {
  return {
    max_seconds: o.max_seconds.value,
  };
}

function mace4OptionsForApi(o: Mace4Options): Record<string, string | number | boolean> {
  return {
    start_size: o.start_size.value,
    end_size: o.end_size.value,
    increment: o.increment.value,
    max_models: o.max_models.value,
    max_seconds: o.max_seconds.value,
    max_seconds_per: o.max_seconds_per.value,
    max_megs: o.max_megs.value,
    print_models: o.print_models.value,
    print_models_tabular: o.print_models_tabular.value,
    integer_ring: o.integer_ring.value,
    verbose: o.verbose.value,
    trace: o.trace.value,
  };
}

const SampleTree: React.FC<SampleTreeProps> = ({ nodes, onSelectFile, level = 0 }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  return (
    <ul style={{ paddingLeft: level * 16, listStyle: 'none', margin: 0 }}>
      {nodes.map((node) => (
        <li key={`${node.path}-${level}`}>
          {node.type === 'directory' ? (
            <>
              <div
                style={{ 
                  cursor: 'pointer', 
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onClick={() => toggleExpanded(node.path)}
              >
                <span style={{ marginRight: '8px' }}>
                  {expanded.has(node.path) ? '📁' : '📂'}
                </span>
                {node.name}
              </div>
              {expanded.has(node.path) && node.children && (
                <SampleTree 
                  nodes={node.children} 
                  onSelectFile={onSelectFile}
                  level={level + 1}
                />
              )}
            </>
          ) : (
            <div
              style={{ 
                cursor: 'pointer', 
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px'
              }}
              onClick={() => onSelectFile(node.path)}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span style={{ marginRight: '8px' }}>📄</span>
              {node.name}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

interface RunPanelProps {
  apiUrl: string;
  /** Called after a run is accepted so the run list can refresh (persisted mode). */
  refreshRuns?: () => void | Promise<void>;
  /** When starting a stream-mode run, register it so the UI can track runs not listed by `GET /runs`. */
  onStreamRunStarted?: (run: ActiveStreamRun) => void;
}

const RunPanel: React.FC<RunPanelProps> = ({ apiUrl, refreshRuns, onStreamRunStarted }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [processName, setProcessName] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('persisted');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSampleSelector, setShowSampleSelector] = useState(false);
  const [samples, setSamples] = useState<SampleNode[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const { assumptions, goals, updateFormulas } = useFormulas();
  const { options: prover9Options, setOptions: setProver9Options } = useProver9Options();
  const { options: mace4Options, setOptions: setMace4Options } = useMace4Options();
  const { options: languageOptions, setOptions: setLanguageOptions } = useLanguageOptions();
  const { additionalInput, setAdditionalInput } = useAdditionalOptions();

  const generateInput = async (): Promise<string | null> => {
    try {
      const guiOutput: GuiOutput = {
        assumptions: assumptions,
        goals: goals,
        language_options: languageOptions,
        additional_input: additionalInput,
        prover9_options: { ...PROVER9_DEFAULT_OPTIONS, ...prover9Options } as Prover9Options,
        mace4_options: { ...MACE4_DEFAULT_OPTIONS, ...mace4Options } as Mace4Options,
      };
      const response = await fetch(`${apiUrl}/generate_input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(guiOutput),
      });

      if (response.ok) {
        // Handle direct text response
        const text = await response.text();
        // Parse the text as JSON to handle escaped characters
        const parsedText = JSON.parse(text);
        return parsedText;
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        setError(errorData.error || 'Failed to generate input');
        return null;
      }
    } catch (error) {
      console.error('Exception during generateInput:', error);
      setError('Error generating input');
      return null;
    }
  };

  const launchProgram = async (program: ProgramType.PROVER9 | ProgramType.MACE4) => {
    setLoading(true);
    setError(null);

    try {
      const text = await generateInput();
      if (!text) {
        setLoading(false);
        return;
      }

      const mergedP9 = { ...PROVER9_DEFAULT_OPTIONS, ...prover9Options } as Prover9Options;
      const mergedM4 = { ...MACE4_DEFAULT_OPTIONS, ...mace4Options } as Mace4Options;
      const defaultName =
        program === ProgramType.PROVER9
          ? `Prover9_${new Date().toISOString()}`
          : `Mace4_${new Date().toISOString()}`;

      const body: ProgramRunRequestV2 = {
        input: { kind: 'text', text },
        name: processName || defaultName,
        delivery_mode: deliveryMode,
        options:
          program === ProgramType.PROVER9
            ? prover9OptionsForApi(mergedP9)
            : mace4OptionsForApi(mergedM4),
      };

      try {
        const accepted: RunAccepted =
          program === ProgramType.PROVER9
            ? await launchProver9(apiUrl, body)
            : await launchMace4(apiUrl, body);
        if (accepted.delivery_mode === 'stream' && accepted.stream_url) {
          onStreamRunStarted?.({
            runId: accepted.run_id,
            program: accepted.program,
            streamUrl: accepted.stream_url,
          });
        }
        void refreshRuns?.();
      } catch (launchError) {
        const defaultMessage =
          program === ProgramType.PROVER9 ? 'Failed to start Prover9' : 'Failed to start Mace4';
        const message = launchError instanceof Error && launchError.message
          ? launchError.message
          : defaultMessage;
        setError(message);
      }
    } catch (err) {
      setError(program === ProgramType.PROVER9 ? 'Error starting Prover9' : 'Error starting Mace4');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runProver9 = () => launchProgram(ProgramType.PROVER9);
  const runMace4 = () => launchProgram(ProgramType.MACE4);

  /** Save a standard Prover9/Mace4 input file (same text as used for runs). */
  const saveInputLocal = async () => {
    setError(null);
    setLoading(true);
    try {
      const text = await generateInput();
      if (text == null || text === '') {
        return;
      }
      const body = typeof text === 'string' ? text : String(text);
      const base =
        processName.trim().replace(/[<>:"/\\|?*]+/g, '_') || `prover9-input-${Date.now()}`;
      const filename = base.toLowerCase().endsWith('.in') ? base : `${base}.in`;
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      // Set process name based on filename
      const name = file.name.endsWith('.in') ? file.name.slice(0, -3) : file.name;
      setProcessName(name);
      await handleFileContent(content, file.name);
    } catch (error) {
      alert(`Error opening file ${file.name}`);
      console.error(error);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadSample = () => {
    setShowSampleSelector(true);
    if (samples.length === 0) {
      loadSamples();
    }
  };

  const loadSamples = async () => {
    setLoadingSamples(true);
    try {
      const response = await fetch(`${apiUrl}/samples`);
      if (response.ok) {
        const data = await response.json();
        setSamples(data);
      }
    } catch (error) {
      console.error('Error loading samples:', error);
      alert('Error loading samples');
    } finally {
      setLoadingSamples(false);
    }
  };

  const handleSelectSample = async (path: string) => {
    try {
      const response = await fetch(`${apiUrl}/samples/${encodeURIComponent(path)}`);
      
      if (response.ok) {
        const content = await response.text();
        // Set process name based on sample path
        const name = path.endsWith('.in') ? path.slice(0, -3) : path;
        setProcessName(name);
        await handleFileContent(content, path);
      }
    } catch (error) {
      alert('Error loading sample');
      console.error(error);
    }
    setShowSampleSelector(false);
  };

  // Abstraction for handling file content and parsing
  const handleFileContent = async (content: string, filename?: string) => {
    try {
      // Parse the content to extract assumptions and goals
      const parseResponse = await fetch(`${apiUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: content })
      });
      
      if (parseResponse.ok) {
        const parsed: ParseOutput = await parseResponse.json();
        
        // Update formulas
        updateFormulas(parsed.assumptions || '', parsed.goals || '');
        
        // Update options using context hooks
        if (parsed.prover9_options) {
          setProver9Options(parsed.prover9_options);
        }
        
        if (parsed.mace4_options) {
          setMace4Options(parsed.mace4_options);
        }
        
        if (parsed.language_options) {
          setLanguageOptions(parsed.language_options);
        }

        // Only update additional input if it exists in the parsed output
        if (parsed.additional_input !== undefined) {
          setAdditionalInput(parsed.additional_input);
        }
      } else {
        // Fallback to setting raw content as assumptions
        updateFormulas(content, '');
      }
    } catch (error) {
      alert(`Error processing ${filename || 'file'}`);
      console.error(error);
    }
  };

  return (
    <div className="run-panel p-3 bg-light border rounded">
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      
      <Row className="mb-3">
        <Col md={6}>
          <ButtonGroup className="me-3">
            <Button 
              variant="light" 
              onClick={runProver9} 
              disabled={loading}
              className=""
            >
              <img src="prover9-5a-128t.gif" alt="Prover9" className="app-logo" />
            </Button>
            <Button 
              variant="light" 
              onClick={runMace4} 
              disabled={loading}
            >
              <img src="mace4-90t.gif" alt="Mace4" className="app-logo" />
            </Button>
            {loading ? '↺' : ''}
          </ButtonGroup>
        </Col>
        <Col md={6}>
          <ButtonGroup className="flex-wrap align-items-center">
            <Form.Control
              type="text"
              placeholder="Process name"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              style={{ width: '200px', marginRight: '10px' }}
            />
            <Form.Select
              value={deliveryMode}
              onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
              style={{ width: 'auto', maxWidth: '140px', marginRight: '10px' }}
              aria-label="Delivery mode"
            >
              <option value="persisted">Persisted</option>
              <option value="stream">Stream</option>
            </Form.Select>
            <Button variant="outline-primary" onClick={() => void saveInputLocal()} title="Save as a Prover9/Mace4 input file (.in)">
              💾 Save
            </Button>
            <Button variant="outline-primary" onClick={handleUpload}>
              📁 Upload
            </Button>
            <Button variant="outline-primary" onClick={loadSample}>
              📋 Samples
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".in,.txt,text/plain"
              onChange={handleFileSelect}
            />
          </ButtonGroup>
        </Col>
      </Row>
      
      <Modal show={showSampleSelector} onHide={() => setShowSampleSelector(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Select a Sample</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {loadingSamples ? (
            <div>Loading samples...</div>
          ) : (
            <SampleTree nodes={samples} onSelectFile={handleSelectSample} />
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default RunPanel; 