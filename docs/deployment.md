# Deployment: getting dev builds and production running

The AI features no longer run on the device. Every generation goes through a
Vercel serverless function at `api/ai.ts`, which holds the provider key and
enforces the daily quota. That means **the app now has a server-side half that
has to be configured before any AI feature works**, on top of the client setup
in [README.md](../README.md).

This document is the checklist for that. Do the parts in order — step 7
(rotating the leaked key) is deliberately last, because rotating before the
proxy works breaks the app with no way to tell which change caused it.

> **Status:** the code is complete and typechecks, but the proxy has never been
> run end to end. Steps 1–6 are first-time setup, not a redeploy.

---

## 0. What talks to what

```
Expo app ──┬─ web: same Vercel origin, relative /api/ai
           └─ native: EXPO_PUBLIC_API_BASE_URL + /api/ai
                              │
                              │  Authorization: Bearer <Firebase ID token>
                              ▼
                     api/ai.ts  (Vercel function)
                        ├─ api/_lib/auth.ts ......... verifies the token (jose)
                        ├─ api/_lib/store/ .......... Firestore REST, service account
                        └─ api/_lib/ai/ ............. Gemini / OpenAI, server-only key
```

Two separate credentials, easy to confuse:

| | Who holds it | What it does |
| --- | --- | --- |
| Firebase **web config** (`EXPO_PUBLIC_FIREBASE_*`) | the client, publicly | identifies the project. Not a secret — it's protected by `firestore.rules`, not by being hidden. |
| Firebase **service account** (`FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`) | Vercel only | lets the function read/write Firestore, **bypassing `firestore.rules`**. A real secret. |

---

## 1. Server environment variables (Vercel)

Vercel dashboard → the `pump-pal` project → Settings → Environment Variables.
Set these for **Production** and **Preview**. None of them are prefixed
`EXPO_PUBLIC_`, and none of them ever should be — Metro inlines any
`EXPO_PUBLIC_*` value into every APK and web bundle, which is the exact leak
this proxy exists to close.

| Variable | Value | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `google` or `openai` | defaults to `google` if unset |
| `AI_MODEL` | e.g. `gemini-3.5-flash` | defaults to `gemini-3.5-flash` if unset |
| `GEMINI_API_KEY` | from Google AI Studio | needed only if `AI_PROVIDER=google` |
| `OPENAI_API_KEY` | from the OpenAI dashboard | needed only if `AI_PROVIDER=openai` |
| `FIREBASE_PROJECT_ID` | `pumppal-c9199` | |
| `FIREBASE_CLIENT_EMAIL` | from the service account JSON | |
| `FIREBASE_PRIVATE_KEY` | from the service account JSON | see the newline note below |

### Getting the service account

Firebase console → Project settings → **Service accounts** → *Generate new
private key*. Downloads a JSON file. From it:

- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY`

**Paste `private_key` exactly as it appears in the JSON**, with its literal
`\n` two-character escapes intact — do not convert them to real line breaks.
The value starts `-----BEGIN PRIVATE KEY-----\nMII…`. `api/_lib/store/rest.ts`
converts them back at runtime.

Delete the downloaded JSON afterwards. It is a full-access credential to your
Firestore data and it belongs in exactly one place: Vercel.

---

## 2. Deploy the Firestore rules

`firestore.rules` is versioned in this repo but has **never been deployed** —
the live rules are whatever is in the console. Until this runs, the field-level
protections the proxy relies on are not actually in force.

```bash
npx firebase-tools@latest login          # once
npx firebase-tools@latest deploy --only firestore:rules
```

> Use `firebase-tools`, **not** `npx firebase`. This repo depends on the
> `firebase` package — that's the client JS SDK, and it ships no executable, so
> `npx firebase` resolves to the local package, finds no binary, and fails. The
> CLI is a separate package named `firebase-tools`.
>
> If the browser handoff doesn't complete, `npx firebase-tools@latest login --no-localhost`
> prints a URL and takes a pasted code instead of listening on a local port.

Check the console afterwards and confirm the deployed rules match the file.
The important ones: `users/{uid}.aiUsage` is not client-writable, and
`exercises` / `exerciseCatalogMeta` / `random` are read-only to clients.

The function is unaffected by these rules — its service-account credential
bypasses them by design. That is what lets it write `aiUsage` while the client
cannot.

---

## 3. Deploy to production

`api/` deploys automatically alongside the static web export; Vercel picks up a
root `api/` directory as functions with no extra config.

Production builds from `main`, so the branch has to land first:

```bash
git checkout main
git merge offload-env-or-server
git push
```

**Before merging, confirm on a preview deploy that Vercel actually built the
function** — check the deployment's Functions tab for `api/ai`. If the build
produced only static output, nothing else in this document will work, and it's
much cheaper to find that out on a preview.

### The preview-URL trap

This project has Deployment Protection set to `all_except_custom_domains`:

- `https://pump.adam-montgomery.ca` — **exempt**, works normally
- any `*.vercel.app` URL, including previews — **walled behind Vercel SSO**

A walled URL returns an HTML login page, not JSON. `callAI` will fail trying to
parse it, and the error will look like a broken function rather than an auth
wall. So: point clients at the custom domain, or disable protection for
Preview while testing.

---

## 4. Client environment

Add to your local `.env` (and mirror into EAS, below):

```bash
EXPO_PUBLIC_API_BASE_URL=https://pump.adam-montgomery.ca
```

**This is currently missing from your `.env`.** Without it, native builds
resolve a bare relative `/api/ai`, which is not a valid URL off the web, and
every AI feature fails. Web is unaffected — it uses the same-origin relative
path deliberately, so no CORS is involved.

Not a secret. It's a public URL and it's fine to bundle.

### Three dead variables to remove

Your `.env` still has these. Nothing reads them any more:

```
EXPO_PUBLIC_AI_PROVIDER      # moved to Vercel as AI_PROVIDER
EXPO_PUBLIC_AI_MODEL         # moved to Vercel as AI_MODEL
EXPO_PUBLIC_OPENAI_API_KEY   # compromised — see step 7
```

Leave `EXPO_PUBLIC_OPENAI_API_KEY` in place until step 7, then remove all three
together.

### EAS environment

Remote builds cannot read your gitignored local `.env`. In the Expo dashboard,
add every `EXPO_PUBLIC_*` value to the **preview** and **development**
environments — the seven `EXPO_PUBLIC_FIREBASE_*` values plus
`EXPO_PUBLIC_API_BASE_URL`.

Never add a provider API key here. EAS environment variables prefixed
`EXPO_PUBLIC_` are bundled into the binary exactly like local ones.

---

## 5. Development builds

Nothing about this change affects how dev builds are produced — see
[docs/dev-build.md](dev-build.md) for Android and [docs/ios-setup.md](ios-setup.md)
for iPhone. The only difference is that `EXPO_PUBLIC_API_BASE_URL` must be set
in the EAS environment for the profile you're building.

```powershell
# Android dev build (installs separately as "Timber Dev")
npx eas-cli@latest build -p android --profile development

# Preview APK
$env:GIT_CLONE_PROTECTION_ACTIVE = 'false'
npx eas-cli@latest build -p android --profile preview
```

### The local dev loop

**Native** (dev build or Expo Go on device) — no local server needed. Point
`EXPO_PUBLIC_API_BASE_URL` at the deployed production URL and `npx expo start`
as usual. Native isn't a browser, so there's no CORS preflight; calls to the
deployed function just work.

**Web** — `npx expo start --web` serves from Metro on `localhost:8081`, which
does **not** run Vercel functions. The relative `/api/ai` will 404. Two options:

- Use `npx vercel dev`, which serves the static output and the function on one
  origin. Slower loop (it runs the `expo export` build command), but it's the
  only way to exercise the function locally.
