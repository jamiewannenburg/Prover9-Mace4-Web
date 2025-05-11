import React, { useEffect, useState } from 'react';
import { Card, Button, ButtonGroup } from 'react-bootstrap';
import { Process } from '../types';
import { formatDuration } from '../utils';

interface ProcessDetailsProps {
  processId: number | null;
  processes: Process[];
  apiUrl: string;
}

const ProcessDetails: React.FC<ProcessDetailsProps> = ({ processId, processes, apiUrl }) => {
  const [output, setOutput] = useState<string>('');
  
  const selectedProcess = processes.find(p => p.id === processId);
  
  useEffect(() => {
    if (!processId) {
      setOutput('');
      return;
    }
    
    const fetchOutput = async () => {
      try {
        const response = await fetch(`${apiUrl}/output/${processId}`);
        if (response.ok) {
          const data = await response.json();
          setOutput(data.output || 'No output available');
        } else {
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
      return () => clearInterval(intervalId);
    }
  }, [processId, apiUrl, selectedProcess?.state]);
  
  const downloadOutput = async () => {
    if (!processId) return;
    
    try {
      const response = await fetch(`${apiUrl}/download/${processId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `output_${processId}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download output');
      }
    } catch (error) {
      console.error('Error downloading output:', error);
      alert('Error downloading output');
    }
  };
  
  const formatProver9Output = async () => {
    if (!processId) return;
    
    try {
      const response = await fetch(`${apiUrl}/format_prover9_output/${processId}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        setOutput(data.formatted_output || 'No formatted output available');
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
      const response = await fetch(`${apiUrl}/format_mace4_output/${processId}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        setOutput(data.formatted_output || 'No formatted output available');
      } else {
        alert('Failed to format output');
      }
    } catch (error) {
      console.error('Error formatting output:', error);
      alert('Error formatting output');
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

  return (
    <Card>
      <Card.Body>
        <Card.Title>Process Details</Card.Title>
        <pre className="process-info">{formatProcessInfo(selectedProcess)}</pre>
        
        <hr />
        
        <div className="mb-3">
          <ButtonGroup>
            <Button variant="outline-primary" size="sm" onClick={downloadOutput}>
              Download
            </Button>
            {selectedProcess.program === 'prover9' && (
              <Button variant="outline-success" size="sm" onClick={formatProver9Output}>
                Format Output
              </Button>
            )}
            {selectedProcess.program === 'mace4' && (
              <Button variant="outline-success" size="sm" onClick={formatMace4Output}>
                Format Output
              </Button>
            )}
          </ButtonGroup>
        </div>
        
        <div className="output-container">
          <h5>Output</h5>
          <pre className="output-text p-2 border bg-light" style={{ maxHeight: '500px', overflow: 'auto' }}>
            {output}
          </pre>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ProcessDetails; 