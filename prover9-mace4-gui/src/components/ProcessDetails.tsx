import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
import {
  INTERP_FORMATS,
  ProoftransOption,
  PROOFTRANS_OPTIONS,
  RunSummary,
  ProgramType,
} from '../types';
import {
  downloadArtifact,
  getArtifact,
  getRunArtifacts,
  launchInterpformat,
  launchIsofilter,
  launchProoftrans,
} from '../api/runs';
import { formatDuration } from '../utils';

/** Keys passed to `map_prooftrans_options` in pyp9m4_runner (no `parents_only` in that mapper). */
function buildProoftransOptions(opt: ProoftransOption): Record<string, string | boolean> {
  const format = (opt.format ?? '').trim() === '' ? 'default' : opt.format;
  const o: Record<string, string | boolean> = { format };
  if (opt.expand) o.expand = true;
  if (opt.renumber) o.renumber = true;
  if (opt.striplabels) o.striplabels = true;
  return o;
}

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
  const [artifactKeys, setArtifactKeys] = useState<string[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string>('stdout');
  const [selectedFormat, setSelectedFormat] = useState<string>('standard');
  const [prooftransOption, setProoftransOption] = useState<ProoftransOption>(PROOFTRANS_OPTIONS[0]);
  const [isofilterOptions, setIsofilterOptions] = useState({
    wrap: false,
    ignore_constants: false
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const outputRef = useRef<HTMLPreElement>(null);
  
  const selectedRun = runs.find((r) => r.run_id === runId);
  const normalizeLifecycle = (lifecycle: string): string => lifecycle.trim().toLowerCase();
  const isActiveLifecycle = (lifecycle: string): boolean =>
    ['queued', 'running'].includes(normalizeLifecycle(lifecycle));
  const formatLifecycleLabel = (lifecycle: string): string => {
    const normalized = normalizeLifecycle(lifecycle);
    if (normalized === 'succeeded') return 'completed';
    if (normalized === 'timed_out') return 'timed out';
    return normalized;
  };

  const refreshArtifactKeys = useCallback(async () => {
    if (!runId) return;
    try {
      const { artifacts } = await getRunArtifacts(apiUrl, runId);
      const keys = Object.keys(artifacts).sort((a, b) => {
        const order = (k: string) => (k === 'stdout' ? 0 : k === 'stderr' ? 1 : 2);
        return order(a) - order(b) || a.localeCompare(b);
      });
      setArtifactKeys(keys);
      setSelectedArtifact((prev) => {
        if (keys.includes(prev)) return prev;
        if (keys.includes('stdout')) return 'stdout';
        return keys[0] ?? 'stdout';
      });
    } catch {
      setArtifactKeys([]);
    }
  }, [apiUrl, runId]);
  
  const fetchOutput = useCallback(async () => {
    if (!runId) return;

    setIsLoading(true);
    try {
      const data = await getArtifact(apiUrl, runId, selectedArtifact);
      setOutput(artifactContentToString(data.content));
    } catch (error) {
      console.error('Error fetching output:', error);
      setOutput(
        `No output available for artifact "${selectedArtifact}" (it may not exist yet for this run).`
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, runId, selectedArtifact]);

  useLayoutEffect(() => {
    setSelectedArtifact('stdout');
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      setArtifactKeys([]);
      return;
    }
    void refreshArtifactKeys();
  }, [runId, refreshArtifactKeys]);

  useEffect(() => {
    if (!runId || !selectedRun) {
      setOutput('');
      return;
    }
    void fetchOutput();
  }, [runId, selectedArtifact, selectedRun?.run_id, fetchOutput]);

  useEffect(() => {
    if (!runId || !selectedRun || !isActiveLifecycle(selectedRun.lifecycle)) {
      return;
    }
    const t = window.setInterval(() => {
      void refreshArtifactKeys();
      void fetchOutput();
    }, 1000);
    return () => window.clearInterval(t);
  }, [runId, selectedRun?.lifecycle, refreshArtifactKeys, fetchOutput]);
  
  const downloadOutput = async () => {
    if (!runId) return;

    try {
      const blob = await downloadArtifact(apiUrl, runId, selectedArtifact);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${runId}_${selectedArtifact}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading output:', error);
      alert(error instanceof Error ? error.message : 'Error downloading output');
    }
  };

  const formatProver9Output = async () => {
    if (!runId) return;

    try {
      await launchProoftrans(apiUrl, {
        input: {
          kind: 'process_output',
          run_id: runId,
          artifact: selectedArtifact,
        },
        options: buildProoftransOptions(prooftransOption),
        delivery_mode: 'persisted',
      });
      void refreshRuns?.();
    } catch (error) {
      console.error('Error formatting output:', error);
      alert(error instanceof Error ? error.message : 'Error formatting output');
    }
  };

  const formatMace4Output = async () => {
    if (!runId) return;

    try {
      // Mace4 `stdout` is raw tool output (may include headers/separators).
      // For downstream LADR term readers (interpformat/isofilter), use the structured
      // model text artifact when available.
      const artifactForInput = artifactKeys.includes('models_text') ? 'models_text' : selectedArtifact;
      await launchInterpformat(apiUrl, {
        input: {
          kind: 'process_output',
          run_id: runId,
          artifact: artifactForInput,
        },
        options: { format: selectedFormat },
        delivery_mode: 'persisted',
      });
      void refreshRuns?.();
    } catch (error) {
      console.error('Error formatting output:', error);
      alert(error instanceof Error ? error.message : 'Error formatting output');
    }
  };

  const filterModels = async () => {
    if (!runId) return;

    try {
      const artifactForInput = artifactKeys.includes('models_text') ? 'models_text' : selectedArtifact;
      await launchIsofilter(apiUrl, {
        input: {
          kind: 'process_output',
          run_id: runId,
          artifact: artifactForInput,
        },
        options: {
          wrap: isofilterOptions.wrap,
          ignore_constants: isofilterOptions.ignore_constants,
        },
        delivery_mode: 'persisted',
      });
      void refreshRuns?.();
    } catch (error) {
      console.error('Error filtering models:', error);
      alert(error instanceof Error ? error.message : 'Error filtering models');
    }
  };

  if (!selectedRun) {
    return (
      <Card>
        <Card.Body>
          <Card.Title>Run Details</Card.Title>
          <p>Select a run to view details</p>
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
      `Status: ${formatLifecycleLabel(run.lifecycle)}`,
      `Delivery: ${run.delivery_mode}`,
      `Duration: ${formatDuration(duration)}`
    ];

    if (run.lifecycle === 'failed' && run.error) {
      info.push(`Error: ${run.error}`);
    }
    
    return info.join('\n');
  };

  const keysForSelect = artifactKeys.length > 0 ? artifactKeys : ['stdout'];
  const artifactSelectValue = keysForSelect.includes(selectedArtifact)
    ? selectedArtifact
    : keysForSelect[0];

  return (
    <Card>
      <Card.Body>
        <Card.Title>Run Details</Card.Title>
        <pre className="process-info">{formatRunInfo(selectedRun)}</pre>
        
        <hr />
        <div className="mb-3 d-flex align-items-center gap-2 flex-wrap">
          <Form.Label className="mb-0 small text-muted">Artifact</Form.Label>
          <Form.Select
            size="sm"
            style={{ maxWidth: 240 }}
            value={artifactSelectValue}
            onChange={(e) => setSelectedArtifact(e.target.value)}
            aria-label="Select output artifact"
          >
            {keysForSelect.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Form.Select>
        </div>
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
            {isLoading ? 'Loading…' : output || 'No output available'}
          </pre>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ProcessDetails;
