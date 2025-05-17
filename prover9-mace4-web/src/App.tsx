import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col, Tabs, Tab, Button, Alert } from 'react-bootstrap';
import FormulasPanel from './components/FormulasPanel';
import LanguageOptionsPanel from './components/LanguageOptionsPanel';
import Prover9OptionsPanel from './components/Prover9OptionsPanel';
import Mace4OptionsPanel from './components/Mace4OptionsPanel';
import AdditionalInputPanel from './components/AdditionalInputPanel';
import RunPanel from './components/RunPanel';
import ProcessList from './components/ProcessList';
import ProcessDetails from './components/ProcessDetails';
import ApiConfig from './components/ApiConfig';
import { Process } from './types';
import { FormulaProvider } from './context/FormulaContext';
import { Mace4OptionsProvider } from './context/Mace4OptionsContext';
import { Prover9OptionsProvider } from './context/Prover9OptionsContext';
import { LanguageOptionsProvider } from './context/LanguageOptionsContext';
import { AdditionalOptionsProvider } from './context/AdditionalOptionsContext';
import './App.css';

const PROGRAM_NAME = 'Prover9-Mace4';
const PROGRAM_VERSION = '0.5 Web';
const PROGRAM_DATE = 'May 2025';
const BANNER = `${PROGRAM_NAME} Version ${PROGRAM_VERSION}, ${PROGRAM_DATE}`;

function App() {
  const [apiUrl, setApiUrl] = useState<string>(() => {
    return localStorage.getItem('prover9_api_url') || 'http://localhost:8000';
  });
  const [processes, setProcesses] = useState<Process[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  const updateProcessList = async () => {
    const processUrl = `${apiUrl}/processes`
    try {
      const response = await fetch(processUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        setError(`Failed to fetch processes: ${response.status} ${response.statusText}`);
        return;
      }
      
      const processIds = await response.json();
      if (!Array.isArray(processIds)) {
        console.error('Invalid response format:', processIds);
        setError('Invalid response format from API');
        return;
      }

      // Fetch full details for each process
      const processDetails = await Promise.all(
        processIds.map(async (id) => {
          const detailResponse = await fetch(`${apiUrl}/status/${id}`);
          if (detailResponse.ok) {
            const data = await detailResponse.json();
            // Transform the data to match our Process interface
            return {
              ...data,
              id: id  // Map the process ID to the id field
            };
          }
          console.error(`Failed to fetch details for process ${id}`);
          return null;
        })
      );

      // Filter out any failed fetches and update state
      const validProcesses = processDetails.filter((p): p is Process => p !== null);
      setProcesses(validProcesses);
    } catch (err) {
      console.error('API Error:', {
        url: processUrl,
        error: err instanceof Error ? err.message : String(err)
      });
      setError('API server not available');
    }
  };

  useEffect(() => {
    if (apiConfigured) {
      updateProcessList();
      const intervalId = setInterval(updateProcessList, 3000);
      return () => clearInterval(intervalId);
    }
  }, [apiConfigured, apiUrl]);

  const handleProcessSelection = (id: number | null) => {
    setSelectedProcess(id);
  };

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
                <header className="app-header">
                  <img src="prover9-5a-128t.gif" alt={BANNER} className="app-logo" />
                  <span className="app-logo-separator"></span>
                  <img src="mace4-90t.gif" alt={BANNER} className="app-logo" />
                </header>
                
                {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
                
                <Row className="mb-3">
                  <Col>
                    <RunPanel apiUrl={apiUrl} />
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
                      processes={processes} 
                      selectedProcess={selectedProcess}
                      onSelectProcess={handleProcessSelection}
                      apiUrl={apiUrl}
                      refreshProcesses={updateProcessList}
                    />
                  </Col>
                  <Col md={4}>
                    <ProcessDetails 
                      processId={selectedProcess} 
                      processes={processes}
                      apiUrl={apiUrl}
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
