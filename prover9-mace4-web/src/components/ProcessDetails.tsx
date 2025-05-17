import React, { useEffect, useState } from 'react';
import { Card, Button, ButtonGroup, Form } from 'react-bootstrap';
import { Process, INTERP_FORMATS, InterpFormat, ProoftransOption, PROOFTRANS_OPTIONS } from '../types';
import { formatDuration } from '../utils';

interface ProcessDetailsProps {
  processId: number | null;
  processes: Process[];
  apiUrl: string;
}

const ProcessDetails: React.FC<ProcessDetailsProps> = ({ processId, processes, apiUrl }) => {
  const [output, setOutput] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<string>('standard');
  const [prooftransOption, setProoftransOption] = useState<ProoftransOption>(PROOFTRANS_OPTIONS[0]);
  const [isofilterOptions, setIsofilterOptions] = useState({
    wrap: false,
    ignore_constants: false
  });
  // const [prooftransLabel, setProoftransLabel] = useState<string>('');
  
  const selectedProcess = processes.find(p => p.id === processId);
  
  useEffect(() => {
    if (!processId) {
      setOutput('');
      return;
    }
    
    const fetchOutput = async () => {
      try {
        const response = await fetch(`${apiUrl}/status/${processId}`);
        if (response.ok) {
          const data = await response.json();
          setOutput(data.output || 'No output available');
        } else {
          const errorText = await response.text();
          console.error('Failed to fetch output:', errorText);
          setOutput('Failed to fetch output');
        }
      } catch (error) {
        console.error('Error fetching output:', error);
        setOutput('Error fetching output');
      }
    };
    
    fetchOutput();
    
    // Set up polling for output if process is running
    if (selectedProcess?.state === 'running') {
      const intervalId = setInterval(fetchOutput, 3000);
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [processId, apiUrl, selectedProcess]);
  
  const downloadOutput = async () => {
    if (!processId || !output) return;
    
    try {
      // Create a blob from the output text
      const blob = new Blob([output], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link element
      const a = document.createElement('a');
      a.href = url;
      a.download = `output_${processId}.txt`;
      
      // Append to body, click, and cleanup
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading output:', error);
      alert('Error downloading output');
    }
  };
  
  const formatProver9Output = async () => {
    if (!processId) return;
    
    try {
      const response = await fetch(`${apiUrl}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: 'prooftrans',
          input: output,
          options: {
            format: prooftransOption.format,
          },
          ...(prooftransOption.parents_only && { parents_only: true }),
          ...(prooftransOption.expand && { expand: true }),
          ...(prooftransOption.renumber && { renumber: true }),
          ...(prooftransOption.striplabels && { striplabels: true }),
          //...(prooftransOptions.hints && prooftransLabel ? { label: prooftransLabel } : {})
        }),
      });
      
      if (response.ok) {
        // Process started successfully
        const data = await response.json();
        // Start polling for the new process output
        const pollInterval = setInterval(async () => {
          const statusResponse = await fetch(`${apiUrl}/status/${data.process_id}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.state === 'done') {
              setOutput(statusData.output || 'No formatted output available');
              clearInterval(pollInterval);
            }
          }
        }, 1000);
      } else {
        alert('Failed to format output');
      }
    } catch (error) {
      console.error('Error formatting output:', error);
      alert('Error formatting output');
    }
  };
  
  const formatMace4Output = async () => {
    if (!processId) return;
    
    try {
      const response = await fetch(`${apiUrl}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: 'interpformat',
          input: output,
          options: {
            format: selectedFormat
          }
        }),
      });
      
      if (response.ok) {
        // Process started successfully
        const data = await response.json();
        // Start polling for the new process output
        const pollInterval = setInterval(async () => {
          const statusResponse = await fetch(`${apiUrl}/status/${data.process_id}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.state === 'done') {
              setOutput(statusData.output || 'No formatted output available');
              clearInterval(pollInterval);
            }
          }
        }, 1000);
      } else {
        alert('Failed to format output');
      }
    } catch (error) {
      console.error('Error formatting output:', error);
      alert('Error formatting output');
    }
  };

  const filterModels = async () => {
    if (!processId) return;
    
    try {
      const response = await fetch(`${apiUrl}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: 'isofilter',
          input: output,
          options: isofilterOptions
        }),
      });
      
      if (response.ok) {
        // Process started successfully
        const data = await response.json();
        // Start polling for the new process output
        const pollInterval = setInterval(async () => {
          const statusResponse = await fetch(`${apiUrl}/status/${data.process_id}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.state === 'done') {
              setOutput(statusData.output || 'No filtered output available');
              clearInterval(pollInterval);
            }
          }
        }, 1000);
      } else {
        alert('Failed to filter models');
      }
    } catch (error) {
      console.error('Error filtering models:', error);
      alert('Error filtering models');
    }
  };

  if (!selectedProcess) {
    return (
      <Card>
        <Card.Body>
          <Card.Title>Process Details</Card.Title>
          <p>Select a process to view details</p>
        </Card.Body>
      </Card>
    );
  }

  const formatProcessInfo = (process: Process) => {
    const startTime = new Date(process.start_time);
    const duration = (new Date().getTime() - startTime.getTime()) / 1000;
    
    const info = [
      `Program: ${process.program}`,
      `Status: ${process.state}`,
      `Duration: ${formatDuration(duration)}`
    ];
    
    if (process.stats) {
      const stats = process.stats;
      if (process.program === 'prover9') {
        info.push(
          `Given: ${stats.given || '?'}`,
          `Generated: ${stats.generated || '?'}`,
          `Kept: ${stats.kept || '?'}`,
          `Proofs: ${stats.proofs || '?'}`,
          `CPU Time: ${stats.cpu_time || '?'}s`
        );
      } else if (process.program === 'mace4') {
        info.push(
          `Domain Size: ${stats.domain_size || '?'}`,
          `Models: ${stats.models || '?'}`,
          `CPU Time: ${stats.cpu_time || '?'}s`
        );
      }
    }
    
    if (process.resource_usage) {
      const usage = process.resource_usage;
      info.push(
        `CPU: ${usage.cpu_percent || '?'}%`,
        `Memory: ${usage.memory_percent || '?'}%`
      );
    }
    
    return info.join('\n');
  };

  // const handleProoftransOptionChange = (option: ProoftransOptions) => {
  //   setProoftransOptions(prev => ({
  //     ...prev,
  //     [option]: !prev[option]
  //   }));
  // };

  return (
    <Card>
      <Card.Body>
        <Card.Title>Process Details</Card.Title>
        <pre className="process-info">{formatProcessInfo(selectedProcess)}</pre>
        
        <hr />
        {selectedProcess.program === 'prover9' && (
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
                      checked={prooftransOption.parents_only}
                      onChange={() => setProoftransOption({ ...prooftransOption, parents_only: !prooftransOption.parents_only })}
                      className="d-inline-block me-2"
                    />
                  )}
                  {prooftransOption.expand !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Expand"
                      checked={prooftransOption.expand}
                      onChange={() => setProoftransOption({ ...prooftransOption, expand: !prooftransOption.expand })}
                      className="d-inline-block me-2"
                    />
                  )}
                  {prooftransOption.renumber !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Renumber"
                      checked={prooftransOption.renumber}
                      onChange={() => setProoftransOption({ ...prooftransOption, renumber: !prooftransOption.renumber })}
                      className="d-inline-block me-2"
                    />
                  )}
                  {prooftransOption.striplabels !== undefined && (
                    <Form.Check
                      type="checkbox"
                      label="Strip Labels"
                      checked={prooftransOption.striplabels}
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

        {selectedProcess.program === 'mace4' && (
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
        
        <div className="output-container">
          <h5>Output</h5>
          <pre className="output-text p-2 border bg-light" style={{ maxHeight: '500px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {output || 'No output available'}
          </pre>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ProcessDetails; 