import React, { useState, useEffect } from 'react';
import { Button, ButtonGroup, Row, Col, Form, Modal } from 'react-bootstrap';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { ParsedInput, SampleNode, SampleTreeProps } from '../types';

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

interface FormulasPanelProps {
  apiUrl: string;
}

const FormulasPanel: React.FC<FormulasPanelProps> = ({ apiUrl }) => {
  const [assumptions, setAssumptions] = useState<string>('');
  const [goals, setGoals] = useState<string>('');
  const [showSampleSelector, setShowSampleSelector] = useState(false);
  const [samples, setSamples] = useState<SampleNode[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);

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

  const loadSample = async () => {
    setShowSampleSelector(true);
    if (samples.length === 0) {
      await loadSamples();
    }
  };

  const handleSelectSample = async (path: string) => {
    try {
      const response = await fetch(`${apiUrl}/samples/${encodeURIComponent(path)}`);
      
      if (response.ok) {
        const content = await response.text();
        // Parse the content to extract assumptions and goals
        const parseResponse = await fetch(`${apiUrl}/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: content })
        });
        
        if (parseResponse.ok) {
          const parsed = await parseResponse.json();
          setAssumptions(parsed.assumptions || '');
          setGoals(parsed.goals || '');
        } else {
          // Fallback to setting raw content
          setAssumptions(content);
          setGoals('');
        }
      }
    } catch (error) {
      alert('Error loading sample');
      console.error(error);
    }
    setShowSampleSelector(false);
  };

  const parseInput = async () => {
    try {
      const response = await fetch(`${apiUrl}/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: assumptions + '\n\n' + goals }),
      });

      if (response.ok) {
        const parsedData: ParsedInput = await response.json();
        setAssumptions(parsedData.assumptions);
        setGoals(parsedData.goals);
        
        // TODO: Update other form fields with parsed data
      }
    } catch (error) {
      alert('Error parsing input');
      console.error(error);
    }
  };

  const handleClear = () => {
    setAssumptions('');
    setGoals('');
  };

  return (
    <div className="formulas-panel">
      <Row className="mb-3">
        <Col>
          <ButtonGroup>
            <Button variant="outline-primary" onClick={saveInput}>
              💾 Save
            </Button>
            <Button variant="outline-primary" onClick={parseInput}>
              📄 Parse
            </Button>
            <Button variant="outline-primary" onClick={loadSample}>
              Samples
            </Button>
            <Button variant="outline-danger" onClick={handleClear}>
              🧹 Clear
            </Button>
          </ButtonGroup>
        </Col>
      </Row>
      
      <Form.Group className="mb-3">
        <Form.Label>Assumptions:</Form.Label>
        <CodeMirror
          value={assumptions}
          height="300px"
          extensions={[javascript()]}
          onChange={(value) => setAssumptions(value)}
        />
      </Form.Group>
      
      <Form.Group className="mb-3">
        <Form.Label>Goals:</Form.Label>
        <CodeMirror
          value={goals}
          height="150px"
          extensions={[javascript()]}
          onChange={(value) => setGoals(value)}
        />
      </Form.Group>

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

export default FormulasPanel; 