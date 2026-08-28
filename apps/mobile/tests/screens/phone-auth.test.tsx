import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

const backCalls: string[] = [];
const otpRequests: Array<[unknown, string, unknown]> = [];
let phoneError: Error | null = null;
let confirmation: { confirm: (code: string) => Promise<void> } = {
  confirm: async () => undefined,
};
let holdPhoneRequest = false;
let releasePhoneRequest: (() => void) | null = null;

mock.module(new URL('../../src/ui/timber-auth-shell.tsx', import.meta.url).pathname, () => ({
  TimberAuthShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  timberAuthStyles: {
    field: {},
    primaryButton: {},
    primaryButtonText: {},
    errorBanner: {},
  },
}));

mock.module(new URL('../../src/ui/firebase-recaptcha-modal.tsx', import.meta.url).pathname, () => ({
  default: () => <div aria-label="reCAPTCHA verifier" />,
}));

mock.module(new URL('../../src/config/firebase.web.ts', import.meta.url).pathname, () => ({
  default: { options: { projectId: 'phone-auth-test' } },
  auth: { name: 'test-auth' },
}));

mock.module('firebase/auth', () => ({
  signInWithPhoneNumber: async (auth: unknown, number: string, verifier: unknown) => {
    otpRequests.push([auth, number, verifier]);
    if (holdPhoneRequest) {
      await new Promise<void>((resolve) => { releasePhoneRequest = resolve; });
    }
    if (phoneError) throw phoneError;
    return confirmation;
  },
}));

mock.module('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'CA' }],
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

// expo-router is imported by the route before interaction; replace it at the
// Bun build boundary so the visible back action remains an observable seam.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'phone-auth-router-test-double',
  setup(build: Build) {
    build.module('expo-router', () => ({
      exports: {
        router: { back: () => backCalls.push('back') },
      },
      loader: 'object',
    }));
  },
});

const { default: PhoneAuthScreen } = await import('../../app/(auth)/phone-auth');

beforeEach(() => {
  backCalls.length = 0;
  otpRequests.length = 0;
  phoneError = null;
  confirmation = { confirm: async () => undefined };
  holdPhoneRequest = false;
  releasePhoneRequest = null;
});

afterEach(() => {
  cleanup();
  releasePhoneRequest?.();
  releasePhoneRequest = null;
  holdPhoneRequest = false;
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function enterPhone(value = '555 000 1234'): void {
  fireEvent.change(screen.getByPlaceholderText('555 000 1234'), { target: { value } });
}

async function sendCode(): Promise<void> {
  enterPhone();
  fireEvent.click(screen.getByLabelText('Send login code'));
  await waitFor(() => assert.ok(screen.getByText('Enter your 6-digit code', { exact: true })));
}

describe('PhoneAuthScreen', () => {
  it('renders the phone-entry baseline and routes the initial back action', () => {
    render(<PhoneAuthScreen />);

    assert.ok(screen.getByText('Log in with your phone', { exact: true }));
    assert.ok(screen.getByText('We detected your country code. We’ll text a code to get you back to your log.', { exact: true }));
    assert.ok(screen.getByText('+1', { exact: true }));
    assert.ok(screen.getByPlaceholderText('555 000 1234'));
    assert.ok(screen.getByLabelText('Send login code'));
    assert.equal(screen.getByLabelText('Send login code').getAttribute('aria-disabled'), 'true');
    assert.equal(screen.queryByRole('progressbar'), null);

    fireEvent.click(screen.getByLabelText('Go back'));
    assert.deepEqual(backCalls, ['back']);
  });

  it('keeps the send action inert for an empty phone number', async () => {
    render(<PhoneAuthScreen />);

    fireEvent.click(screen.getByLabelText('Send login code'));
    await settle();

    assert.deepEqual(otpRequests, []);
    assert.ok(screen.getByText('Log in with your phone', { exact: true }));
    assert.equal(screen.queryByText('Enter your 6-digit code', { exact: true }), null);
  });

  it('shows loading while sending and advances to verification with the normalized number', async () => {
    holdPhoneRequest = true;
    render(<PhoneAuthScreen />);
    enterPhone('555 000 1234');

    const send = screen.getByLabelText('Send login code');
    fireEvent.click(send);
    assert.equal(send.getAttribute('aria-disabled'), 'true');
    assert.ok(screen.getByRole('progressbar'));
    assert.equal(screen.queryByText('Enter your 6-digit code', { exact: true }), null);

    await act(async () => {
      releasePhoneRequest?.();
      releasePhoneRequest = null;
      holdPhoneRequest = false;
    });
    await waitFor(() => assert.ok(screen.getByText('Enter your 6-digit code', { exact: true })));
    assert.ok(screen.getByText('Sent to +15550001234', { exact: true }));
    assert.deepEqual(otpRequests, [[{ name: 'test-auth' }, '+15550001234', null]]);
  });

  it('renders a send error and stays on phone entry when auth rejects', async () => {
    phoneError = new Error('SMS service unavailable');
    render(<PhoneAuthScreen />);
    enterPhone();
    fireEvent.click(screen.getByLabelText('Send login code'));

    await waitFor(() => assert.ok(screen.getByText('SMS service unavailable', { exact: true })));
    assert.ok(screen.getByText('Log in with your phone', { exact: true }));
    assert.equal(screen.queryByText('Enter your 6-digit code', { exact: true }), null);
    assert.ok(screen.getByLabelText('Send login code'));
  });

  it('verifies a trimmed six-digit code and returns to phone entry through Change phone number', async () => {
    const confirmed: string[] = [];
    confirmation = { confirm: async (code) => { confirmed.push(code); } };
    render(<PhoneAuthScreen />);
    await sendCode();

    const otp = screen.getByPlaceholderText('000000');
    assert.equal(screen.getByLabelText('Verify login code').getAttribute('aria-disabled'), 'true');
    fireEvent.change(otp, { target: { value: ' 123456 ' } });
    assert.equal(screen.getByLabelText('Verify login code').getAttribute('aria-disabled'), null);
    fireEvent.click(screen.getByLabelText('Verify login code'));
    await waitFor(() => assert.deepEqual(confirmed, ['123456']));
    assert.equal(screen.queryByText('Invalid code. Please try again.', { exact: true }), null);

    fireEvent.click(screen.getByLabelText('Change phone number'));
    assert.ok(screen.getByText('Log in with your phone', { exact: true }));
    assert.ok(screen.getByPlaceholderText('555 000 1234'));
  });

  it('renders a verify error and keeps the code step available for retry', async () => {
    confirmation = { confirm: async () => { throw new Error('Incorrect code'); } };
    render(<PhoneAuthScreen />);
    await sendCode();
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByLabelText('Verify login code'));

    await waitFor(() => assert.ok(screen.getByText('Incorrect code', { exact: true })));
    assert.ok(screen.getByText('Enter your 6-digit code', { exact: true }));
    assert.ok(screen.getByLabelText('Verify login code'));
  });
});
