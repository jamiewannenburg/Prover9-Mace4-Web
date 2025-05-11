import React, { useState } from 'react';
import { Form, Row, Col } from 'react-bootstrap';
import { Mace4Options } from '../types';

const MACE4_FORMATS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Portable', value: 'portable' },
  { label: 'Text', value: 'text' },
  { label: 'XML', value: 'xml' },
  { label: 'Tabular', value: 'tabular' },
  { label: 'Raw', value: 'raw' },
  { label: 'Cooked', value: 'cooked' }
];

const Mace4OptionsPanel: React.FC = () => {
  const [options, setOptions] = useState<Mace4Options>({
    max_seconds: 60,
    max_megs: 500,
    domain_size: 2,
    start_size: 2,
    end_size: 6,
    increment: 1,
    iterate: true,
    print_models: 1,
    print_all_models: false,
    all_models: false,
    trace_assign: false,
    trace_choices: false,
    trace_models: false,
    verbose: false,
    output_format: 'standard'
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
    <div className="mace4-options-panel">
      <p>Set options for Mace4:</p>
      
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
              <Form.Label>Domain Size</Form.Label>
              <Form.Control
                type="number"
                name="domain_size"
                value={options.domain_size}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Iterate Sizes"
              name="iterate"
              checked={options.iterate}
              onChange={handleChange}
            />
          </Col>
        </Row>
        
        <Row className="mb-3">
          <Col md={3}>
            <Form.Group>
              <Form.Label>Start Size</Form.Label>
              <Form.Control
                type="number"
                name="start_size"
                value={options.start_size}
                onChange={handleChange}
                disabled={!options.iterate}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>End Size</Form.Label>
              <Form.Control
                type="number"
                name="end_size"
                value={options.end_size}
                onChange={handleChange}
                disabled={!options.iterate}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Increment</Form.Label>
              <Form.Control
                type="number"
                name="increment"
                value={options.increment}
                onChange={handleChange}
                disabled={!options.iterate}
              />
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
                {MACE4_FORMATS.map(format => (
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
            <Form.Group>
              <Form.Label>Print Models</Form.Label>
              <Form.Control
                type="number"
                name="print_models"
                value={options.print_models}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Print All Models"
              name="print_all_models"
              checked={options.print_all_models}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="All Models"
              name="all_models"
              checked={options.all_models}
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
              label="Trace Assign"
              name="trace_assign"
              checked={options.trace_assign}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Trace Choices"
              name="trace_choices"
              checked={options.trace_choices}
              onChange={handleChange}
            />
          </Col>
          <Col md={3}>
            <Form.Check 
              type="checkbox"
              label="Trace Models"
              name="trace_models"
              checked={options.trace_models}
              onChange={handleChange}
            />
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default Mace4OptionsPanel; 