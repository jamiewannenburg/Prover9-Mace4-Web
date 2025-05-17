import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';

const AdditionalInputPanel: React.FC = () => {
  const [additionalInput, setAdditionalInput] = useState<string>('');

  return (
    <div className="additional-input-panel">
      <p>Enter additional input for Prover9/Mace4:</p>
      <Form.Group className="mb-3">
        <CodeMirror
          value={additionalInput}
          height="400px"
          extensions={[javascript()]}
          onChange={(value) => setAdditionalInput(value)}
        />
      </Form.Group>
      <p className="text-muted">
        This can include any extra commands or settings that don't fit elsewhere.
      </p>
    </div>
  );
};

export default AdditionalInputPanel; 