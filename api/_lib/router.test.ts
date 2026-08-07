import assert from 'node:assert/strict';

// Route modules pull in withRoute, whose cold-start env check runs at import
// time -- same reason http.test.ts sets these before importing.
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';
process.env.API_ALLOWED_ORIGINS = 'https://timber-preview.adam-montgomery.ca';
// The AI route's provider registration validates these at module load. That it
// is needed only here, and only because this test deliberately loads *every*
// route module, is the point of the router's lazy imports: a workout request
// never evaluates this tree.
process.env.AI_PROVIDER = 'openai';
process.env.AI_MODEL = 'gpt-test';
process.env.OPENAI_API_KEY = 'test-key';

const { matchRoute, normalizePath, dispatch, requestPath } = await import('./router.js');

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

/** Asserts the url resolves to the exact handler exported at `module#name`. */
async function assertResolves(url: string, modulePath: string, name: string) {
  const match = matchRoute(url);
  assert.ok(match, `${url} matched no route`);
  const handler = await match.route.load();
  const expected = (await import(modulePath))[name];
  assert.equal(handler, expected, `${url} resolved to the wrong handler`);
  return match;
}

async function run() {
  // Static-before-dynamic. These are the pairs where a wrong table order
  // silently routes to the neighbour instead of failing loudly.
  const reorder = await assertResolves('/api/workouts/reorder', './routes/workouts.js', 'reorder');
  assert.equal(reorder.id, undefined, 'reorder must not be captured as a workout id');

  const item = await assertResolves('/api/workouts/abc123', './routes/workouts.js', 'item');
  assert.equal(item.id, 'abc123');

  const apply = await assertResolves('/api/injuries/inj-1/apply-to-history', './routes/injuries.js', 'applyToHistory');
  assert.equal(apply.id, 'inj-1');

  const remove = await assertResolves(
    '/api/injuries/inj-1/remove-from-history',
    './routes/injuries.js',
    'removeFromHistory'
  );
  assert.equal(remove.id, 'inj-1');

  const injuryItem = await assertResolves('/api/injuries/inj-1', './routes/injuries.js', 'item');
  assert.equal(injuryItem.id, 'inj-1');

  await assertResolves('/api/catalog/pending', './routes/catalog.js', 'pending');
  await assertResolves('/api/catalog', './routes/catalog.js', 'catalog');

  // Buddies: `search` must not parse as a uid, and `:uid/chop` must reach the
  // notifications module rather than the accept handler.
  const search = await assertResolves('/api/buddies/search', './routes/buddies.js', 'search');
  assert.equal(search.id, undefined, 'search must not be captured as a buddy uid');

  const chop = await assertResolves('/api/buddies/uid-1/chop', './routes/notifications.js', 'chop');
  assert.equal(chop.id, 'uid-1');

  const buddyItem = await assertResolves('/api/buddies/uid-1', './routes/buddies.js', 'item');
  assert.equal(buddyItem.id, 'uid-1');

  await assertResolves('/api/buddies', './routes/buddies.js', 'collection');

  // Every remaining route still reachable at its original URL.
  await assertResolves('/api/ai', './routes/ai.js', 'ai');
  await assertResolves('/api/account/data', './routes/account.js', 'data');
  await assertResolves('/api/injuries', './routes/injuries.js', 'collection');
  await assertResolves('/api/profile', './routes/profile.js', 'profile');
  await assertResolves('/api/pushup-challenge', './routes/pushup-challenge.js', 'pushupChallenge');
  await assertResolves('/api/sync/manifest', './routes/sync.js', 'manifest');
  await assertResolves('/api/sync/pull', './routes/sync.js', 'pullEntities');
  await assertResolves('/api/workouts', './routes/workouts.js', 'collection');

  // Query strings and a trailing slash must not defeat matching.
  assert.equal(normalizePath('/api/workouts?status=planned&limit=10'), '/api/workouts');
  assert.equal(normalizePath('/api/workouts/'), '/api/workouts');
  await assertResolves('/api/sync/manifest?cursor=abc&limit=200', './routes/sync.js', 'manifest');
  assert.equal(matchRoute('/api/workouts/abc?x=1')?.id, 'abc');

  // Percent-encoded ids survive the round trip.
  const encoded = matchRoute('/api/workouts/a%2Fb');
  assert.equal(encoded?.id, 'a%2Fb', 'match keeps the raw segment; dispatch decodes it');

  // Unknown paths 404 in withRoute's envelope, and a nested path does not
  // fall through to a shorter pattern.
  assert.equal(matchRoute('/api/nope'), undefined);
  assert.equal(matchRoute('/api/workouts/abc/extra'), undefined);
  assert.equal(matchRoute('/api'), undefined);

  // vercel.json rewrites /api/:path* to /api?path=:path*, so the segments
  // arrive as a query param. Routing on req.url alone is what shipped every
  // multi-segment route broken: as a bracket catch-all the platform 404'd
  // /api/sync/manifest without ever invoking the function.
  assert.equal(requestPath({ url: '/api?path=sync/manifest', query: { path: 'sync/manifest' } }), '/api/sync/manifest');
  assert.equal(requestPath({ url: '/api', query: { path: ['workouts', 'abc'] } }), '/api/workouts/abc');
  assert.equal(requestPath({ url: '/api', query: { path: '/profile' } }), '/api/profile');
  // No param (direct hit, or a rewrite that kept the original url) -> req.url.
  assert.equal(requestPath({ url: '/api/profile?x=1', query: {} }), '/api/profile');
  assert.equal(requestPath({ url: '/api/profile', query: { path: '' } }), '/api/profile');

  const rewritten = matchRoute(requestPath({ url: '/api?path=sync/manifest', query: { path: 'sync/manifest' } }));
  assert.ok(rewritten, 'a rewritten nested path must still match');
  assert.equal(await rewritten.route.load(), (await import('./routes/sync.js')).manifest);

  // An unmatched path never reaches withRoute, so dispatch has to emit the
  // log line itself -- otherwise a wrong URL is invisible server-side and
  // "nothing in the logs" can't be told apart from "the request never arrived".
  const logged: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]) => void logged.push(String(args[0]));

  const res = fakeRes();
  try {
    await dispatch({ url: '/api/nope?x=1', method: 'GET', query: {} } as any, res);
  } finally {
    console.log = realLog;
  }

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not found', code: 'not_found' });

  assert.equal(logged.length, 1, 'a router miss must log exactly once');
  const entry = JSON.parse(logged[0]);
  assert.equal(entry.route, '/api/nope', 'logs the normalized path, not the raw url');
  assert.equal(entry.method, 'GET');
  assert.equal(entry.status, 404);
  assert.equal(entry.unmatched, true);
  assert.ok(typeof entry.requestId === 'string' && entry.requestId.length > 0);

  console.log('router: all assertions passed');
}

await run();
