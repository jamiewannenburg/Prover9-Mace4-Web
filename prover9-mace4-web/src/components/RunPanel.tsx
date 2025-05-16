import React, { useState, useRef } from 'react';
import { Button, ButtonGroup, Alert, Row, Col, Modal } from 'react-bootstrap';
import { SampleNode, SampleTreeProps, Mace4Options, Prover9Options, ParseOutput, Flag, IntegerParameter } from '../types';
import { useFormulas } from '../context/FormulaContext';

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
        <li key={node.path}>
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

  const generateInput = async (): Promise<string | null> => {
    try {
      // Get stored options, ensuring proper structure for both option types
      let prover9Options: Partial<Prover9Options> = {};
      let mace4Options: Partial<Mace4Options> = {};
      
      try {
        const storedProver9Options = localStorage.getItem('prover9_options');
        const storedMace4Options = localStorage.getItem('mace4_options');
        
        // Parse stored options or use empty objects if not available
        prover9Options = storedProver9Options ? JSON.parse(storedProver9Options) : {};
        mace4Options = storedMace4Options ? JSON.parse(storedMace4Options) : {};
        
      } catch (error) {
        console.warn("Error parsing stored options, using defaults", error);
        // Use empty objects if parsing fails
        prover9Options = {};
        mace4Options = {};
      }

      // Convert options to the format expected by the API
      const convertedProver9Options: Record<string, any> = {};
      const convertedMace4Options: Record<string, any> = {};
      
      // Process Prover9 options
      if (prover9Options) {
        Object.entries(prover9Options).forEach(([key, option]) => {
          if (key !== 'extra_flags' && key !== 'extra_parameters' && option) {
            // For parameters with value property (Flag, IntegerParameter, StringParameter)
            if (option && typeof option === 'object' && 'value' in option) {
              convertedProver9Options[key] = option.value;
            }
          }
        });
      }
      
      // Process Mace4 options
      if (mace4Options) {
        Object.entries(mace4Options).forEach(([key, option]) => {
          if (key !== 'extra_flags' && key !== 'extra_parameters' && option) {
            // For parameters with value property (Flag, IntegerParameter, StringParameter)
            if (option && typeof option === 'object' && 'value' in option) {
              convertedMace4Options[key] = option.value;
            }
          }
        });
      }

      const response = await fetch(`${apiUrl}/generate_input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assumptions: assumptions,
          goals: goals,
          language_options: localStorage.getItem('language_options') || '',
          additional_input: localStorage.getItem('additional_input') || '',
          global_parameters: [],
          global_flags: [],
          prover9_options: convertedProver9Options,
          mace4_options: convertedMace4Options,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.input;
      } else {
        const errorData = await response.json();
        console.log(errorData);
        setError(errorData.error || 'Failed to generate input');
        return null;
      }
    } catch (error) {
      setError('Error generating input');
      console.error(error);
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
      
      // Parse the content through the API
      const parseResponse = await fetch(`${apiUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: content })
      });
      
      if (parseResponse.ok) {
        const parsed: ParseOutput = await parseResponse.json();
        updateFormulas(parsed.assumptions || '', parsed.goals || '');
        
        // Store options to localStorage if present in parsed output
        if (parsed.prover9_options) {
          localStorage.setItem('prover9_options', JSON.stringify(parsed.prover9_options));
        }
        
        if (parsed.mace4_options) {
          localStorage.setItem('mace4_options', JSON.stringify(parsed.mace4_options));
        }
        
        if (parsed.language_options) {
          localStorage.setItem('language_options', parsed.language_options);
        }
      } else {
        // Fallback to setting raw content as assumptions
        updateFormulas(content, '');
      }
    } catch (error) {
      alert(`Error processing ${file.name}`);
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
        
        // Store options to localStorage if present in parsed output
        if (parsed.prover9_options) {
          localStorage.setItem('prover9_options', JSON.stringify(parsed.prover9_options));
        }
        
        if (parsed.mace4_options) {
          localStorage.setItem('mace4_options', JSON.stringify(parsed.mace4_options));
        }
        
        if (parsed.language_options) {
          localStorage.setItem('language_options', parsed.language_options);
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