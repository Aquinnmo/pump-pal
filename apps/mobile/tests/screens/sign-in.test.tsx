import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { type ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const replacements: string[] = [];
const signInCalls: Array<[string, string]> = [];
let signInImpl: (email: string, password: string) => Promise<void> = async () => undefined;

mock.module(new URL('../../src/context/auth-context.tsx', import.meta.url).pathname, () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    googleConnection: 'disconnected',
    signIn: async (email: string, password: string) => {
      signInCalls.push([email, password]);
      return signInImpl(email, password);
    },
    signUp: async () => undefined,
    signInWithGoogle: async () => false,
    connectGoogleAccount: async () => false,
    logOut: async () => undefined,
  }),
}));

mock.module(new URL('../../src/ui/timber-auth-shell.tsx', import.meta.url).pathname, () => ({
  TimberAuthShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TimberBrand: () => <div>Timber</div>,
  timberAuthStyles: {
    field: {},
    primaryButton: {},
    primaryButtonText: {},
    errorBanner: {},
    secondaryButton: {},
    secondaryButtonText: {},
  },
}));

mock.module(new URL('../../src/ui/google-sign-in-button.tsx', import.meta.url).pathname, () => ({
  GoogleSignInButton: ({ label = 'Continue with Google', disabled }: { label?: string; disabled?: boolean }) => (
    <button aria-label={label} disabled={disabled}>{label}</button>
  ),
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

// The route package is imported by the app module before the test can interact
// with it; replace it at the Bun build boundary so navigation remains observable.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'sign-in-router-test-double',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router: { replace: (href: string) => replacements.push(href) },
        Link: ({ children }: { children?: ReactNode }) => children ?? null,
      },
      loader: 'object',
    }));
  },
});

const { default: SignInScreen } = await import('../../app/(auth)/sign-in');

beforeEach(() => {
  replacements.length = 0;
  signInCalls.length = 0;
  signInImpl = async () => undefined;
});

afterEach(() => {
  cleanup();
});

function fillCredentials(email = 'user@example.com', password = 'secret'): void {
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: password } });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('SignInScreen', () => {
  it('renders the baseline form and available auth choices', () => {
    render(<SignInScreen />);

    assert.ok(screen.getByText('Timber', { exact: true }));
    assert.ok(screen.getByText('Pick Up Your Log', { exact: true }));
    assert.ok(screen.getByPlaceholderText('Email'));
    assert.ok(screen.getByPlaceholderText('Password'));
    assert.ok(screen.getByLabelText('Sign in to Timber'));
    assert.ok(screen.getByRole('button', { name: 'Continue with Google' }));
    assert.ok(screen.getByText('Create Account', { exact: true }));
    assert.equal(screen.queryByText('Please fill in all fields.', { exact: true }), null);

  });

  it('shows a user-visible validation error without calling auth for blank fields', async () => {
    render(<SignInScreen />);

    fireEvent.click(screen.getByLabelText('Sign in to Timber'));
    await settle();

    assert.ok(screen.getByText('Please fill in all fields.', { exact: true }));
    assert.deepEqual(signInCalls, []);
    assert.deepEqual(replacements, []);
  });

  it('shows the local loading state and disables the primary action until auth resolves', async () => {
    let release: (() => void) | null = null;
    signInImpl = () => new Promise<void>((resolve) => { release = resolve; });
    render(<SignInScreen />);
    fillCredentials();

    const submit = screen.getByLabelText('Sign in to Timber') as HTMLDivElement;
    fireEvent.click(submit);

    assert.equal(submit.getAttribute('aria-disabled'), 'true');
    assert.equal(screen.queryByText('Sign In', { exact: true }), null);
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.getByRole('button', { name: 'Continue with Google' }).hasAttribute('disabled'), true);

    await act(async () => {
      release?.();
      release = null;
    });
    await waitFor(() => assert.ok(screen.getByText('Sign In', { exact: true })));
    assert.equal(submit.getAttribute('aria-disabled'), null);
  });

  it('renders the friendly auth error and stays on the route when sign-in fails', async () => {
    signInImpl = async () => {
      throw { code: 'auth/invalid-credential' };
    };
    render(<SignInScreen />);
    fillCredentials();
    fireEvent.click(screen.getByLabelText('Sign in to Timber'));

    await waitFor(() => assert.ok(screen.getByText('Invalid credentials. Please try again.', { exact: true })));
    assert.ok(screen.getByText('Invalid credentials. Please try again.', { exact: true }));
    assert.deepEqual(replacements, []);
    assert.ok(screen.getByText('Sign In', { exact: true }));
  });

  it('trims the email, preserves the password, and replaces to tabs after success', async () => {
    render(<SignInScreen />);
    fillCredentials('  user@example.com  ', ' secret ');
    fireEvent.click(screen.getByLabelText('Sign in to Timber'));

    await waitFor(() => assert.deepEqual(replacements, ['/(tabs)']));
    assert.deepEqual(signInCalls, [['user@example.com', ' secret ']]);
    assert.equal(screen.queryByText('Invalid credentials. Please try again.', { exact: true }), null);
  });
});
