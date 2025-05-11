import React, { useState } from 'react';
import { Form, Row, Col } from 'react-bootstrap';
import { Prover9Options } from '../types';

const PROVER9_FORMATS = [
  { label: 'Text', value: 'text' },
  { label: 'XML', value: 'xml' },
  { label: 'TeX', value: 'tex' }
];

const Prover9OptionsPanel: React.FC = () => {
  const [options, setOptions] = useState<Prover9Options>({
    max_seconds: 60,
    max_megs: 500,
    max_given: 50000,
    max_kept: 10000,
    max_proofs: 1,
    auto: true,
    auto2: false,
    raw: false,
    verbose: false,
    print_initial_clauses: true,
    print_given: false,
    print_kept: false,
    print_proofs: true,
    propositional: false,
    theorem_status: 'unsatisfiable',
    output_format: 'text'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    setOptions(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? parseInt(value, 10) : value
    }));
  };

  return (
    <div className="prover9-options-panel">
      <p>Set options for Prover9:</p>
      
      <Form>
        <Row className="mb-3">
          <Col md={3}>
            <Form.Group>
              <Form.Label>Max Seconds</Form.Label>
              <Form.Control
                type="number"
                name="max_seconds"
                value={options.max_seconds}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Max Memory (MB)</Form.Label>
              <Form.Control
                type="number"
                name="max_megs"
                value={options.max_megs}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Max Given</Form.Label>
              <Form.Control
                type="number"
                name="max_given"
                value={options.max_given}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Max Kept</Form.Label>
              <Form.Control
                type="number"
                name="max_kept"
                value={options.max_kept}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
        </Row>
        
        <Row className="mb-3">
          <Col md={3}>
            <Form.Group>
              <Form.Label>Max Proofs</Form.Label>
              <Form.Control
                type="number"
                name="max_proofs"
                value={options.max_proofs}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Theorem Status</Form.Label>
              <Form.Select 
                name="theorem_status"
                value={options.theorem_status}
                onChange={(e) => handleChange(e as any)}
              >
                <option value="unsatisfiable">Unsatisfiable</option>
                <option value="satisfiable">Satisfiable</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Output Format</Form.Label>
              <Form.Select 
                name="output_format"
                value={options.output_format}
                onChange={(e) => handleChange(e as any)}
              >
                {PROVER9_FORMATS.map(format => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
        
        <Row className="mb-3">
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Auto"
              name="auto"
              checked={options.auto}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Auto2"
              name="auto2"
              checked={options.auto2}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Raw"
              name="raw"
              checked={options.raw}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Verbose"
              name="verbose"
              checked={options.verbose}
              onChange={handleChange}
            />
          </Col>
        </Row>
        
        <Row>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Print Initial Clauses"
              name="print_initial_clauses"
              checked={options.print_initial_clauses}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Print Given"
              name="print_given"
              checked={options.print_given}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Print Kept"
              name="print_kept"
              checked={options.print_kept}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Print Proofs"
              name="print_proofs"
              checked={options.print_proofs}
              onChange={handleChange}
            />
          </Col>
        </Row>
        
        <Row className="mt-3">
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Propositional"
              name="propositional"
              checked={options.propositional}
              onChange={handleChange}
            />
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default Prover9OptionsPanel; 