import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from './App';

function urlToPathname(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return new URL(input, 'http://localhost').pathname;
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  return new URL(input.url, 'http://localhost').pathname;
}

/** Returns true for list endpoint `GET .../runs`, not `.../runs/{id}/...`. */
function isListRunsRequest(pathname: string): boolean {
  return /\/runs$/.test(pathname);
}

function mockFetchForRunsList() {
  return jest.fn((input: RequestInfo | URL) => {
    const pathname = urlToPathname(input);
    if (isListRunsRequest(pathname)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('[]'),
        json: () => Promise.resolve([]),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch in App smoke test: ${pathname}`));
  });
}

describe('App', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('prover9_api_url', '/api');
    global.fetch = mockFetchForRunsList();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('smoke: loads main shell and requests GET /runs when API URL is configured', async () => {
    render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    const listRunsCall = calls.find((c) => {
      const pathname = urlToPathname(c[0]);
      return isListRunsRequest(pathname);
    });
    expect(listRunsCall).toBeDefined();
    expect(listRunsCall![0]).toMatch(/\/runs$/);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /formulas/i })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/process name/i)).toBeInTheDocument();
  });

  test('polls GET /runs on interval after initial load', async () => {
    jest.useFakeTimers();
    try {
      render(<App />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
