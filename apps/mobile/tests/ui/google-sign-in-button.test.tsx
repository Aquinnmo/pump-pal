import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';

let signInWithGoogle: () => Promise<boolean> = async () => true;
const errors: Array<string | null> = [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ signInWithGoogle }),
}));
mock.module('@/ui/timber-auth-shell', () => ({
  timberAuthStyles: {
    secondaryButton: {},
    secondaryButtonText: {},
  },
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

const { GoogleSignInButton } = await import('../../src/ui/google-sign-in-button');

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  signInWithGoogle = async () => true;
  errors.length = 0;
});

afterEach(() => {
  cleanup();
});

describe('GoogleSignInButton', () => {
  it('renders the divider and visible default auth action', () => {
    render(<GoogleSignInButton onError={(message) => errors.push(message)} />);

    assert.ok(screen.getByText('or', { exact: true }));
    assert.ok(screen.getByRole('button', { name: 'Continue with Google' }));
    assert.ok(screen.getByLabelText('logo-google icon'));
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('clears the parent error, shows loading, blocks duplicate presses, and recovers after success', async () => {
    let release: (() => void) | null = null;
    let calls = 0;
    signInWithGoogle = () => {
      calls += 1;
      return new Promise<boolean>((resolve) => { release = () => resolve(true); });
    };
    render(<GoogleSignInButton label="Use Google" onError={(message) => errors.push(message)} />);
    const button = screen.getByRole('button', { name: 'Use Google' });

    fireEvent.click(button);
    assert.deepEqual(errors, [null]);
    assert.equal(calls, 1);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('Use Google', { exact: true }), null);

    fireEvent.click(button);
    assert.equal(calls, 1);

    await act(async () => {
      release?.();
      release = null;
    });
    await waitFor(() => assert.ok(screen.getByText('Use Google', { exact: true })));
    assert.equal(screen.queryByRole('progressbar'), null);
    assert.deepEqual(errors, [null]);
  });

  it('reports a friendly auth error upward and clears loading after failure', async () => {
    signInWithGoogle = async () => {
      throw { code: 'auth/network-request-failed' };
    };
    render(<GoogleSignInButton onError={(message) => errors.push(message)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => assert.deepEqual(errors, [null, 'Network error. Please check your connection.']));
    assert.equal(screen.queryByRole('progressbar'), null);
    assert.ok(screen.getByRole('button', { name: 'Continue with Google' }));
  });

  it('treats a dismissed picker as a non-error result', async () => {
    signInWithGoogle = async () => false;
    render(<GoogleSignInButton onError={(message) => errors.push(message)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await settle();
    assert.deepEqual(errors, [null]);
    assert.equal(screen.queryByRole('progressbar'), null);
  });

  it('does not call auth when the caller disables the button', () => {
    let calls = 0;
    signInWithGoogle = async () => {
      calls += 1;
      return true;
    };
    render(<GoogleSignInButton disabled onError={(message) => errors.push(message)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    assert.equal(calls, 0);
    assert.deepEqual(errors, []);
  });
});
