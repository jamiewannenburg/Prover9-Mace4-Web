// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// CodeMirror pulls ESM-only deps that Jest does not transform; stub the wrapper for tests.
jest.mock('@uiw/react-codemirror', () => {
  const React = require('react');
  return function MockCodeMirror(props: {
    value?: string;
    onChange?: (v: string) => void;
  }) {
    return React.createElement('textarea', {
      'data-testid': 'codemirror-mock',
      value: props.value ?? '',
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        props.onChange?.(e.target.value),
    });
  };
});

jest.mock('@codemirror/lang-javascript', () => ({
  javascript: () => [],
}));
