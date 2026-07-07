const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(serviceAccount.private_key);

  return `${unsigned}.${base64url(signature)}`;
}

function requestJson(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}: ${JSON.stringify(data).slice(0, 500)}`));
          return;
        }

        resolve(data);
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(serviceAccount) {
  const assertion = createJwt(serviceAccount);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const data = await requestJson(
    TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );

  return data.access_token;
}

function firestoreValueToJs(value) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return timestampToLegacyShape(value.timestampValue);
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreValueToJs);
  if ('mapValue' in value) return fieldsToJs(value.mapValue.fields || {});
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  return undefined;
}

function timestampToLegacyShape(timestampValue) {
  const milliseconds = Date.parse(timestampValue);
  const seconds = Math.floor(milliseconds / 1000);
  const nanosMatch = String(timestampValue).match(/\.(\d+)Z$/);
  const nanoseconds = nanosMatch ? Number(nanosMatch[1].padEnd(9, '0').slice(0, 9)) : 0;
  return { seconds, nanoseconds };
}

function fieldsToJs(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)]));
}

function docId(documentName) {
  return documentName.split('/').pop();
}

async function listDocuments({ accessToken, projectId, collectionPath }) {
  const docs = [];
  let pageToken = '';

  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await requestJson(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return docs;
}

async function snapshotLegacyWorkouts({ credentialPath, outputPath }) {
  const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  const projectId = serviceAccount.project_id;
  const accessToken = await getAccessToken(serviceAccount);
  const users = {};

  const userDocs = await listDocuments({ accessToken, projectId, collectionPath: 'users' });

  for (const userDoc of userDocs) {
    const userId = docId(userDoc.name);
    const workoutDocs = await listDocuments({ accessToken, projectId, collectionPath: `users/${userId}/workouts` });
    users[userId] = { workouts: {} };

    for (const workoutDoc of workoutDocs) {
      users[userId].workouts[docId(workoutDoc.name)] = fieldsToJs(workoutDoc.fields || {});
    }
  }

  const snapshot = {
    projectId,
    exportedAt: new Date().toISOString(),
    users,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    projectId,
    userCount: Object.keys(users).length,
    workoutCount: Object.values(users).reduce((sum, user) => sum + Object.keys(user.workouts).length, 0),
    outputPath,
  };
}

async function run(argv) {
  const credentialPath = argv[2] || 'pumppal-read-only-perms.json';
  const outputPath = argv[3] || path.join('migration', 'legacy-workouts.snapshot.json');
  const result = await snapshotLegacyWorkouts({ credentialPath, outputPath });

  console.log(`Read project ${result.projectId}`);
  console.log(`Read ${result.userCount} users`);
  console.log(`Read ${result.workoutCount} legacy workouts`);
  console.log(`Wrote ${result.outputPath}`);
}

if (require.main === module) {
  run(process.argv).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  snapshotLegacyWorkouts,
  firestoreValueToJs,
  getAccessToken,
  requestJson,
  listDocuments,
  fieldsToJs,
};
