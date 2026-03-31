import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
import {
  INTERP_FORMATS,
  ProoftransOption,
  PROOFTRANS_OPTIONS,
  RunArtifactPayload,
  RunSummary,
  ProgramType,
} from '../types';
import { formatDuration } from '../utils';

interface ProcessDetailsProps {
  runId: string | null;
  runs: RunSummary[];
  apiUrl: string;
  refreshRuns?: () => void | Promise<void>;
}

function artifactContentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

const ProcessDetails: React.FC<ProcessDetailsProps> = ({ runId, runs, apiUrl, refreshRuns }) => {
  const [output, setOutput] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<string>('standard');
  const [prooftransOption, setProoftransOption] = useState<ProoftransOption>(PROOFTRANS_OPTIONS[0]);
  const [isofilterOptions, setIsofilterOptions] = useState({
    wrap: false,
    ignore_constants: false
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const prevRunIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const selectedRun = runs.find((r) => r.run_id === runId);
  
  const fetchOutput = useCallback(async () => {
    if (!runId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/runs/${encodeURIComponent(runId)}/artifacts/stdout`);
      if (response.ok) {
        const data: RunArtifactPayload = await response.json();
        setOutput(artifactContentToString(data.content));
      } else {
        setOutput('No output available (artifact may not exist yet for this run).');
      }
    } catch (error) {
      console.error('Error fetching output:', error);
      setOutput('Error fetching output');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, runId]);

  useEffect(() => {
    const cleanup = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    if (!runId || !selectedRun) {
      cleanup();
      setOutput('');
      prevRunIdRef.current = null;
      return;
    }

    if (selectedRun.lifecycle === 'running') {
      cleanup();
      pollIntervalRef.current = setInterval(() => {
        void fetchOutput();
      }, 1000);
    } else {
      cleanup();
    }

    if (runId !== prevRunIdRef.current) {
      void fetchOutput();
      prevRunIdRef.current = runId;
    }

    return cleanup;
  }, [runId, selectedRun, fetchOutput]);
  
  const downloadOutput = async () => {
    if (!runId) return;
    
    try {
      const url = `${apiUrl}/runs/${encodeURIComponent(runId)}/download/stdout`;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.download = `output_${runId}_${selectedRun?.program ?? 'run'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading output:', error);
      alert('Error downloading output');
    }
  };
  
  const formatProver9Output = async () => {
    if (!runId) return;
    
    try {
      const options: Record<string, string | boolean> = {
        format: prooftransOption.format || 'default',
      };
      if (prooftransOption.parents_only) options.parents_only = true;
      if (prooftransOption.expand) options.expand = true;
      if (prooftransOption.renumber) options.renumber = true;
      if (prooftransOption.striplabels) options.striplabels = true;

      const response = await fetch(`${apiUrl}/prooftrans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { kind: 'process_output', run_id: runId, artifact: 'stdout' },
          options,
          delivery_mode: 'persisted',
        }),
      });
      
      if (response.ok) {
        void refreshRuns?.();
      } else {
        alert('Failed to format output');
      }
    } catch (error) {
      console.error('Error formatting output:', error);
      alert('Error formatting output');
    }
  };
  
  const formatMace4Output = async () => {
    if (!runId) return;
    
    try {
      const response = await fetch(`${apiUrl}/interpformat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { kind: 'process_output', run_id: runId, artifact: 'stdout' },
          options: { format: selectedFormat },
          delivery_mode: 'persisted',
        }),
      });
      
      if (response.ok) {
        void refreshRuns?.();
      } else {
        const data = await response.json().catch(() => ({}));
        console.error('Failed to format output:', data);
        alert('Failed to format output');
      }
    } catch (error) {
      console.error('Error formatting output:', error);
      alert('Error formatting output');
    }
  };

  const filterModels = async () => {
    if (!runId) return;
    
    try {
      const response = await fetch(`${apiUrl}/isofilter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { kind: 'process_output', run_id: runId, artifact: 'stdout' },
          options: isofilterOptions,
          delivery_mode: 'persisted',
        }),
      });
      
      if (response.ok) {
        void refreshRuns?.();
      } else {
        alert('Failed to filter models');
      }
    } catch (error) {
      console.error('Error filtering models:', error);
      alert('Error filtering models');
    }
  };

  if (!selectedRun) {
    return (
      <Card>
        <Card.Body>
          <Card.Title>Process Details</Card.Title>
          <p>Select a process to view details</p>
        </Card.Body>
      </Card>
    );
  }

  const formatRunInfo = (run: RunSummary) => {
    const startTime = new Date(run.created_at);
    const duration = (new Date().getTime() - startTime.getTime()) / 1000;
    
    const info = [
      `Name: ${run.name || 'Unnamed'}`,
      `Program: ${run.program}`,
      `Status: ${run.lifecycle}`,
      `Delivery: ${run.delivery_mode}`,
      `Duration: ${formatDuration(duration)}`
    ];

    if (run.lifecycle === 'failed' && run.error) {
      info.push(`Error: ${run.error}`);
    }
    
    return info.join('\n');
  };

  return (
    <Card>
      <Card.Body>
        <Card.Title>Process Details</Card.Title>
        <pre className="process-info">{formatRunInfo(selectedRun)}</pre>
        
        <hr />
        {selectedRun.program === ProgramType.PROVER9 && (
          <div className="mb-3">
            <ButtonGroup>
              <Button variant="outline-primary" size="sm" onClick={downloadOutput}>
                Download
              </Button>
                <Form.Select 
                  size="sm"
                  value={prooftransOption.format}
                  onChange={(e) => setProoftransOption(PROOFTRANS_OPTIONS.find(opt => opt.format === e.target.value) || PROOFTRANS_OPTIONS[0])}
                  style={{ width: 'auto', display: 'inline-block', marginLeft: '10px' }}
                >
                  {PROOFTRANS_OPTIONS.map(option => (
                    <option key={option.format} value={option.format} title={option.doc}>
                      {option.label}
                    </option>
                  ))}
                </Form.Select>
            </ButtonGroup>
            <ButtonGroup>
              <>
                <div className="ms-2 d-inline-block">
                  {prooftransOption.parents_only !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Parents Only"
                      checked={!!prooftransOption.parents_only}
                      onChange={() => setProoftransOption({ ...prooftransOption, parents_only: !prooftransOption.parents_only })}
                      className="d-inline-block me-2"
                    />
                  )}
                  {prooftransOption.expand !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Expand"
                      checked={!!prooftransOption.expand}
                      onChange={() => setProoftransOption({ ...prooftransOption, expand: !prooftransOption.expand })}
                      className="d-inline-block me-2"
                    />
                  )}
                  {prooftransOption.renumber !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Renumber"
                      checked={!!prooftransOption.renumber}
                      onChange={() => setProoftransOption({ ...prooftransOption, renumber: !prooftransOption.renumber })}
                      className="d-inline-block me-2"
                    />
                  )}
                  {prooftransOption.striplabels !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Strip Labels"
                      checked={!!prooftransOption.striplabels}
                      onChange={() => setProoftransOption({ ...prooftransOption, striplabels: !prooftransOption.striplabels })}
                      className="d-inline-block me-2"
                    />
                  )}
                </div>
                <Button variant="outline-success" size="sm" onClick={formatProver9Output}>
                  Translate
                </Button>
              </>
              </ButtonGroup>
          </div>
        )}

        {selectedRun.program === ProgramType.MACE4 && (
          <div className="mb-3">
            <ButtonGroup>
              <Button variant="outline-primary" size="sm" onClick={downloadOutput}>
                Download
              </Button>
              <Form.Select 
                size="sm"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                style={{ width: 'auto', display: 'inline-block' }}
              >
                {INTERP_FORMATS.map(format => (
                  <option key={format.value} value={format.value} title={format.doc}>
                    {format.label}
                  </option>
                ))}
              </Form.Select>
              <Button variant="outline-success" size="sm" onClick={formatMace4Output}>
                Format Output
              </Button>
            </ButtonGroup>

            <ButtonGroup>
              <div className="ms-2 d-inline-block">
                <Form.Check
                  type="checkbox"
                  label="Wrap"
                  checked={isofilterOptions.wrap}
                  onChange={() => setIsofilterOptions({ ...isofilterOptions, wrap: !isofilterOptions.wrap })}
                  className="d-inline-block me-2"
                />
                <Form.Check
                  type="checkbox"
                  label="Ignore Constants"
                  checked={isofilterOptions.ignore_constants}
                  onChange={() => setIsofilterOptions({ ...isofilterOptions, ignore_constants: !isofilterOptions.ignore_constants })}
                  className="d-inline-block me-2"
                />
              </div>
              <Button variant="outline-info" size="sm" onClick={filterModels}>
                Filter Models
              </Button>
            </ButtonGroup>
          </div>
        )}
        {(selectedRun.program !== ProgramType.PROVER9 && selectedRun.program !== ProgramType.MACE4 && selectedRun.program !== ProgramType.ISOFILTER && selectedRun.program !== ProgramType.INTERPFORMAT) && (
          <div className="mb-3">
            <Button variant="outline-primary" size="sm" onClick={downloadOutput}>
              Download
            </Button>
          </div>
        )}
        <div className="output-container">
          <h5>Output</h5>
          <pre 
            ref={outputRef}
            className="output-text p-2 border bg-light" 
            style={{ maxHeight: '500px', overflow: 'auto', whiteSpace: 'pre-wrap' }}
          >
            {output || 'No output available'}
            {isLoading && selectedRun.lifecycle !== 'running' && <div className="text-center">Loading...</div>}
          </pre>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ProcessDetails;
