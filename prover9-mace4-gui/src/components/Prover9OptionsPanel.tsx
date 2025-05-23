import React, { useState } from 'react';
import { Form, Row, Col, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Prover9Options, Flag, IntegerParameter, StringParameter } from '../types';
import { useProver9Options } from '../context/Prover9OptionsContext';

const PROVER9_FORMATS = [
  { label: 'Text', value: 'text' },
  { label: 'XML', value: 'xml' },
  { label: 'TeX', value: 'tex' }
];

export const DEFAULT_OPTIONS: Prover9Options = {
  max_seconds: {
    name: "max_seconds",
    value: -1,
    min: -1,
    max: Number.MAX_SAFE_INTEGER,
    default: -1,
    doc: "Stop searching after this many seconds. Default is -1 (no limit). Command-line -t",
    label: "Max Seconds"
  },
  max_weight: {
    name: "max_weight",
    value: 100,
    min: -Number.MAX_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    default: 100,
    doc: "Derived clauses with weight greater than this value will be discarded. Default is 100.",
    label: "Max Weight"
  },
  pick_given_ratio: {
    name: "pick_given_ratio",
    value: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    default: 0,
    doc: "If n>0, the given clauses are chosen in the ratio one part by age, and n parts by weight. Default is 0.",
    label: "Pick Given Ratio"
  },
  order: {
    name: "order",
    value: "lpo",
    possible_values: ["lpo", "rpo", "kbo"],
    default: "lpo",
    doc: "This option is used to select the primary term ordering to be used for orienting equalities and for determining maximal literals in clauses. Options: lpo (Lexicographic Path Ordering), rpo (Recursive Path Ordering), kbo (Knuth-Bendix Ordering).",
    label: "Order"
  },
  eq_defs: {
    name: "eq_defs",
    value: "unfold",
    possible_values: ["unfold", "fold", "pass"],
    default: "unfold",
    doc: "Controls how equational definitions are handled. If 'unfold', defined symbols are eliminated. If 'fold', equations introduce the defined symbol when possible. If 'pass', no special handling occurs.",
    label: "Equational Definitions"
  },
  expand_relational_defs: {
    name: "expand_relational_defs",
    value: false,
    doc: "If set, Prover9 looks for relational definitions in the assumptions and uses them to rewrite all occurrences of the defined relations elsewhere in the input, before the start of the search.",
    label: "Expand Relational Definitions"
  },
  restrict_denials: {
    name: "restrict_denials",
    value: false,
    doc: "If set, negative clauses (all literals are negative) are given special treatment. The inference rules will not be applied to them, but they will be simplified by back demodulation and back unit deletion.",
    label: "Restrict Denials"
  },
  extra_flags: [],
  extra_parameters: []
};

const Prover9OptionsPanel: React.FC = () => {
  const { options, setOptions } = useProver9Options();

  const handleIntegerParameterChange = (name: string, value: number) => {
    setOptions({
      [name]: {
        ...(options[name as keyof Prover9Options] as IntegerParameter),
        value
      }
    });
  };

  const handleStringParameterChange = (name: string, value: string) => {
    setOptions({
      [name]: {
        ...(options[name as keyof Prover9Options] as StringParameter),
        value
      }
    });
  };

  const handleFlagChange = (name: string, checked: boolean) => {
    setOptions({
      [name]: {
        ...(options[name as keyof Prover9Options] as Flag),
        value: checked
      }
    });
  };

  const renderTooltip = (doc: string) => (
    <Tooltip id={`tooltip-${doc.substring(0, 10)}`}>
      {doc}
    </Tooltip>
  );

  const renderFormControl = (key: string, option: any) => {
    // Skip extra_flags and extra_parameters
    if (key === 'extra_flags' || key === 'extra_parameters') {
      return null;
    }

    // Check if it's a Flag (boolean option)
    if ('value' in option && typeof option.value === 'boolean') {
      return (
        <Col md={3} key={key} className="mb-3">
          <OverlayTrigger
            placement="top"
            overlay={renderTooltip(option.doc)}
          >
            <Form.Check 
              type="checkbox"
              label={option.label}
              name={key}
              checked={option.value}
              onChange={(e) => handleFlagChange(key, e.target.checked)}
            />
          </OverlayTrigger>
        </Col>
      );
    }
    
    // Check if it's a StringParameter with possible_values (dropdown)
    if ('possible_values' in option && Array.isArray(option.possible_values)) {
      return (
        <Col md={3} key={key} className="mb-3">
          <OverlayTrigger
            placement="top"
            overlay={renderTooltip(option.doc)}
          >
            <Form.Group>
              <Form.Label>{option.label}</Form.Label>
              <Form.Select 
                name={key}
                value={option.value}
                onChange={(e) => handleStringParameterChange(key, e.target.value)}
              >
                {option.possible_values.map((value: string) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </OverlayTrigger>
        </Col>
      );
    }
    
    // Default case: assume it's an IntegerParameter (number input)
    return (
      <Col md={3} key={key} className="mb-3">
        <OverlayTrigger
          placement="top"
          overlay={renderTooltip(option.doc)}
        >
          <Form.Group>
            <Form.Label>{option.label}</Form.Label>
            <Form.Control
              type="number"
              name={key}
              value={option.value}
              onChange={(e) => handleIntegerParameterChange(key, parseInt(e.target.value, 10))}
              min={option.min}
              max={option.max}
            />
          </Form.Group>
        </OverlayTrigger>
      </Col>
    );
  };

  return (
    <div className="prover9-options-panel">
      <p>Set options for Prover9:</p>
      
      <Form>
        <Row>
          {Object.entries(options).map(([key, option]) => 
            renderFormControl(key, option)
          )}
        </Row>
        
      </Form>
    </div>
  );
};

export default Prover9OptionsPanel; 