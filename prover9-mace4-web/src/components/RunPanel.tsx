import React, { useState, useRef } from 'react';
import { Button, ButtonGroup, Alert, Row, Col, Modal } from 'react-bootstrap';
import { SampleNode, SampleTreeProps, Mace4Options, Prover9Options, ParseOutput, Flag, IntegerParameter, GuiOutput, INTERP_FORMATS, InterpFormat } from '../types';
import { useFormulas } from '../context/FormulaContext';
import { useMace4Options } from '../context/Mace4OptionsContext';
import { useProver9Options } from '../context/Prover9OptionsContext';
import { useLanguageOptions } from '../context/LanguageOptionsContext';
import { useAdditionalOptions } from '../context/AdditionalOptionsContext';
import { DEFAULT_OPTIONS as PROVER9_DEFAULT_OPTIONS } from './Prover9OptionsPanel';
import { DEFAULT_OPTIONS as MACE4_DEFAULT_OPTIONS } from './Mace4OptionsPanel';

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
}

const RunPanel: React.FC<RunPanelProps> = ({ apiUrl }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
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

  const runProver9 = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const input = await generateInput();
      if (!input) {
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${apiUrl}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: 'prover9',
          input,
        }),
      });

      if (response.ok) {
        // Process started successfully
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to start Prover9');
      }
    } catch (error) {
      setError('Error starting Prover9');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const runMace4 = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const input = await generateInput();
      if (!input) {
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${apiUrl}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: 'mace4',
          input,
        }),
      });

      if (response.ok) {
        // Process started successfully
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to start Mace4');
      }
    } catch (error) {
      setError('Error starting Mace4');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const saveInput = async () => {
    try {
      const saveData = {
        assumptions,
        goals,
      };

      const response = await fetch(`${apiUrl}/save_input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData),
      });

      if (response.ok) {
        alert('Input saved successfully');
      } else {
        alert('Failed to save input');
      }
    } catch (error) {
      alert('Error saving input');
      console.error(error);
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
              variant="primary" 
              onClick={runProver9} 
              disabled={loading}
            >
              {loading ? 'Running...' : 'Run Prover9'}
            </Button>
            <Button 
              variant="secondary" 
              onClick={runMace4} 
              disabled={loading}
            >
              {loading ? 'Running...' : 'Run Mace4'}
            </Button>
          </ButtonGroup>
        </Col>
        <Col md={6}>
          <ButtonGroup>
            <Button variant="outline-primary" onClick={saveInput}>
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