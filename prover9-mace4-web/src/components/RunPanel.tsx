import React, { useState } from 'react';
import { Button, ButtonGroup, Alert } from 'react-bootstrap';

interface RunPanelProps {
  apiUrl: string;
}

const RunPanel: React.FC<RunPanelProps> = ({ apiUrl }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

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

  return (
    <div className="run-panel p-3 bg-light border rounded">
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      
      <ButtonGroup>
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
    </div>
  );
};

export default RunPanel; 