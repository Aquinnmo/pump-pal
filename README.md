# Pump Pal

Pump Pal is a Next.js app with a Firebase-backed login experience that supports phone number verification and Google sign-in.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the login page.

## Firebase Configuration

Create a Firebase project and enable **Phone** and **Google** providers in **Authentication → Sign-in method**. Then add the following environment variables (for example in a `.env.local` file):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> Phone sign-in requires a reCAPTCHA domain whitelist in your Firebase console. Add your local and production domains there.

## Testing and Linting

```bash
npm run lint
npm run test
```

## Build

```bash
npm run build
```

## OWASP Top 10 Checklist

Use this checklist when shipping to production:

- ✅ **A01: Broken Access Control** — enforce authenticated access to protected routes.
- ✅ **A02: Cryptographic Failures** — rely on Firebase for token handling and HTTPS-only deployment.
- ✅ **A03: Injection** — validate and sanitize any user input stored or logged.
- ✅ **A04: Insecure Design** — ensure MFA or rate-limiting is configured in Firebase where needed.
- ✅ **A05: Security Misconfiguration** — review Firebase rules and environment variables before deploy.
- ✅ **A06: Vulnerable Components** — keep dependencies updated and review advisories.
- ✅ **A07: Identification and Authentication Failures** — enable Firebase Auth providers and protect sessions.
- ✅ **A08: Software and Data Integrity** — use CI to validate builds and signed deployments.
- ✅ **A09: Security Logging and Monitoring** — add logging for auth events in production.
- ✅ **A10: Server-Side Request Forgery** — avoid server-side fetches to untrusted URLs.
