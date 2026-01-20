'use client';

import { useRef, useState } from 'react';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const setupRecaptcha = () => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'normal'
      });
    }
    return recaptchaRef.current;
  };

  const handleSendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('');

    if (!phoneNumber) {
      setStatus('Enter a phone number in international format (e.g. +15551234567).');
      return;
    }

    try {
      setLoading(true);
      const verifier = setupRecaptcha();
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmation(confirmationResult);
      setStatus('Verification code sent. Check your SMS messages.');
    } catch (error) {
      setStatus('Unable to send verification code. Check your Firebase settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('');

    if (!confirmation) {
      setStatus('Send a verification code first.');
      return;
    }

    if (!verificationCode) {
      setStatus('Enter the verification code from your SMS.');
      return;
    }

    try {
      setLoading(true);
      await confirmation.confirm(verificationCode);
      setStatus('Phone number verified. You are signed in.');
    } catch (error) {
      setStatus('Verification failed. Double-check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setStatus('');
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStatus('Signed in with Google.');
    } catch (error) {
      setStatus('Google sign-in failed. Confirm your Firebase configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <section className="card">
        <header>
          <h1>Welcome back</h1>
          <p>Sign in with your phone number or Google to access Pump Pal.</p>
        </header>

        <div className="notice">
          Enable Phone and Google providers in Firebase Authentication and add your domain to
          authorized domains.
        </div>

        <form onSubmit={handleSendCode}>
          <div>
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+1 555 123 4567"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              autoComplete="tel"
            />
          </div>
          <button className="primary" type="submit" disabled={loading}>
            Send verification code
          </button>
          <p className="helper">Use your full number with country code.</p>
        </form>

        <form onSubmit={handleVerifyCode}>
          <div>
            <label htmlFor="code">Verification code</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              autoComplete="one-time-code"
            />
          </div>
          <button className="primary" type="submit" disabled={loading || !confirmation}>
            Verify and sign in
          </button>
        </form>

        <div id="recaptcha-container" />

        <div className="divider">Or continue with</div>

        <button className="secondary" type="button" onClick={handleGoogleSignIn} disabled={loading}>
          Sign in with Google
        </button>

        {status && <p className="helper">{status}</p>}
      </section>
    </main>
  );
}
