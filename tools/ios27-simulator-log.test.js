#!/usr/bin/env node
const assert = require('node:assert/strict');
const { onMessage } = require('../node_modules/@expo/cli/build/src/start/platforms/ios/simctlLogging');

const messages = [];
const originalError = console.error;
console.error = (message) => messages.push(message);

try {
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.coreanimation',
    eventMessage: 'cannot add handler to 0 from 0 - dropping',
  });
  assert.equal(messages.length, 0, 'exact simulator noise should be hidden');

  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.coreanimation',
    eventMessage: 'cannot add handler to 1 from 0 - dropping',
  });
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.other',
    eventMessage: 'cannot add handler to 0 from 0 - dropping',
  });
  onMessage({
    messageType: 'Error',
    subsystem: 'com.example.app',
    eventMessage: 'real native failure',
  });
  assert.equal(messages.length, 3, 'other native errors should remain visible');
  assert.ok(messages.some((message) => message.includes('real native failure')));
} finally {
  console.error = originalError;
}

console.log('iOS 27 simulator log filter: exact noise hidden; other errors visible');
