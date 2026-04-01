import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import StreamRunOutput from './StreamRunOutput';
import { ProgramType } from '../types';

type Handler = (event: Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CLOSED = 2;
  static OPEN = 1;
  readonly url: string;
  readyState = MockEventSource.OPEN;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  private listeners = new Map<string, Set<Handler>>();
  close = jest.fn(() => {
    this.readyState = MockEventSource.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: Handler): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: Handler): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string, data?: unknown): void {
    const ev = new MessageEvent(type, {
      data: data == null ? '' : JSON.stringify(data),
    });
    this.listeners.get(type)?.forEach((h) => h(ev));
  }
}

describe('StreamRunOutput', () => {
  const originalEventSource = global.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    (global as typeof globalThis & { EventSource: typeof EventSource }).EventSource =
      MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    (global as typeof globalThis & { EventSource: typeof EventSource }).EventSource =
      originalEventSource;
    jest.restoreAllMocks();
  });

  test('handles terminal alias event "succeeded" and finishes once', async () => {
    const onFinished = jest.fn();
    render(
      <StreamRunOutput
        apiUrl="/api"
        runId="run-123"
        streamUrl="/runs/run-123/stream"
        program={ProgramType.PROVER9}
        onRemove={jest.fn()}
        onFinished={onFinished}
      />
    );

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    act(() => {
      es.emit('succeeded');
    });

    await waitFor(() => {
      expect(screen.getByText('Finished')).toBeInTheDocument();
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(es.close).toHaveBeenCalledTimes(1);
  });

  test('finishes when stdout payload carries terminal lifecycle alias', async () => {
    const onFinished = jest.fn();
    render(
      <StreamRunOutput
        apiUrl="/api"
        runId="run-456"
        streamUrl="/runs/run-456/stream"
        program={ProgramType.MACE4}
        onRemove={jest.fn()}
        onFinished={onFinished}
      />
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('stdout', {
        event: 'stdout',
        run_id: 'run-456',
        program: ProgramType.MACE4,
        lifecycle: 'timed_out',
        data: 'partial output',
        ts: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Finished')).toBeInTheDocument();
    });
    expect(screen.getByText('partial output')).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
