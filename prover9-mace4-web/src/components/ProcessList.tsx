import React from 'react';
import { Table, Button, ButtonGroup, Badge } from 'react-bootstrap';
import { Process, ProcessState } from '../types';
import { formatDuration } from '../utils';

interface ProcessListProps {
  processes: Process[];
  selectedProcess: number | null;
  onSelectProcess: (id: number | null) => void;
  apiUrl: string;
  refreshProcesses: () => void;
}

const ProcessList: React.FC<ProcessListProps> = ({ 
  processes, 
  selectedProcess, 
  onSelectProcess, 
  apiUrl,
  refreshProcesses
}) => {
  
  const killProcess = async (id: number) => {
    try {
      const response = await fetch(`${apiUrl}/kill/${id}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        refreshProcesses();
      } else {
        alert('Failed to kill process');
      }
    } catch (error) {
      console.error('Error killing process:', error);
      alert('Error killing process');
    }
  };
  
  const pauseProcess = async (id: number) => {
    try {
      const response = await fetch(`${apiUrl}/pause/${id}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        refreshProcesses();
      } else {
        alert('Failed to pause process');
      }
    } catch (error) {
      console.error('Error pausing process:', error);
      alert('Error pausing process');
    }
  };
  
  const resumeProcess = async (id: number) => {
    try {
      const response = await fetch(`${apiUrl}/resume/${id}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        refreshProcesses();
      } else {
        alert('Failed to resume process');
      }
    } catch (error) {
      console.error('Error resuming process:', error);
      alert('Error resuming process');
    }
  };
  
  const removeProcess = async (id: number) => {
    try {
      const response = await fetch(`${apiUrl}/remove/${id}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        if (selectedProcess === id) {
          onSelectProcess(null);
        }
        refreshProcesses();
      } else {
        alert('Failed to remove process');
      }
    } catch (error) {
      console.error('Error removing process:', error);
      alert('Error removing process');
    }
  };

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'running':
        return <Badge key="running" bg="success">Running</Badge>;
      case 'completed':
        return <Badge key="completed" bg="primary">Completed</Badge>;
      case 'failed':
        return <Badge key="failed" bg="danger">Failed</Badge>;
      case 'paused':
        return <Badge key="paused" bg="warning">Paused</Badge>;
      default:
        return <Badge key={state} bg="secondary">{state}</Badge>;
    }
  };

  const calculateDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const durationMs = now.getTime() - start.getTime();
    return formatDuration(durationMs / 1000);
  };

  return (
    <div className="process-list">
      <h3>Process List</h3>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>ID</th>
            <th>Program</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {processes.length === 0 ? (
            <tr key="processempty-state">
              <td colSpan={5} className="text-center">No processes running</td>
            </tr>
          ) : (
            processes.map(process => (
              <tr 
                key={`process-${process.id}`} 
                className={selectedProcess === process.id ? 'table-active' : ''}
                onClick={() => onSelectProcess(process.id)}
              >
                <td>{process.id}</td>
                <td>{process.program}</td>
                <td>{getStatusBadge(process.state)}</td>
                <td>{calculateDuration(process.start_time)}</td>
                <td>
                  <ButtonGroup size="sm">
                    {process.state === ProcessState.RUNNING && (
                      <Button 
                        key="pause"
                        variant="warning" 
                        onClick={(e) => { e.stopPropagation(); pauseProcess(process.id); }}
                      >
                        Pause
                      </Button>
                    )}
                    {process.state === ProcessState.SUSPENDED && (
                      <Button 
                        key="resume"
                        variant="success" 
                        onClick={(e) => { e.stopPropagation(); resumeProcess(process.id); }}
                      >
                        Resume
                      </Button>
                    )}
                    {process.state === ProcessState.RUNNING && (
                      <Button 
                        key="kill"
                        variant="danger" 
                        onClick={(e) => { e.stopPropagation(); killProcess(process.id); }}
                      >
                        Kill
                      </Button>
                    )}
                    <Button 
                      key="remove"
                      variant="secondary" 
                      onClick={(e) => { e.stopPropagation(); removeProcess(process.id); }}
                    >
                      Remove
                    </Button>
                  </ButtonGroup>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
};

export default ProcessList; 