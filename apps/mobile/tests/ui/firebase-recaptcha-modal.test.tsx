import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, it } from 'bun:test';
import { createRef, type ReactNode } from 'react';
import type { FirebaseRecaptchaVerifierModalRef } from '../../src/ui/firebase-recaptcha-modal';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};
type WebViewProps = {
  source: { html: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
};

let latestWebView: WebViewProps | null = null;

// Model the native visibility and WebView message seams as user-observable
// DOM so the real verifier's imperative ApplicationVerifier contract runs.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'firebase-recaptcha-native-test-doubles',
  setup(build: Build) {
    const Modal = ({ visible, children, onRequestClose }: { visible: boolean; children?: ReactNode; onRequestClose?: () => void }) =>
      visible ? <div role="dialog" aria-label="reCAPTCHA modal" data-on-request-close={onRequestClose ? 'available' : 'missing'}>{children}</div> : null;
    const TouchableOpacity = ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
      <button onClick={onPress}>{children}</button>;
    const Text = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
    const View = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    const StyleSheet = { create: <T,>(styles: T): T => styles };
    const WebView = (props: WebViewProps) => {
      latestWebView = props;
      return <div aria-label="reCAPTCHA WebView" data-html-size={props.source.html.includes("size: 'invisible'") ? 'invisible' : 'normal'} />;
    };

    build.module('react-native', () => ({
      exports: { Modal, StyleSheet, Text, TouchableOpacity, View },
      loader: 'object',
    }));
    build.module('react-native-webview', () => ({
      exports: { default: WebView },
      loader: 'object',
    }));
  },
});

const { default: FirebaseRecaptchaVerifierModal } = await import('../../src/ui/firebase-recaptcha-modal');

const firebaseConfig = {
  apiKey: 'test-api-key',
  authDomain: 'test.firebaseapp.com',
  projectId: 'test-project',
};

afterEach(() => {
  cleanup();
  latestWebView = null;
});

async function showVerifier(attemptInvisibleVerification = false): Promise<{
  ref: ReturnType<typeof createRef<FirebaseRecaptchaVerifierModalRef>>;
  pending: Promise<string>;
}> {
  const ref = createRef<FirebaseRecaptchaVerifierModalRef>();
  render(<FirebaseRecaptchaVerifierModal ref={ref} firebaseConfig={firebaseConfig} attemptInvisibleVerification={attemptInvisibleVerification} />);
  let pending!: Promise<string>;
  await act(async () => {
    pending = ref.current!.verify();
  });
  return { ref, pending };
}

describe('FirebaseRecaptchaVerifierModal', () => {
  it('renders hidden by default and exposes a human-verification modal after verify', async () => {
    const ref = createRef<FirebaseRecaptchaVerifierModalRef>();
    render(<FirebaseRecaptchaVerifierModal ref={ref} firebaseConfig={firebaseConfig} />);

    assert.equal(screen.queryByRole('dialog', { name: 'reCAPTCHA modal' }), null);
    assert.equal(ref.current?.type, 'recaptcha');

    await act(async () => {
      ref.current!.verify();
    });
    assert.ok(screen.getByRole('dialog', { name: 'reCAPTCHA modal' }));
    assert.ok(screen.getByText("Verify you're human"));
    assert.ok(screen.getByLabelText('reCAPTCHA WebView'));
    assert.equal(screen.getByLabelText('reCAPTCHA WebView').getAttribute('data-html-size'), 'normal');
    assert.ok(latestWebView?.source.html.includes('test-project'));
  });

  it('resolves verify with the WebView token callback and dismisses the modal', async () => {
    const { pending } = await showVerifier(true);
    assert.equal(screen.getByLabelText('reCAPTCHA WebView').getAttribute('data-html-size'), 'invisible');

    await act(async () => {
      latestWebView!.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'token', token: 'token-123' }) } });
    });

    assert.equal(await pending, 'token-123');
    assert.equal(screen.queryByRole('dialog', { name: 'reCAPTCHA modal' }), null);
  });

  it('rejects verify on an expired or failed WebView callback and dismisses the modal', async () => {
    const { pending } = await showVerifier();
    const rejection = assert.rejects(pending, /reCAPTCHA expired or failed/);

    await act(async () => {
      latestWebView!.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'expired' }) } });
    });
    await rejection;
    await waitFor(() => assert.equal(screen.queryByRole('dialog', { name: 'reCAPTCHA modal' }), null));
  });

  it('rejects verify when the visible modal is cancelled', async () => {
    const { pending } = await showVerifier();
    fireEvent.click(screen.getByText('✕'));

    await assert.rejects(pending, /reCAPTCHA cancelled/);
    assert.equal(screen.queryByRole('dialog', { name: 'reCAPTCHA modal' }), null);
  });
});
