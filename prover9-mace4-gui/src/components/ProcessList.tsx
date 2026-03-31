import React from 'react';
import { Table, Button, ButtonGroup, Badge } from 'react-bootstrap';
import { RunSummary } from '../types';
import { formatDuration } from '../utils';

interface ProcessListProps {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  apiUrl: string;
  refreshRuns: () => void | Promise<void>;
}

const ProcessList: React.FC<ProcessListProps> = ({ 
  runs, 
  selectedRunId, 
  onSelectRun, 
  apiUrl,
  refreshRuns
}) => {
  
  const cancelRun = async (runId: string) => {
    try {
      const response = await fetch(`${apiUrl}/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
      });
      
      if (response.ok) {
        void refreshRuns();
      } else {
        alert('Failed to cancel run');
      }
    } catch (error) {
      console.error('Error cancelling run:', error);
      alert('Error cancelling run');
    }
  };
  
  const removeRun = async (runId: string) => {
    try {
      const response = await fetch(`${apiUrl}/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        if (selectedRunId === runId) {
          onSelectRun(null);
        }
        void refreshRuns();
      } else {
        const msg = await response.json().catch(() => ({}));
        console.error(apiUrl, msg);
        alert('Failed to remove run');
      }
    } catch (error) {
      console.error('Error removing run:', error);
      alert('Error removing run');
    }
  };

  const getStatusBadge = (lifecycle: string) => {
    switch (lifecycle) {
      case 'running':
        return <Badge key="running" bg="success">Running</Badge>;
      case 'completed':
        return <Badge key="completed" bg="primary">Completed</Badge>;
      case 'failed':
        return <Badge key="failed" bg="danger">Failed</Badge>;
      case 'cancelled':
        return <Badge key="cancelled" bg="warning">Cancelled</Badge>;
      case 'queued':
        return <Badge key="queued" bg="info">Queued</Badge>;
      default:
        return <Badge key={lifecycle} bg="secondary">{lifecycle}</Badge>;
    }
  };

  const calculateDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const durationMs = now.getTime() - start.getTime();
    return formatDuration(durationMs / 1000);
  };

  const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

  return (
    <div className="process-list">
      <h3>Process List</h3>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Name</th>
            <th>Program</th>
            <th>Delivery</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr key="processempty-state">
              <td colSpan={7} className="text-center">No runs</td>
            </tr>
          ) : (
            runs.map(run => {
              return (
                <tr 
                  key={`run-${run.run_id}`} 
                  className={selectedRunId === run.run_id ? 'table-active' : ''}
                  onClick={() => onSelectRun(run.run_id)}
                >
                  <td title={run.run_id}>{shortId(run.run_id)}</td>
                  <td>{run.name || 'Unnamed'}</td>
                  <td>{run.program}</td>
                  <td>{run.delivery_mode}</td>
                  <td>
                    {getStatusBadge(run.lifecycle)}
                    {run.source_run_id && (
                      <span className="text-muted small ms-1" title={run.source_run_id}>
                        (from {shortId(run.source_run_id)})
                      </span>
                    )}
                  </td>
                  <td>{calculateDuration(run.created_at)}</td>
                  <td>
                    <ButtonGroup size="sm">
                      {run.lifecycle === 'running' && (
                        <Button 
                          key="cancel"
                          variant="danger" 
                          onClick={(e) => { e.stopPropagation(); cancelRun(run.run_id); }}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button 
                        key="remove"
                        variant="secondary" 
                        onClick={(e) => { e.stopPropagation(); removeRun(run.run_id); }}
                      >
                        Remove
                      </Button>
                    </ButtonGroup>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
};

export default ProcessList;
