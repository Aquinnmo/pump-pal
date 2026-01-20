'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

export default function LoginPage() {
  const recaptchaVerifierRef = useRef(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!recaptchaVerifierRef.current && typeof window !== 'undefined') {
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'normal'
        }
      );
    }

    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const handleSendCode = async () => {
    setError('');
    setStatus('');

    if (!phoneNumber.trim()) {
      setError('Please enter a phone number with country code, e.g. +1 555 000 0000.');
      return;
    }

    try {
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        recaptchaVerifierRef.current
      );
      setConfirmation(confirmationResult);
      setStatus('Verification code sent. Check your phone.');
    } catch (err) {
      setError('Unable to send code. Confirm your phone number and reCAPTCHA.');
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setStatus('');

    if (!confirmation) {
      setError('Request a verification code first.');
      return;
    }

    if (!verificationCode.trim()) {
      setError('Enter the verification code from your phone.');
      return;
    }

    try {
      await confirmation.confirm(verificationCode);
      setStatus('You are signed in with your phone number.');
    } catch (err) {
      setError('The verification code is invalid or expired.');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setStatus('');

    try {
      await signInWithPopup(auth, googleProvider);
      setStatus('You are signed in with Google.');
    } catch (err) {
      setError('Google sign-in failed. Try again.');
    }
  };

  return (
    <main className="page">
      <section className="card" aria-labelledby="login-title">
        <div className="header">
          <p className="eyebrow">Pump Pal</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="subtitle">
            Sign in with your phone number or use Google to continue.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone number</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+1 555 000 0000"
            autoComplete="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
          />
          <button type="button" className="primary" onClick={handleSendCode}>
            Send verification code
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            placeholder="123456"
            autoComplete="one-time-code"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
          />
          <button type="button" className="secondary" onClick={handleVerifyCode}>
            Verify and sign in
          </button>
        </div>

        <div className="divider" role="presentation">
          <span>or</span>
        </div>

        <button type="button" className="google" onClick={handleGoogleSignIn}>
          Sign in with Google
        </button>

        <div id="recaptcha-container" className="recaptcha" />

        {status ? <p className="status" role="status">{status}</p> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="helper">
          Phone sign-in uses Firebase Authentication. Make sure your Firebase
          project has phone and Google providers enabled.
        </p>
      </section>
    </main>
  );
}
