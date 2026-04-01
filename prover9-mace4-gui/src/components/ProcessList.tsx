import React from 'react';
import { Table, Button, ButtonGroup, Badge } from 'react-bootstrap';
import { cancelRun as cancelRunRequest, deleteRun as deleteRunRequest } from '../api/runs';
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
  const normalizeLifecycle = (lifecycle: string): string => lifecycle.trim().toLowerCase();
  const isTerminalLifecycle = (lifecycle: string): boolean =>
    ['completed', 'succeeded', 'failed', 'cancelled', 'timed_out'].includes(normalizeLifecycle(lifecycle));
  const canCancelRun = (lifecycle: string): boolean =>
    ['queued', 'running'].includes(normalizeLifecycle(lifecycle));
  
  const handleCancelRun = async (runId: string) => {
    try {
      await cancelRunRequest(apiUrl, runId);
      void refreshRuns();
    } catch (error) {
      console.error('Error cancelling run:', error);
      alert('Failed to cancel run');
    }
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await deleteRunRequest(apiUrl, runId);
      if (selectedRunId === runId) {
        onSelectRun(null);
      }
      void refreshRuns();
    } catch (error) {
      console.error('Error removing run:', error);
      alert('Failed to remove run');
    }
  };

  const getStatusBadge = (lifecycle: string) => {
    const normalized = normalizeLifecycle(lifecycle);
    switch (normalized) {
      case 'queued':
        return <Badge key="queued" bg="info">Queued</Badge>;
      case 'running':
        return <Badge key="running" bg="success">Running</Badge>;
      case 'completed':
      case 'succeeded':
        return <Badge key="completed" bg="primary">Completed</Badge>;
      case 'timed_out':
        return <Badge key="timed_out" bg="warning">Timed Out</Badge>;
      case 'failed':
        return <Badge key="failed" bg="danger">Failed</Badge>;
      case 'cancelled':
        return <Badge key="cancelled" bg="secondary">Cancelled</Badge>;
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
      <h3>Run List</h3>
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
            <tr key="run-empty-state">
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
                      <span
                        className="text-muted small ms-1"
                        title={
                          run.source_artifact
                            ? `${run.source_run_id} · ${run.source_artifact}`
                            : run.source_run_id
                        }
                      >
                        (from {shortId(run.source_run_id)}
                        {run.source_artifact ? ` · ${run.source_artifact}` : ''})
                      </span>
                    )}
                  </td>
                  <td>{calculateDuration(run.created_at)}</td>
                  <td>
                    <ButtonGroup size="sm">
                      {canCancelRun(run.lifecycle) && (
                        <Button 
                          key="cancel"
                          variant="danger" 
                          onClick={(e) => { e.stopPropagation(); void handleCancelRun(run.run_id); }}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button 
                        key="remove"
                        variant="secondary" 
                        disabled={!isTerminalLifecycle(run.lifecycle)}
                        onClick={(e) => { e.stopPropagation(); void handleDeleteRun(run.run_id); }}
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
