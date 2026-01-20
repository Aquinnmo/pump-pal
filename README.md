# Pump Pal

Pump Pal is a Next.js app with a Firebase-powered login flow that supports phone number sign-in and Google OAuth.

## Features

- Phone number authentication with SMS verification via Firebase.
- Google sign-in via Firebase Authentication.
- Accessible, responsive login UI.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the login experience.

## Firebase Configuration

Create a Firebase project and enable **Phone** and **Google** providers under Authentication. Add your local and production domains to the **Authorized domains** list.

Set the following environment variables (for example in `.env.local`):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
```

## Tests and Linting

```bash
npm run lint
npm run test
```

## Build

```bash
npm run build
```
