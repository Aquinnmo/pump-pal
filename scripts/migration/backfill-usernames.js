// One-off backfill: give every existing Firebase Auth user a unique
// `users/{uid}.username` + `usernames/{lower}` reservation, derived from
// their current displayName. Real, one-directional Firestore write
// migration — run explicitly (--apply), not part of the dev loop.
//
// Needs a broader OAuth scope than the read-only Firestore scripts (this one
// also lists Firebase Auth users via the Identity Toolkit REST API), so it
// signs its own JWT rather than reusing firestore-readonly-snapshot.js's
// Firestore-only getAccessToken.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { requestJson, fieldsToJs, docId } = require('./firestore-readonly-snapshot');
const { jsObjectToFirestoreFields, firestoreTimestamp } = require('./seed-exercise-catalog');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit',
].join(' ');
const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: SCOPES,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key);
  return `${unsigned}.${base64url(signature)}`;
}

async function getAccessToken(serviceAccount) {
  const assertion = createJwt(serviceAccount);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();
  const data = await requestJson(
    TOKEN_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
    body
  );
  return data.access_token;
}

function slugifyUsername(input) {
  const slug = (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 20);
  return slug.length >= 3 ? slug : 'athlete';
}

/** Appends a random numeric suffix until `lower` isn't in `taken`, keeping the 20-char cap. */
function dedupeUsername(base, taken) {
  let candidate = base;
  while (taken.has(candidate)) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }
  return candidate;
}

async function listAuthUsers({ accessToken, projectId }) {
  const users = [];
  let nextPageToken;
  do {
    const body = JSON.stringify({ maxResults: 1000, nextPageToken });
    const data = await requestJson(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      body
    );
    users.push(...(data.userInfo || data.recordsCount ? data.userInfo || [] : []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return users;
}

async function getUserDoc({ accessToken, projectId, uid }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  try {
    const doc = await requestJson(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    return fieldsToJs(doc.fields || {});
  } catch (error) {
    if (String(error.message).startsWith('HTTP 404')) return null;
    throw error;
  }
}

async function commitReservation({ accessToken, projectId, uid, username }) {
  const lower = username.toLowerCase();
  const body = JSON.stringify({
    writes: [
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/usernames/${lower}`,
          fields: jsObjectToFirestoreFields({ uid, username, createdAt: firestoreTimestamp(new Date().toISOString()) }),
        },
        updateMask: { fieldPaths: ['uid', 'username', 'createdAt'] },
        currentDocument: { exists: false },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/users/${uid}`,
          fields: jsObjectToFirestoreFields({ username, usernameLower: lower }),
        },
        updateMask: { fieldPaths: ['username', 'usernameLower'] },
      },
    ],
  });
  await requestJson(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
    body
  );
}

function parseArgs(argv) {
  const args = { apply: false, credentialPath: 'pumppal-read-only-perms.json' };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--credential') {
      args.credentialPath = argv[index + 1];
      index += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function backfillUsernames({ apply, credentialPath }) {
  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(credentialPath), 'utf8'));
  const accessToken = await getAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id;

  const authUsers = await listAuthUsers({ accessToken, projectId });
  const taken = new Set();
  const plan = [];

  for (const authUser of authUsers) {
    const uid = authUser.localId;
    const userDoc = await getUserDoc({ accessToken, projectId, uid });
    if (userDoc && userDoc.usernameLower) {
      taken.add(userDoc.usernameLower);
      continue;
    }

    const base = slugifyUsername(authUser.displayName || (authUser.email || '').split('@')[0]);
    const username = dedupeUsername(base, taken);
    taken.add(username);
    plan.push({ uid, username });
  }

  if (apply) {
    for (const { uid, username } of plan) {
      await commitReservation({ accessToken, projectId, uid, username });
    }
  }

  return { projectId, totalUsers: authUsers.length, planned: plan, applied: apply };
}

async function run(argv) {
  const args = parseArgs(argv);
  const result = await backfillUsernames(args);

  console.log(`Project: ${result.projectId}`);
  console.log(`Auth users: ${result.totalUsers}`);
  console.log(`Users needing a username: ${result.planned.length}`);
  result.planned.slice(0, 20).forEach(({ uid, username }) => console.log(`- ${uid} -> ${username}`));
  console.log(result.applied ? 'Applied.' : 'Dry run only; pass --apply to write Firestore.');
}

if (require.main === module) {
  run(process.argv).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { backfillUsernames, slugifyUsername, dedupeUsername, USERNAME_REGEX };
