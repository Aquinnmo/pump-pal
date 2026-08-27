import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { buddyActionInput, buddyUid, chopInput, createPendingExerciseInput, localDate, profilePatchInput, sendBuddyRequestInput } from '@timber/contract/api';
import { isAIOp, AI_OPS, type AIOp, type AIOpInput } from '@timber/contract/ai';
import { requireUid } from './auth.js';
import { verifyAppCheckToken } from './app-check.js';
import { ApiError } from './errors.js';
import { configureRuntimeEnv } from './runtime-env.js';
import { deleteAccountData } from './store/account.js';
import { acceptBuddyRequest, chopBuddy, listBuddies, searchUsers, sendBuddyRequest } from './store/buddies.js';
import { createPendingExercise } from './store/catalog.js';
import { applyInjuryToHistory, listInjuries, removeInjuryFromHistory } from './store/injuries.js';
import { updateProfile } from './store/profile.js';
import { consumeQuota, peekQuota, readAIEnabled, refundQuota } from './store/quota.js';
import { getCachedDailyName, setCachedDailyName } from './store/daily-name.js';

export type WorkerBindings = {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  API_ALLOWED_ORIGINS?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_REASONING_EFFORT?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  FIREBASE_PROJECT_NUMBER?: string;
  APP_CHECK_ALLOWED_APP_IDS?: string;
  APP_CHECK_MODE?: 'monitor' | 'enforce';
};

type Variables = { uid: string; requestId: string };
type ErrorContext = Context<{ Bindings: WorkerBindings; Variables: Variables }>;
type VerifyUid = (authorization: string | undefined) => Promise<string>;

