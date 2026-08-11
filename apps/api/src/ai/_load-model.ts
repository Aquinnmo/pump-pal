// Test helper for model.test.ts: a bare module load, spawned as its own
// process per env scenario since the real validation runs at import time.
import './model.js';
console.log('loaded');
