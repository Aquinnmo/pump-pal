const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const path = require('node:path');

const {
  fieldsToJs,
  firestoreValueToJs,
  getAccessToken,
  listDocuments,
  requestJson,
  snapshotLegacyWorkouts,
} = require('./firestore-readonly-snapshot');

function mockHttpsRequest(responses) {
  const calls = [];
  const originalRequest = https.request;

  https.request = (url, options, callback) => {
    const request = new EventEmitter();
    const call = { url: String(url), options, body: '' };
    request.write = (chunk) => {
      call.body += chunk;
    };
    request.end = () => {
      const response = responses.shift();
      if (!response) {
        throw new Error(`No mocked response for ${url}`);
      }

      process.nextTick(() => {
        if (response.error) {
          request.emit('error', response.error);
          return;
        }

        const result = new EventEmitter();
        result.statusCode = response.statusCode ?? 200;
        callback(result);
        if (response.body !== undefined) result.emit('data', Buffer.from(response.body));
        result.emit('end');
      });
    };
    calls.push(call);
    return request;
  };

  return {
    calls,
    restore() {
      https.request = originalRequest;
    },
  };
}

function jsonResponse(value, statusCode = 200) {
  return { statusCode, body: JSON.stringify(value) };
}

function firestoreString(value) {
  return { stringValue: value };
}

function document(name, fields = {}) {
  return { name: `projects/test/databases/(default)/documents/${name}`, fields };
}

async function testFirestoreValueDecoding() {
  const timestamp = '2026-08-02T12:34:56.123456789Z';
  assert.equal(firestoreValueToJs({ nullValue: 'NULL_VALUE' }), null);
  assert.equal(firestoreValueToJs({ booleanValue: false }), false);
  assert.equal(firestoreValueToJs({ integerValue: '42' }), 42);
  assert.equal(firestoreValueToJs({ doubleValue: '3.5' }), 3.5);
  assert.deepEqual(firestoreValueToJs({ timestampValue: timestamp }), {
    seconds: Math.floor(Date.parse(timestamp) / 1000),
    nanoseconds: 123456789,
  });
  assert.equal(firestoreValueToJs({ stringValue: 'Push Day' }), 'Push Day');
  assert.deepEqual(firestoreValueToJs({ arrayValue: {} }), []);
  assert.deepEqual(
    firestoreValueToJs({
      arrayValue: {
        values: [{ integerValue: '2' }, { mapValue: { fields: { done: { booleanValue: true } } } }],
      },
    }),
    [2, { done: true }]
  );
  assert.deepEqual(
    fieldsToJs({
      reference: { referenceValue: 'projects/test/databases/(default)/documents/users/u1' },
      location: { geoPointValue: { latitude: 43.5, longitude: -80.2 } },
      bytes: { bytesValue: 'AQI=' },
    }),
    {
      reference: 'projects/test/databases/(default)/documents/users/u1',
      location: { latitude: 43.5, longitude: -80.2 },
      bytes: 'AQI=',
    }
  );
  assert.equal(firestoreValueToJs({}), undefined);
}

async function testListDocumentsPaginates() {
  const mock = mockHttpsRequest([
    jsonResponse({ documents: [document('users/u1')], nextPageToken: 'page-2' }),
    jsonResponse({ documents: [document('users/u2')] }),
  ]);

  try {
    const documents = await listDocuments({
      accessToken: 'test-token',
      projectId: 'test-project',
      collectionPath: 'users',
    });

    assert.deepEqual(documents.map((entry) => entry.name.split('/').pop()), ['u1', 'u2']);
    assert.equal(mock.calls.length, 2);
    const firstUrl = new URL(mock.calls[0].url);
    const secondUrl = new URL(mock.calls[1].url);
    assert.equal(firstUrl.searchParams.get('pageSize'), '300');
    assert.equal(firstUrl.searchParams.get('pageToken'), null);
    assert.equal(secondUrl.searchParams.get('pageSize'), '300');
    assert.equal(secondUrl.searchParams.get('pageToken'), 'page-2');
    assert.equal(mock.calls[0].options.headers.Authorization, 'Bearer test-token');
  } finally {
    mock.restore();
  }
}

