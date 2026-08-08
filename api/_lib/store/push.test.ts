import assert from 'node:assert/strict';

process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';

const { sendPush } = await import('./push.js');

type LogCall = { level: 'info' | 'warn' | 'error'; args: unknown[] };

function harness(options: {
  token?: string;
  status?: number;
  body?: unknown;
  fetchError?: Error;
}) {
  const calls: LogCall[] = [];
  const requests: { url: string; init?: RequestInit }[] = [];
  const log = {
    info: (...args: unknown[]) => calls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
    error: (...args: unknown[]) => calls.push({ level: 'error', args }),
  };

  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (options.fetchError) throw options.fetchError;
    return new Response(JSON.stringify(options.body ?? {}), {
      status: options.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    calls,
    requests,
    deps: {
      loadToken: async () => options.token,
      fetch: fetchImpl as typeof fetch,
      log,
    },
  };
}

{
  const test = harness({});
  assert.equal(await sendPush('recipient', { title: 'Timber', body: 'Chop' }, test.deps), false);
  assert.equal(test.requests.length, 0);
  assert.match(String(test.calls[0]?.args[0]), /no registered Expo push token/);
}

{
  const test = harness({ token: 'ExponentPushToken[test]', status: 503 });
  assert.equal(await sendPush('recipient', { title: 'Timber', body: 'Chop' }, test.deps), false);
  assert.match(String(test.calls[0]?.args[0]), /HTTP 503/);
}

{
  const test = harness({
    token: 'ExponentPushToken[test]',
    body: {
      data: {
        status: 'error',
        message: 'The device is not registered',
        details: { error: 'DeviceNotRegistered' },
      },
    },
  });
  assert.equal(await sendPush('recipient', { title: 'Timber', body: 'Chop' }, test.deps), false);
  assert.match(String(test.calls[0]?.args[0]), /DeviceNotRegistered/);
}

{
  const test = harness({
    token: 'ExponentPushToken[test]',
    body: { data: { status: 'ok', id: 'receipt-123' } },
  });
  assert.equal(
    await sendPush(
      'recipient',
      { title: 'Timber', body: 'Someone chopped you', data: { type: 'chop' } },
      test.deps
    ),
    true
  );
  const payload = JSON.parse(String(test.requests[0]?.init?.body));
  assert.equal(payload.channelId, 'chops');
  assert.equal(payload.priority, 'high');
  assert.equal(payload.data.type, 'chop');
  assert.match(String(test.calls[0]?.args[0]), /receipt-123/);
}

{
  const test = harness({ token: 'ExponentPushToken[test]', fetchError: new Error('offline') });
  assert.equal(await sendPush('recipient', { title: 'Timber', body: 'Chop' }, test.deps), false);
  assert.match(String(test.calls[0]?.args[0]), /request failed/);
}

console.log('push: all assertions passed');
