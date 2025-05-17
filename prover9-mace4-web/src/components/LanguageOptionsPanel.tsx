import React from 'react';
import { Form } from 'react-bootstrap';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { useLanguageOptions } from '../context/LanguageOptionsContext';

const LanguageOptionsPanel: React.FC = () => {
  const { options, setOptions } = useLanguageOptions();

  return (
    <div className="language-options-panel">
      <p>Enter language declarations such as function symbols, relation symbols, and sort declarations:</p>
      <Form.Group className="mb-3">
        <CodeMirror
          value={options}
          height="400px"
          extensions={[javascript()]}
          onChange={(value) => setOptions(value)}
        />
      </Form.Group>
      <p className="text-muted">
        Example: <code>op(400, infix, "&").</code> or <code>sort(person).</code>
      </p>
    </div>
  );
};

export default LanguageOptionsPanel; 