function origins(env: WorkerBindings): string[] {
  return (env.API_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
}

function requestId(): string {
  return crypto.randomUUID();
}

/**
 * Answers through the Hono context rather than a bare `Response`, because the
 * CORS headers live on the context (staged by the middleware below). A fresh
 * `Response.json()` drops them, and a browser then reports every 4xx as an
 * opaque CORS failure instead of the real status and message.
 */
function routeError(error: unknown, context: ErrorContext): Response {
  const status = error instanceof ApiError ? error.status : (error as { status?: number }).status ?? 500;
  const code = error instanceof ApiError ? error.code : undefined;
  // Hono catches everything, so workerd never surfaces the exception itself —
  // without this a `wrangler tail` 500 carries no name, message, or stack. The
  // response body below stays generic; only the server-side log gets the cause.
  if (status >= 500) {
    const { name, message, stack } = (error ?? {}) as Partial<Error>;
    console.error('[worker] request failed', {
      requestId: context.get('requestId'), route: context.req.path, method: context.req.method,
      status, name, message, stack,
    });
  }
  return context.json(
    { error: status >= 500 ? 'Internal error' : (error as Error).message, ...(code ? { code } : {}) },
    status as ContentfulStatusCode
  );
}

function clientUpgradeRequired(): never {
  throw new ApiError(410, 'This operation moved to direct Firestore. Update the client.', 'client_upgrade_required');
}

/**
 * Gate for the AI routes only — deliberately not in the `/api/*` middleware,
 * which would charge every privileged route a Firestore read to protect two.
 */
async function assertAIEnabled(uid: string): Promise<void> {
  if (!(await readAIEnabled(uid))) {
    throw new ApiError(403, 'AI features are off for this account.', 'ai_disabled');
  }
}

/**
 * Privileged Cloudflare Worker boundary. There is intentionally no catch-all
 * Firestore route: owner-safe reads/writes stay on direct Firestore REST.
 */
export function createWorkerApp(verifyUid: VerifyUid = requireUid, verifyAppCheck = verifyAppCheckToken) {
  const app = new Hono<{ Bindings: WorkerBindings; Variables: Variables }>();

  app.use('*', async (context, next) => {
    const startedAt = Date.now();
    context.set('requestId', requestId());
    configureRuntimeEnv(context.env);
    const origin = context.req.header('Origin');
    const allowed = origin ? origins(context.env).includes(origin) : false;
    if (origin && !allowed) return context.json({ error: 'Origin not allowed', code: 'origin_denied' }, 403);
    if (allowed && origin) {
      context.header('Access-Control-Allow-Origin', origin);
      context.header('Vary', 'Origin');
      // Must list every header the client actually sends, or the browser blocks
      // the real request after an otherwise-successful preflight. X-Client-Version
      // rides on every call from apps/mobile/src/lib/api-client-core.ts; nothing
      // but this comment keeps the two lists in step.
      context.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck, X-Client-Version');
      context.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (context.req.method === 'OPTIONS') return context.body(null, allowed || !origin ? 204 : 403);
    try {
      await next();
    } finally {
      // Deliberately no request headers, body, token, UID, or error object.
      console.info('[worker] request', {
        requestId: context.get('requestId'), route: context.req.path,
        method: context.req.method, status: context.res.status,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  app.onError((error, context) => routeError(error, context));

  app.get('/health', (context) => context.json({ ok: true }));

  app.use('/api/*', async (context, next) => {
    const uid = await verifyUid(context.req.header('Authorization'));
    const appCheck = await verifyAppCheck(context.req.header('X-Firebase-AppCheck'), context.env);
    // Logged before the throw: under enforce this is the only signal that says
    // *why* a 401 happened. Still never logs the token, the body, or the uid.
    if (!appCheck.verified) console.warn('[worker] app-check-unverified', { reason: appCheck.reason, route: context.req.path });
    if (context.env.APP_CHECK_MODE === 'enforce' && !appCheck.verified) {
      throw new ApiError(401, 'Invalid or missing App Check token', 'app_check_failed');
    }
    context.set('uid', uid);
    await next();
  });

  // Keeps the existing profile response envelope for username/push-token
  // clients, but refuses the owner-safe split field so it stays direct.
  app.patch('/api/profile', async (context) => {
    const parsed = profilePatchInput.safeParse(await context.req.json());
    if (parsed.success && parsed.data.workoutSplit) clientUpgradeRequired();
    if (!parsed.success || (!parsed.data.username && !parsed.data.expoPushToken)) {
      throw new ApiError(400, 'Only username and Expo push-token updates are privileged.');
    }
    const result = await updateProfile(context.get('uid'), {
      ...(parsed.data.username ? { username: parsed.data.username } : {}),
      ...(parsed.data.expoPushToken ? { expoPushToken: parsed.data.expoPushToken } : {}),
    });
    if (result.conflict === true) throw new ApiError(409, 'Profile was modified', 'conflict');
    return context.json({ profile: result.profile });
  });

  app.get('/api/buddies/search', async (context) => context.json({ results: await searchUsers(context.get('uid'), context.req.query('q') ?? '') }));
  app.get('/api/buddies', async (context) => {
    const today = localDate.safeParse(context.req.query('today'));
    if (!today.success) throw new ApiError(400, 'today must be a YYYY-MM-DD local date');
    return context.json(await listBuddies(context.get('uid'), today.data));
  });
  app.post('/api/buddies', async (context) => {
    const parsed = sendBuddyRequestInput.safeParse(await context.req.json());
    if (!parsed.success) throw new ApiError(400, 'Invalid buddy request');
    return context.json(await sendBuddyRequest(context.get('uid'), parsed.data.uid));
  });
  app.post('/api/buddies/:uid', async (context) => {
    const targetUid = buddyUid.safeParse(context.req.param('uid'));
    if (!targetUid.success) throw new ApiError(400, 'Invalid buddy action');
    const parsed = buddyActionInput.safeParse(await context.req.json());
    if (!parsed.success) throw new ApiError(400, 'Invalid buddy action');
    return context.json(await acceptBuddyRequest(context.get('uid'), targetUid.data));
  });
  app.post('/api/buddies/:uid/chop', async (context) => {
    const targetUid = buddyUid.safeParse(context.req.param('uid'));
    if (!targetUid.success) throw new ApiError(400, 'Invalid chop');
    const parsed = chopInput.safeParse(await context.req.json());
    if (!parsed.success) throw new ApiError(400, 'Invalid chop');
    return context.json(await chopBuddy(context.get('uid'), targetUid.data, parsed.data.today));
  });

  app.post('/api/injuries/:id/apply-to-history', async (context) => {
    const { injuries } = await listInjuries(context.get('uid'));
    const injury = injuries.find((candidate) => candidate.id === context.req.param('id'));
    if (!injury) throw new ApiError(404, 'Injury not found');
    return context.json({ affectedWorkoutIds: await applyInjuryToHistory(context.get('uid'), injury) });
  });
  app.post('/api/injuries/:id/remove-from-history', async (context) =>
    context.json({ affectedWorkoutIds: await removeInjuryFromHistory(context.get('uid'), context.req.param('id')) })
  );

  app.post('/api/catalog/pending', async (context) => {
    const parsed = createPendingExerciseInput.safeParse(await context.req.json());
    if (!parsed.success) throw new ApiError(400, 'Invalid pending exercise input');
    return context.json({ exercise: await createPendingExercise(context.get('uid'), parsed.data.name) }, 201);
  });
  app.delete('/api/account/data', async (context) => context.json(await deleteAccountData(context.get('uid'))));

  // Read-only counterpart to POST /api/ai's `remaining`. The client has no
  // other way to learn its credit balance without spending one.
  app.get('/api/ai/quota', async (context) => {
    await assertAIEnabled(context.get('uid'));
    return context.json(await peekQuota(context.get('uid')));
  });

  app.post('/api/ai', async (context) => {
    const body = await context.req.json<{ op?: unknown; input?: unknown }>();
    if (!isAIOp(body.op)) throw new ApiError(400, 'Unknown operation');
    const parsed = AI_OPS[body.op].input.safeParse(body.input ?? {});
    if (!parsed.success) throw new ApiError(400, `Invalid input for op "${body.op}"`);

    // After schema validation (a malformed body should not cost a Firestore
    // read) but before the provider import and every op branch below,
    // `daily-name` included: an account that has not opted in must not reach a
    // provider by any route. The client hides its AI surfaces; the client is
    // not what enforces this.
    await assertAIEnabled(context.get('uid'));

    // Model loading is deferred until an AI request so ordinary privileged
    // routes never pay for a provider SDK at Worker cold start.
    const { generateDailyName, runPrompt } = await import('./ai/prompts.js');
    const uid = context.get('uid');

    if (body.op === 'daily-name') {
      const cached = await getCachedDailyName();
      const name = cached ?? await setCachedDailyName(await generateDailyName());
      // Exempt from the cap, so nothing is claimed — but every /api/ai response
      // carries `remaining` so the client's cached balance refreshes on any AI
      // call, not just the ones that spend.
      return context.json({ data: { name }, remaining: (await peekQuota(uid)).remaining });
    }

    let claimed = false;
    try {
      const remaining = await consumeQuota(uid);
      claimed = true;
      const data = await runPrompt(body.op as Exclude<AIOp, 'daily-name'>, parsed.data as AIOpInput<Exclude<AIOp, 'daily-name'>>);
      claimed = false;
      return context.json({ data, remaining });
    } catch (error) {
      if (claimed) await refundQuota(uid);
      throw error;
    }
  });

  // Cutover tombstones. They stay behind auth/App Check so a stale client
  // receives an actionable upgrade error without turning the Worker into a
  // public route oracle. Exact privileged routes above win before these.
  app.get('/api/profile', clientUpgradeRequired);
  app.all('/api/workouts', clientUpgradeRequired);
  app.all('/api/workouts/*', clientUpgradeRequired);
  app.all('/api/injuries', clientUpgradeRequired);
  app.all('/api/injuries/:id', clientUpgradeRequired);
  app.get('/api/catalog', clientUpgradeRequired);
  app.all('/api/pushup-challenge', clientUpgradeRequired);
  app.all('/api/sync/*', clientUpgradeRequired);

  return app;
}

const app = createWorkerApp();
export default { fetch: app.fetch };
