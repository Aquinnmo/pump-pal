import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'bun:test';

import { getAppCheckToken, setAppCheckTokenProvider } from './app-check-token';

afterEach(() => {
  setAppCheckTokenProvider(undefined);
});

function captureWarnings() {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  return {
    warnings,
    restore: () => {
      console.warn = originalWarn;
    },
  };
}

describe('App Check token provider', () => {
  it('returns null and warns when no provider is registered', async () => {
    const warningCapture = captureWarnings();
    try {
      assert.equal(await getAppCheckToken(), null);
      assert.equal(warningCapture.warnings.length, 1);
      assert.match(warningCapture.warnings[0]!, /no token provider registered/);
    } finally {
      warningCapture.restore();
    }
  });

  it('acquires a token from the registered provider', async () => {
    let calls = 0;
    setAppCheckTokenProvider(async () => {
      calls += 1;
      return 'attestation-token';
    });

    assert.equal(await getAppCheckToken(), 'attestation-token');
    assert.equal(calls, 1);
  });

  it('uses the newest provider after re-registration', async () => {
    setAppCheckTokenProvider(async () => 'first-token');
    assert.equal(await getAppCheckToken(), 'first-token');

    setAppCheckTokenProvider(async () => 'second-token');
    assert.equal(await getAppCheckToken(), 'second-token');

    const warningCapture = captureWarnings();
    try {
      setAppCheckTokenProvider(undefined);
      assert.equal(await getAppCheckToken(), null);
    } finally {
      warningCapture.restore();
    }
  });

  it('falls back to null and warns when the provider fails', async () => {
    const warningCapture = captureWarnings();
    try {
      setAppCheckTokenProvider(async () => {
        throw new Error('native provider unavailable');
      });

      assert.equal(await getAppCheckToken(), null);
      assert.equal(warningCapture.warnings.length, 1);
      assert.match(warningCapture.warnings[0]!, /token provider threw/);
      assert.match(warningCapture.warnings[0]!, /native provider unavailable/);
    } finally {
      warningCapture.restore();
    }
  });

  it('does not cache tokens between provider calls', async () => {
    let calls = 0;
    setAppCheckTokenProvider(async () => `token-${++calls}`);

    assert.equal(await getAppCheckToken(), 'token-1');
    assert.equal(await getAppCheckToken(), 'token-2');
    assert.equal(calls, 2);
  });
});
