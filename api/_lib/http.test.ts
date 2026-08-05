import assert from 'node:assert/strict';

// withRoute's cold-start env check runs at import time, so these must be set
// before the import — mirrors how a real Vercel invocation would have them
// injected before the module loads.
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';
process.env.API_ALLOWED_ORIGINS = 'https://timber-preview.adam-montgomery.ca';

const { withRoute } = await import('./http.js');

// Minimal VercelRequest/VercelResponse stand-ins -- just enough surface for
// withRoute's own logic, not a full HTTP mock.
function fakeReq(overrides: Partial<{ method: string; headers: Record<string, string>; url: string }>) {
  return { method: 'GET', headers: {}, url: '/api/test', ...overrides } as any;
}

function fakeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

async function run() {
  const noopHandler = async (_req: any, res: any) => {
    res.status(200).json({ ok: true });
  };

  // OPTIONS from an allowed origin succeeds with CORS headers, no auth needed.
  {
    const req = fakeReq({ method: 'OPTIONS', headers: { origin: 'https://timber-preview.adam-montgomery.ca' } });
    const res = fakeRes();
    await withRoute(['GET'], noopHandler)(req, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://timber-preview.adam-montgomery.ca');
  }

  // OPTIONS from a disallowed origin is denied.
  {
    const req = fakeReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
    const res = fakeRes();
    await withRoute(['GET'], noopHandler)(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  }

  // A non-OPTIONS request from a disallowed origin is denied before auth/handler runs.
  {
    const req = fakeReq({ method: 'GET', headers: { origin: 'https://evil.example.com' } });
    const res = fakeRes();
    await withRoute(['GET'], noopHandler)(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal((res.body as any).code, 'origin_denied');
  }

  // A request with no Origin header (native app) is never CORS-denied; it
  // proceeds to the method/auth checks instead.
  {
    const req = fakeReq({ method: 'POST' }); // wrong method, no origin
    const res = fakeRes();
    await withRoute(['GET'], noopHandler)(req, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['Allow'], 'GET');
  }

  // Missing bearer token fails auth without ever reaching the handler.
  {
    let handlerCalled = false;
    const req = fakeReq({ method: 'GET' });
    const res = fakeRes();
    await withRoute(['GET'], async (_req, res) => {
      handlerCalled = true;
      res.status(200).json({ ok: true });
    })(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(handlerCalled, false);
  }

  console.log('http: all assertions passed');
}

run();