- Or just test AI features on native during development and rely on the
  deployed environment for web.

> Pointing web dev at the deployed URL does *not* work as-is:
> `localhost:8081 → pump.adam-montgomery.ca` is cross-origin, and the function
> sends no CORS headers. Adding them would be a small change to `api/ai.ts` if
> this loop turns out to matter.

---

## 6. Verify — all four operations

The refactor replaced the entire Firestore layer (`firebase-admin` → REST), so
a passing typecheck proves very little here. Exercise each op against a real
deployment:

| Op | Where in the app | What proves it worked |
| --- | --- | --- |
| `muscle-analysis` | Analytics tab → muscle insight cards | over/under-trained muscles render |
| `workout-completion` | Active workout → suggest exercises | 2–5 suggestions appear |
| `split-names` | Set-split screen → custom split description | day names generate |
| `daily-name` | Pushup Challenge tab | a name shows, and is the *same* name on a second device |

Then check the parts a happy path won't reveal:

**Quota.** Call a metered op four times as one user. The fourth must fail with
"You've used all your AI suggestions for today." Then open `users/{uid}` in the
Firestore console and confirm two things:

1. `aiUsage.count == 3`
2. **every other field on the document is still there**

That second check is the one that matters. Firestore's REST `:commit` replaces
the whole document unless the write carries an `updateMask`; a bug there would
silently wipe the user's split, injuries, and profile. The type system enforces
the mask, but confirm it against real data once.

**Failed generation refunds.** If a call fails, the user should not lose one of
their three. Hard to trigger deliberately — worth watching for if a user
reports losing uses.

**Duration ceiling.** `workout-completion` is the slowest op, especially on
OpenAI with `reasoningEffort: 'high'`. If it times out on Vercel Hobby, set
`maxDuration` for `api/ai.ts` in `vercel.json`, drop the reasoning effort, or
stay on Gemini.

---

## 7. Rotate the leaked key — last, not first

`EXPO_PUBLIC_OPENAI_API_KEY` has been inlined into every APK and web bundle
built so far. Anyone with one of those builds can extract it and spend against
your account. **Treat it as compromised.**

Order matters. Rotating before the proxy is verified breaks the app and makes
the failure ambiguous.

1. Confirm all four ops work through the proxy (step 6).
2. OpenAI dashboard → revoke the old key → issue a new one.
3. Put the new key **only** in Vercel as `OPENAI_API_KEY`.
4. Delete `EXPO_PUBLIC_OPENAI_API_KEY`, `EXPO_PUBLIC_AI_PROVIDER`, and
   `EXPO_PUBLIC_AI_MODEL` from your local `.env`.
5. Rebuild and redistribute any preview APK. Old builds keep the dead key
   embedded — revoking it is what makes them harmless.

Do the same for the Gemini key if it was ever in a client build.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `You must be signed in to use AI features.` | thrown client-side before any request; no Firebase user |
| `Invalid or expired session` (401) | `FIREBASE_PROJECT_ID` on Vercel doesn't match the project that issued the token, or the token expired |
| JSON parse error, response looks like HTML | hitting a protected `*.vercel.app` URL — Vercel SSO login page. Use the custom domain |
| 404 on `/api/ai` | Vercel didn't build the function (check the Functions tab), or you're on `expo start --web` |
| `Missing Firebase admin credentials` | one of the three `FIREBASE_*` vars unset on Vercel |
| 401 from the token exchange, function-side | `FIREBASE_PRIVATE_KEY` newlines mangled — must be literal `\n`, not real line breaks |
| Every request 429s immediately | `aiUsage` stuck from testing; clear the field on `users/{uid}` |
| AI works on web, fails on native | `EXPO_PUBLIC_API_BASE_URL` unset in the EAS environment for that build profile |

Function logs are in the Vercel dashboard under the deployment → Logs. Provider
errors are logged there in full and deliberately **not** returned to the client
— response bodies can echo request content and key hints.
