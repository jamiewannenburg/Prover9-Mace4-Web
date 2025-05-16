import React, { useState } from 'react';
import { Form, Row, Col, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Mace4Options, Flag, IntegerParameter, StringParameter } from '../types';

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
    start_size: {
      name: "start_size",
      value: 2,
      min: 2,
      max: Number.MAX_SAFE_INTEGER,
      default: 2,
      doc: "Initial domain size to search for structures. Default is 2, with range [2 .. INT_MAX]. Command-line -n",
      label: "Start Size"
    },
    end_size: {
      name: "end_size",
      value: -1,
      min: -1,
      max: Number.MAX_SAFE_INTEGER,
      default: -1,
      doc: "Maximum domain size to search. Default is -1 (no limit), with range [-1 .. INT_MAX]. Command-line -N",
      label: "End Size"
    },
    increment: {
      name: "increment",
      value: 1,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      default: 1,
      doc: "Increment by which domain size increases if a model is not found. Default is 1, with range [1 .. INT_MAX]. Command-line -i",
      label: "Increment"
    },
    iterate: {
      name: "iterate",
      value: "all",
      possible_values: ["all", "evens", "odds", "primes", "nonprimes"],
      default: "all",
      doc: "Add additional constraint to domain sizes. Can be used with increment. Options: all, evens, odds, primes, nonprimes",
      label: "Iterate"
    },
    max_models: {
      name: "max_models",
      value: 1,
      min: -1,
      max: Number.MAX_SAFE_INTEGER,
      default: 1,
      doc: "Stop searching when this many structures have been found. Default is 1, -1 means no limit. Command-line -m",
      label: "Max Models"
    },
    max_seconds: {
      name: "max_seconds",
      value: -1,
      min: -1,
      max: Number.MAX_SAFE_INTEGER,
      default: -1,
      doc: "Stop searching after this many seconds. Default is -1 (no limit). Command-line -t",
      label: "Max Seconds"
    },
    max_seconds_per: {
      name: "max_seconds_per",
      value: -1,
      min: -1,
      max: Number.MAX_SAFE_INTEGER,
      default: -1,
      doc: "Maximum seconds allowed for each domain size. Default is -1 (no limit). Command-line -s",
      label: "Max Seconds Per Iteration"
    },
    max_megs: {
      name: "max_megs",
      value: 200,
      min: -1,
      max: Number.MAX_SAFE_INTEGER,
      default: 200,
      doc: "Stop searching when about this many megabytes of memory have been used. Default is 200, -1 means no limit. Command-line -b",
      label: "Max Megs"
    },
    print_models: {
      name: "print_models",
      value: true,
      doc: "If set, structures found are printed in 'standard' form suitable as input to other LADR programs. Default is set. Command-line -P",
      label: "Print Models"
    },
    print_models_tabular: {
      name: "print_models_tabular",
      value: false,
      doc: "If set, structures found are printed in tabular form. If both print_models and print_models_tabular are set, the last one in input takes effect. Default is clear. Command-line -p",
      label: "Print Models Tabular"
    },
    integer_ring: {
      name: "integer_ring",
      value: false,
      doc: "If set, a ring structure is applied to search. Operations {+,-,*} are assumed to be ring of integers (mod domain_size). Default is clear. Command-line -R",
      label: "Integer Ring"
    },
    order_domain: {
      name: "order_domain",
      value: false,
      doc: "If set, the relations < and <= are fixed as order relations on the domain in the obvious way. Default is clear. Command-line -O",
      label: "Order Domain"
    },
    arithmetic: {
      name: "arithmetic",
      value: false,
      doc: "If set, several function and relation symbols are interpreted as operations and relations on integers. Default is clear. Command-line -A",
      label: "Arithmetic"
    },
    verbose: {
      name: "verbose",
      value: false,
      doc: "If set, output includes info about the search, including initial partial model and timing statistics for each domain size. Default is clear. Command-line -v",
      label: "Verbose"
    },
    trace: {
      name: "trace",
      value: false,
      doc: "If set, detailed information about the search, including trace of all assignments and backtracking, is printed. Use only on small searches as it produces a lot of output. Default is clear. Command-line -T",
      label: "Trace"
    },
    extra_flags: [],
    extra_parameters: []
  });

  const handleIntegerParameterChange = (name: string, value: number) => {
    setOptions(prev => ({
      ...prev,
      [name]: {
        ...(prev[name as keyof Mace4Options] as IntegerParameter),
        value
      }
    }));
  };

  const handleStringParameterChange = (name: string, value: string) => {
    setOptions(prev => ({
      ...prev,
      [name]: {
        ...(prev[name as keyof Mace4Options] as StringParameter),
        value
      }
    }));
  };

  const handleFlagChange = (name: string, checked: boolean) => {
    setOptions(prev => ({
      ...prev,
      [name]: {
        ...(prev[name as keyof Mace4Options] as Flag),
        value: checked
      }
    }));
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
    <div className="mace4-options-panel">
      <p>Set options for Mace4:</p>
      
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

export default Mace4OptionsPanel; 