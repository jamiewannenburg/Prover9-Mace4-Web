import React, { useState, useEffect, useMemo, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col, Tabs, Tab, Alert } from 'react-bootstrap';
import FormulasPanel from './components/FormulasPanel';
import LanguageOptionsPanel from './components/LanguageOptionsPanel';
import Prover9OptionsPanel from './components/Prover9OptionsPanel';
import Mace4OptionsPanel from './components/Mace4OptionsPanel';
import AdditionalInputPanel from './components/AdditionalInputPanel';
import RunPanel from './components/RunPanel';
import ProcessList from './components/ProcessList';
import ProcessDetails from './components/ProcessDetails';
import ApiConfig from './components/ApiConfig';
import { ActiveStreamRun, RunSummary } from './types';
import { FormulaProvider } from './context/FormulaContext';
import { Mace4OptionsProvider } from './context/Mace4OptionsContext';
import { Prover9OptionsProvider } from './context/Prover9OptionsContext';
import { LanguageOptionsProvider } from './context/LanguageOptionsContext';
import { AdditionalOptionsProvider } from './context/AdditionalOptionsContext';
import './App.css';

function mergePersistedWithActiveStreams(
  persisted: RunSummary[],
  active: ActiveStreamRun[]
): RunSummary[] {
  const ids = new Set(persisted.map((r) => r.run_id));
  const extras: RunSummary[] = active
    .filter((a) => !ids.has(a.runId))
    .map((a) => ({
      run_id: a.runId,
      program: a.program,
      delivery_mode: 'stream',
      lifecycle: 'running',
      created_at: new Date().toISOString(),
      name: null,
    }));
  return [...persisted, ...extras];
}

function App() {
  const [apiUrl, setApiUrl] = useState<string>(() => {
    return localStorage.getItem('prover9_api_url') || process.env.REACT_APP_API_URL ||'/api';
  });
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeStreamRuns, setActiveStreamRuns] = useState<ActiveStreamRun[]>([]);
  const [apiConfigured, setApiConfigured] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const displayRuns = useMemo(
    () => mergePersistedWithActiveStreams(runs, activeStreamRuns),
    [runs, activeStreamRuns]
  );

  // Drop client-only stream rows once the same run_id appears in persisted `GET /runs`.
  useEffect(() => {
    const ids = new Set(runs.map((r) => r.run_id));
    setActiveStreamRuns((prev) => prev.filter((a) => !ids.has(a.runId)));
  }, [runs]);

  // Handle page refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Set a flag in sessionStorage to indicate this is a refresh
      sessionStorage.setItem('isRefresh', 'true');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Check if this is a refresh
    const isRefresh = sessionStorage.getItem('isRefresh') === 'true';
    if (isRefresh) {
      // Clear all localStorage items except the API URL
      // const apiUrl = localStorage.getItem('prover9_api_url');
      localStorage.clear();
      // if (apiUrl) {
      //   localStorage.setItem('prover9_api_url', apiUrl);
      // }
      // Clear the refresh flag
      sessionStorage.removeItem('isRefresh');
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const saveApiUrl = (url: string) => {
    localStorage.setItem('prover9_api_url', url);
    setApiUrl(url);
    setApiConfigured(true);
  };

  useEffect(() => {
    const storedUrl = localStorage.getItem('prover9_api_url');
    if (storedUrl) {
      setApiUrl(storedUrl);
      setApiConfigured(true);
    }
    else if (process.env.REACT_APP_API_URL) {
      setApiUrl(process.env.REACT_APP_API_URL);
      setApiConfigured(true);
    }
  }, []);

  const refreshRuns = useCallback(async () => {
    const listUrl = `${apiUrl}/runs`;
    try {
      const response = await fetch(listUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        setError(`Failed to fetch runs: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        console.error('Invalid response format:', data);
        setError('Invalid response format from API');
        return;
      }

      setRuns(data as RunSummary[]);
    } catch (err) {
      console.error('API Error:', {
        url: listUrl,
        error: err instanceof Error ? err.message : String(err)
      });
      setError('API server not available');
    }
  }, [apiUrl]);

  useEffect(() => {
    if (apiConfigured) {
      refreshRuns();
      const intervalId = setInterval(refreshRuns, 3000);
      return () => clearInterval(intervalId);
    }
  }, [apiConfigured, apiUrl, refreshRuns]);

  const handleRunSelection = (runId: string | null) => {
    setSelectedRunId(runId);
  };

  const handleStreamRunStarted = useCallback((run: ActiveStreamRun) => {
    setActiveStreamRuns((prev) => {
      if (prev.some((r) => r.runId === run.runId)) {
        return prev;
      }
      return [...prev, run];
    });
  }, []);

  if (!apiConfigured) {
    return <ApiConfig onSave={saveApiUrl} initialValue={apiUrl} />;
  }

  return (
    <FormulaProvider>
      <Mace4OptionsProvider>
        <Prover9OptionsProvider>
          <LanguageOptionsProvider>
            <AdditionalOptionsProvider>
              <Container fluid className="app-container">
                {/* <header className="app-header">
                  <img src="prover9-5a-128t.gif" alt={BANNER} className="app-logo" />
                  <span className="app-logo-separator"></span>
                  <img src="mace4-90t.gif" alt={BANNER} className="app-logo" />
                </header> */}
                
                {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

                {activeStreamRuns.length > 0 && (
                  <Alert variant="info" className="mb-3" dismissible onClose={() => setActiveStreamRuns([])}>
                    {activeStreamRuns.length} stream-only run(s) are shown in the list until they finish and appear in server history.
                  </Alert>
                )}
                
                <Row className="mb-3">
                  <Col>
                    <RunPanel
                      apiUrl={apiUrl}
                      refreshRuns={refreshRuns}
                      onStreamRunStarted={handleStreamRunStarted}
                    />
                  </Col>
                </Row>
                
                <Row className="mb-3">
                  <Col>
                    <Tabs defaultActiveKey="formulas" className="mb-3">
                      <Tab eventKey="formulas" title="Formulas">
                        <FormulasPanel apiUrl={apiUrl} />
                      </Tab>
                      <Tab eventKey="language" title="Language Options">
                        <LanguageOptionsPanel />
                      </Tab>
                      <Tab eventKey="prover9" title="Prover9 Options">
                        <Prover9OptionsPanel />
                      </Tab>
                      <Tab eventKey="mace4" title="Mace4 Options">
                        <Mace4OptionsPanel />
                      </Tab>
                      <Tab eventKey="additional" title="Additional Input">
                        <AdditionalInputPanel />
                      </Tab>
                    </Tabs>
                  </Col>
                </Row>
                
                <Row>
                  <Col md={8}>
                    <ProcessList 
                      runs={displayRuns} 
                      selectedRunId={selectedRunId}
                      onSelectRun={handleRunSelection}
                      apiUrl={apiUrl}
                      refreshRuns={refreshRuns}
                    />
                  </Col>
                  <Col md={4}>
                    <ProcessDetails 
                      runId={selectedRunId} 
                      runs={displayRuns}
                      apiUrl={apiUrl}
                      refreshRuns={refreshRuns}
                    />
                  </Col>
                </Row>
              </Container>
            </AdditionalOptionsProvider>
          </LanguageOptionsProvider>
        </Prover9OptionsProvider>
      </Mace4OptionsProvider>
    </FormulaProvider>
  );
}

export default App;
