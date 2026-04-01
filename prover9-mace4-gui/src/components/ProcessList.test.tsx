import React from 'react';
import { render, screen } from '@testing-library/react';
import ProcessList from './ProcessList';
import { ProgramType, RunSummary } from '../types';

function makeRun(overrides: Partial<RunSummary>): RunSummary {
  return {
    run_id: 'run-1',
    name: 'Test Run',
    program: ProgramType.PROVER9,
    delivery_mode: 'persisted',
    lifecycle: 'running',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ProcessList lifecycle rendering', () => {
  test('maps "succeeded" to Completed badge and terminal actions', () => {
    render(
      <ProcessList
        runs={[makeRun({ lifecycle: 'succeeded' })]}
        selectedRunId={null}
        onSelectRun={jest.fn()}
        apiUrl="/api"
        refreshRuns={jest.fn()}
      />
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  test('maps "timed_out" to Timed Out badge and allows remove only', () => {
    render(
      <ProcessList
        runs={[makeRun({ lifecycle: 'timed_out' })]}
        selectedRunId={null}
        onSelectRun={jest.fn()}
        apiUrl="/api"
        refreshRuns={jest.fn()}
      />
    );

    expect(screen.getByText('Timed Out')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  test('shows Cancel and disables Remove while running', () => {
    render(
      <ProcessList
        runs={[makeRun({ lifecycle: 'running' })]}
        selectedRunId={null}
        onSelectRun={jest.fn()}
        apiUrl="/api"
        refreshRuns={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });
});