async function testRequestJsonBoundaries() {
  let mock = mockHttpsRequest([jsonResponse({ ok: true })]);
  try {
    assert.deepEqual(await requestJson('https://example.test/ok'), { ok: true });
  } finally {
    mock.restore();
  }

  mock = mockHttpsRequest([{ statusCode: 200, body: '{not-json' }]);
  try {
    await assert.rejects(requestJson('https://example.test/malformed'), {
      message: 'Invalid JSON from https://example.test/malformed: {not-json',
    });
  } finally {
    mock.restore();
  }

  mock = mockHttpsRequest([jsonResponse({ error: 'denied' }, 403)]);
  try {
    await assert.rejects(requestJson('https://example.test/denied'), {
      message: 'HTTP 403 from https://example.test/denied: {"error":"denied"}',
    });
  } finally {
    mock.restore();
  }

  mock = mockHttpsRequest([{ error: new Error('socket unavailable') }]);
  try {
    await assert.rejects(requestJson('https://example.test/network'), { message: 'socket unavailable' });
  } finally {
    mock.restore();
  }
}

async function testAccessTokenRequestUsesJwtBearerBoundary() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const mock = mockHttpsRequest([jsonResponse({ access_token: 'access-token' })]);

  try {
    const accessToken = await getAccessToken({
      client_email: 'readonly@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    assert.equal(accessToken, 'access-token');
    assert.equal(mock.calls.length, 1);
    assert.match(mock.calls[0].body, /^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=[^&]+$/);
    assert.equal(mock.calls[0].options.method, 'POST');
    assert.equal(mock.calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(mock.calls[0].options.headers['Content-Length'], Buffer.byteLength(mock.calls[0].body));
  } finally {
    mock.restore();
  }
}

async function testSnapshotShapesLegacyWorkoutsWithoutLiveCredentials() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'firestore-snapshot-test-'));
  const credentialPath = path.join(tempDirectory, 'service-account.json');
  const outputPath = path.join(tempDirectory, 'nested', 'snapshot.json');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(
    credentialPath,
    JSON.stringify({
      project_id: 'test-project',
      client_email: 'readonly@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
  );

  const mock = mockHttpsRequest([
    jsonResponse({ access_token: 'access-token' }),
    jsonResponse({ documents: [document('users/u1')], nextPageToken: 'users-page-2' }),
    jsonResponse({ documents: [document('users/u2')] }),
    jsonResponse({
      documents: [
        document('users/u1/workouts/w1', {
          startedAt: { timestampValue: '2026-08-02T12:34:56.123Z' },
          completed: { booleanValue: true },
          sets: { arrayValue: { values: [{ mapValue: { fields: { reps: { integerValue: '8' } } } }] } },
        }),
      ],
      nextPageToken: 'workouts-page-2',
    }),
    jsonResponse({ documents: [document('users/u1/workouts/w2', { note: firestoreString('second') })] }),
    jsonResponse({ documents: [] }),
  ]);

  try {
    const result = await snapshotLegacyWorkouts({ credentialPath, outputPath });
    assert.equal(result.projectId, 'test-project');
    assert.equal(result.userCount, 2);
    assert.equal(result.workoutCount, 2);
    assert.equal(result.outputPath, outputPath);
    assert.equal(mock.calls.length, 6);

    const snapshot = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(snapshot.projectId, 'test-project');
    assert.match(snapshot.exportedAt, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(snapshot.users, {
      u1: {
        workouts: {
          w1: {
            startedAt: { seconds: Math.floor(Date.parse('2026-08-02T12:34:56.123Z') / 1000), nanoseconds: 123000000 },
            completed: true,
            sets: [{ reps: 8 }],
          },
          w2: { note: 'second' },
        },
      },
      u2: { workouts: {} },
    });

    assert.equal(new URL(mock.calls[1].url).pathname.endsWith('/documents/users'), true);
    assert.equal(mock.calls[1].options.headers.Authorization, 'Bearer access-token');
    assert.equal(new URL(mock.calls[3].url).pathname.endsWith('/documents/users/u1/workouts'), true);
    assert.equal(new URL(mock.calls[4].url).searchParams.get('pageToken'), 'workouts-page-2');
  } finally {
    mock.restore();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function main() {
  await testFirestoreValueDecoding();
  await testListDocumentsPaginates();
  await testRequestJsonBoundaries();
  await testAccessTokenRequestUsesJwtBearerBoundary();
  await testSnapshotShapesLegacyWorkoutsWithoutLiveCredentials();
  console.log('firestore-readonly-snapshot.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
