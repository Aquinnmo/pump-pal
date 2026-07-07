# Pump Pal

Workout tracking app built with Expo Router (TypeScript, React Native), backed by Firebase (auth + Firestore) with Gemini-powered workout insights.

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Firebase project config (`EXPO_PUBLIC_FIREBASE_*`) and Gemini API key (`EXPO_PUBLIC_GEMINI_API_KEY`).

3. Start the dev server

   ```bash
   npx expo start
   ```

   Press `a`/`i`/`w` to open Android/iOS/web, or scan the QR code with Expo Go.

## Other commands

```bash
npm run android      # start + open Android
npm run ios          # start + open iOS
npm run web          # start + open web
npm run lint         # expo lint
npm run build:web    # static web export to dist/ (used by Vercel, see vercel.json)
npm run migration:test  # runs the legacy-migration script tests
```

## Architecture

File-based routing via Expo Router, with auth/onboarding gating and the Firestore data model documented in [CLAUDE.md](CLAUDE.md). The Firestore workout/exercise schema (canonical collections, set-by-set data model, exercise catalog) is documented in [docs/firestore-data-refactor.md](docs/firestore-data-refactor.md).
