import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, Button, Badge, Tab, Tabs } from 'react-bootstrap';
import { ProgramType, StreamEvent as StreamEventPayload } from '../types';
import { resolveStreamUrl } from '../api/runs';

function formatModelData(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export interface StreamRunOutputProps {
  apiUrl: string;
  runId: string;
  streamUrl: string;
  program: ProgramType;
  onRemove: () => void;
  /** Called once when the run ends (completed, error, or SSE `end`). */
  onFinished?: () => void | Promise<void>;
}

/**
 * Subscribes to `GET /runs/{id}/stream` (SSE) and shows stdout / stderr / model chunks.
 * Matches server events: `started`, `stdout`, `stderr`, `model`, `completed`, `error`, `end`.
 */
const StreamRunOutput: React.FC<StreamRunOutputProps> = ({
  apiUrl,
  runId,
  streamUrl,
  program,
  onRemove,
  onFinished,
}) => {
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'connecting' | 'live' | 'done'>('connecting');
  const finishedRef = useRef(false);

  const markFinished = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    void onFinished?.();
  }, [onFinished]);

  useEffect(() => {
    finishedRef.current = false;
    const url = resolveStreamUrl(apiUrl, streamUrl);
    const es = new EventSource(url);

    const parsePayload = (ev: MessageEvent): StreamEventPayload | null => {
      try {
        return JSON.parse(ev.data as string) as StreamEventPayload;
      } catch {
        return null;
      }
    };

    const onStarted = (ev: MessageEvent) => {
      setPhase('live');
      parsePayload(ev);
    };

    const onStdout = (ev: MessageEvent) => {
      const p = parsePayload(ev);
      if (p?.data != null && typeof p.data === 'string') {
        setStdout((s) => s + p.data);
      }
    };

    const onStderr = (ev: MessageEvent) => {
      const p = parsePayload(ev);
      if (p?.data != null && typeof p.data === 'string') {
        setStderr((s) => s + p.data);
      }
    };

    const onModel = (ev: MessageEvent) => {
      const p = parsePayload(ev);
      if (p?.data !== undefined && p.data !== null) {
        setModels((prev) => [...prev, formatModelData(p.data)]);
      }
    };

    const onCompleted = (_ev: MessageEvent) => {
      markFinished();
      es.close();
    };

    const onAppError = (ev: MessageEvent) => {
      const p = parsePayload(ev);
      const msg =
        typeof p?.data === 'string'
          ? p.data
          : p?.data != null
            ? formatModelData(p.data)
            : 'run failed';
      setStreamError(msg);
      markFinished();
      es.close();
    };

    const onEnd = (_ev: MessageEvent) => {
      markFinished();
      es.close();
    };

    /** SSE `event: error` — application-level failure (distinct from connection errors). */
    const onNamedError = (ev: Event) => {
      if (ev instanceof MessageEvent && typeof ev.data === 'string' && ev.data.length > 0) {
        onAppError(ev);
      }
    };

    es.addEventListener('started', onStarted);
    es.addEventListener('stdout', onStdout);
    es.addEventListener('stderr', onStderr);
    es.addEventListener('model', onModel);
    es.addEventListener('completed', onCompleted);
    es.addEventListener('error', onNamedError);
    es.addEventListener('end', onEnd);

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !finishedRef.current) {
        setStreamError((prev) => prev ?? 'Stream connection closed');
        markFinished();
      }
    };

    return () => {
      es.removeEventListener('started', onStarted);
      es.removeEventListener('stdout', onStdout);
      es.removeEventListener('stderr', onStderr);
      es.removeEventListener('model', onModel);
      es.removeEventListener('completed', onCompleted);
      es.removeEventListener('error', onNamedError);
      es.removeEventListener('end', onEnd);
      es.onerror = null;
      es.close();
    };
  }, [apiUrl, streamUrl, runId, markFinished]);

  const badge =
    phase === 'connecting' ? (
      <Badge bg="secondary">Connecting</Badge>
    ) : phase === 'live' ? (
      <Badge bg="primary">Live</Badge>
    ) : (
      <Badge bg="success">Finished</Badge>
    );

  return (
    <Card className="stream-run-output mb-3">
      <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2 py-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="fw-semibold">Stream output</span>
          {badge}
          <span className="text-muted small font-monospace">{program}</span>
          <span className="text-muted small font-monospace">{runId}</span>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={onRemove}>
          Dismiss
        </Button>
      </Card.Header>
      <Card.Body className="pt-2">
        {streamError && (
          <div className="text-danger small mb-2" role="alert">
            {streamError}
          </div>
        )}
        <Tabs defaultActiveKey="stdout" className="stream-run-tabs mb-0">
          <Tab eventKey="stdout" title={`stdout (${stdout.length})`}>
            <pre className="stream-run-pre small mb-0">{stdout || '—'}</pre>
          </Tab>
          <Tab eventKey="stderr" title={`stderr (${stderr.length})`}>
            <pre className="stream-run-pre small mb-0 text-danger">{stderr || '—'}</pre>
          </Tab>
          <Tab eventKey="models" title={`models (${models.length})`}>
            <pre className="stream-run-pre small mb-0">{models.length ? models.join('\n---\n') : '—'}</pre>
          </Tab>
        </Tabs>
      </Card.Body>
    </Card>
  );
};

export default StreamRunOutput;
