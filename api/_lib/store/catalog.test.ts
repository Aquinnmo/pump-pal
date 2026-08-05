import assert from 'node:assert/strict';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ??= 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY ??= 'test-key';

const { slugify, isPublicCatalogEntry } = await import('./catalog.js');

// Must match utils/exercise-catalog.ts slugify() exactly -- this id feeds
// straight into the Firestore doc id (pending-${slug}).
assert.equal(slugify('Cable Fly'), 'cable-fly');
assert.equal(slugify('  Leg  Press!! '), 'leg-press');
assert.equal(slugify("Farmer's Carry"), 'farmer-s-carry');

// isPublicCatalogEntry: must match utils/exercise-catalog.ts loadCatalog()'s
// filter exactly, since GET /api/catalog replaces that read path.
assert.equal(isPublicCatalogEntry({ schemaVersion: 2, name: 'Bench Press' }), true);
assert.equal(isPublicCatalogEntry({ schemaVersion: 2, name: 'X', status: 'pending_review' }), false);
assert.equal(isPublicCatalogEntry({ schemaVersion: 2, name: 'X', status: 'approved' }), true);
assert.equal(isPublicCatalogEntry({ schemaVersion: 1, name: 'X' }), false);
assert.equal(isPublicCatalogEntry({ schemaVersion: 2, name: '' }), false);

console.log('catalog: all assertions passed');
