import React from 'react';
import { Button, ButtonGroup, Row, Col, Form } from 'react-bootstrap';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { useFormulas } from '../context/FormulaContext';

interface FormulasPanelProps {
  apiUrl: string;
}

const FormulasPanel: React.FC<FormulasPanelProps> = ({ apiUrl }) => {
  const { assumptions, goals, setAssumptions, setGoals, clearFormulas } = useFormulas();

  return (
    <div className="formulas-panel">
      <Row className="mb-3">
        <Col>
          <ButtonGroup>
            <Button variant="outline-danger" onClick={clearFormulas}>
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