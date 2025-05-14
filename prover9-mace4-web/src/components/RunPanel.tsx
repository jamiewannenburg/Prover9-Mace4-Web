import React, { useState, useRef } from 'react';
import { Button, ButtonGroup, Alert, Row, Col } from 'react-bootstrap';

interface RunPanelProps {
  apiUrl: string;
}

const RunPanel: React.FC<RunPanelProps> = ({ apiUrl }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateInput = async (): Promise<string | null> => {
    try {
      const response = await fetch(`${apiUrl}/generate_input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // In a real application, we would collect this data from the various form components
          formulas: {
            assumptions: localStorage.getItem('assumptions') || '',
            goals: localStorage.getItem('goals') || '',
            language_options: localStorage.getItem('language_options') || '',
            additional_input: localStorage.getItem('additional_input') || '',
          },
          prover9_options: JSON.parse(localStorage.getItem('prover9_options') || '{}'),
          mace4_options: JSON.parse(localStorage.getItem('mace4_options') || '{}'),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.input;
      } else {
        const errorData = await response.json();
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

  // Added functions from FormulasPanel
  const saveInput = async () => {
    try {
      const assumptions = localStorage.getItem('assumptions') || '';
      const goals = localStorage.getItem('goals') || '';
      
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
        const parsed = await parseResponse.json();
        localStorage.setItem('assumptions', parsed.assumptions || '');
        localStorage.setItem('goals', parsed.goals || '');
        
        // Dispatch a custom event to notify FormulasPanel of the changes
        window.dispatchEvent(new CustomEvent('formulas-updated'));
      } else {
        // Fallback to setting raw content as assumptions
        localStorage.setItem('assumptions', content);
        localStorage.setItem('goals', '');
        
        // Dispatch a custom event to notify FormulasPanel of the changes
        window.dispatchEvent(new CustomEvent('formulas-updated'));
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
    // Notify FormulasPanel to show the sample selector
    window.dispatchEvent(new CustomEvent('show-samples'));
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
    </div>
  );
};

export default RunPanel; 