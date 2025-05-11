import React, { useState } from 'react';
import { Button, ButtonGroup, Row, Col, Form } from 'react-bootstrap';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { ParsedInput } from '../types';

interface FormulasPanelProps {
  apiUrl: string;
}

const FormulasPanel: React.FC<FormulasPanelProps> = ({ apiUrl }) => {
  const [assumptions, setAssumptions] = useState<string>('');
  const [goals, setGoals] = useState<string>('');

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

  const loadSample = async () => {
    try {
      // Get list of samples first
      const response = await fetch(`${apiUrl}/samples`);
      
      if (response.ok) {
        const samples = await response.json();
        // TODO: Show sample selection dialog
        if (samples.length > 0) {
          const firstSample = samples[0];
          const sampleResponse = await fetch(`${apiUrl}/sample/${encodeURIComponent(firstSample)}`);
          
          if (sampleResponse.ok) {
            const sampleData = await sampleResponse.json();
            setAssumptions(sampleData.assumptions || '');
            setGoals(sampleData.goals || '');
          }
        }
      }
    } catch (error) {
      alert('Error loading sample');
      console.error(error);
    }
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
    </div>
  );
};

export default FormulasPanel; 