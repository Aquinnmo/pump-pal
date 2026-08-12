# Cloudflare Worker setup

This guide deploys the privileged Timber API in `apps/api`. The Worker is
not a general Firestore proxy: owner-safe reads and writes go directly from
the clients to Firestore. The Worker handles authenticated operations such as
AI, buddies, username updates, pending catalog submissions, injury history,
and account deletion.

## Prerequisites

- A Cloudflare account with permission to create and deploy Workers.
- A Firebase project with Authentication, Firestore, and App Check configured.
- A configured AI provider (Google Gemini or OpenAI) if AI routes are needed.
- Bun and the repository dependencies installed:

  ```bash
  bun install
  ```

Authenticate Wrangler once from the repository root:

```bash
bunx wrangler login
bunx wrangler whoami
```

## Configure local development

Create the ignored local Worker variables file:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Fill in `apps/api/.dev.vars` with non-production credentials:

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project ID used to verify Firebase Auth tokens. |
| `FIREBASE_CLIENT_EMAIL` | Service-account client email used for Firestore REST calls. |
| `FIREBASE_PRIVATE_KEY` | Service-account private key, preserving its newlines. |
| `API_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the Worker. |
| `AI_PROVIDER` | `google` or `openai`. |
| `AI_MODEL` | Model name supported by the selected provider. |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Key for the selected AI provider. |
| `FIREBASE_PROJECT_NUMBER` | Firebase numeric project number for App Check. |
| `APP_CHECK_ALLOWED_APP_IDS` | Comma-separated Firebase app IDs. |
| `APP_CHECK_MODE` | Use `monitor` while validating setup; use `enforce` only after verification. |

Never commit `.dev.vars`, service-account JSON, private keys, or AI keys.

Run the Worker locally from the repository root:

```bash
bunx wrangler --config apps/api/wrangler.toml dev
```

Wrangler serves the Worker locally, normally at
`http://localhost:8787`. Check it with:

```bash
curl http://localhost:8787/health
```

Expected response:

```json
{"ok":true}
```

## Configure Cloudflare environments

The repository defines two deployment targets in
[`apps/api/wrangler.toml`](../apps/api/wrangler.toml):

| Environment | Worker | Hostname |
| --- | --- | --- |
| `preview` | `timber-api-preview` | `timber-api-preview.adam-montgomery.ca` |
| `production` | `timber-api` | `timber-api.adam-montgomery.ca` |

For each environment, add the following as Worker variables in the Cloudflare
dashboard. Keep preview and production Firebase projects and credentials
separate where possible.

```text
API_ALLOWED_ORIGINS
AI_PROVIDER
AI_MODEL
FIREBASE_PROJECT_NUMBER
APP_CHECK_ALLOWED_APP_IDS
APP_CHECK_MODE
```

Set secrets with Wrangler. Run these commands once per environment, using the
appropriate value when prompted:

```bash
bunx wrangler --config apps/api/wrangler.toml secret put FIREBASE_PROJECT_ID --env preview
bunx wrangler --config apps/api/wrangler.toml secret put FIREBASE_CLIENT_EMAIL --env preview
bunx wrangler --config apps/api/wrangler.toml secret put FIREBASE_PRIVATE_KEY --env preview
bunx wrangler --config apps/api/wrangler.toml secret put GEMINI_API_KEY --env preview
# Or use OPENAI_API_KEY instead of GEMINI_API_KEY.
```

Repeat with `--env production` for the production Worker. Secret names that
are not used by the selected provider do not need to be created.

## Deploy preview

Before a remote deployment, run the focused API checks:

```bash
bun apps/api/src/worker.test.ts
bun run --cwd apps/api typecheck
```

Deploy from `apps/api`:

```bash
bunx wrangler --config apps/api/wrangler.toml deploy --env preview
```

Verify the deployed Worker:

```bash
curl https://timber-api-preview.adam-montgomery.ca/health
bunx wrangler tail timber-api-preview
```

Set the client’s `EXPO_PUBLIC_API_BASE_URL` to the preview Worker URL. For
browser clients, the exact browser origin must also be present in the
preview `API_ALLOWED_ORIGINS` value. Native requests do not send an `Origin`
header and do not need to be added to that allowlist.

Keep `APP_CHECK_MODE=monitor` until preview telemetry shows verified
privileged traffic. Once the configured app IDs and clients are confirmed,
change the preview variable to `enforce` and test again.

## Deploy production

Do not deploy production until the preview rollout is verified. Configure the
production variables and secrets, then deploy the production environment:

```bash
bunx wrangler --config apps/api/wrangler.toml deploy --env production
curl https://timber-api.adam-montgomery.ca/health
```

Release clients with:

```text
EXPO_PUBLIC_API_BASE_URL=https://timber-api.adam-montgomery.ca
```

Enable production App Check enforcement only after the production clients and
their App Check providers have been verified. For the full rollout, migration,
rollback, and legacy cleanup gates, see [deployment.md](deployment.md).

## Troubleshooting

- **`Missing required env var`**: the binding is absent or was added to the
  wrong Wrangler environment. Check the Worker’s Variables and Secrets page.
- **CORS or `Origin not allowed`**: add the exact scheme-and-host origin to
  `API_ALLOWED_ORIGINS`; do not add a path or trailing slash unless the client
  actually sends it.
- **`401` from `/api/*`**: confirm the client sends a Firebase ID token and an
  `X-Firebase-AppCheck` token. In `monitor` mode, App Check failures are logged
  but do not reject the request.
- **AI failures**: confirm `AI_PROVIDER`, `AI_MODEL`, and the matching provider
  secret are configured in the same environment as the deployment.
- **Worker changes are not visible**: deploy the correct environment and check
  its logs with `wrangler tail`.
