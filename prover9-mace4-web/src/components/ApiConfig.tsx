import React, { useState } from 'react';
import { Container, Form, Button, Card } from 'react-bootstrap';

interface ApiConfigProps {
  onSave: (url: string) => void;
  initialValue: string;
}

const ApiConfig: React.FC<ApiConfigProps> = ({ onSave, initialValue }) => {
  const [apiUrl, setApiUrl] = useState(initialValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(apiUrl);
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <Card style={{ width: '500px' }}>
        <Card.Body>
          <Card.Title>API Configuration</Card.Title>
          <Card.Text>
            To avoid this screen, set the <code>PROVER9_API_URL</code> environment variable.
          </Card.Text>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>API Server URL</Form.Label>
              <Form.Control
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:8000"
              />
            </Form.Group>
            <Button variant="primary" type="submit">
              Save
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ApiConfig; 