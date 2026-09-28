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

  messages.length = 0;
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.BoardServices',
    eventMessage:
      'non-launching port is incompatible with service identifier "com.apple.PointerUI.pointeruid.default-service"',
  });
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.CFNetwork',
    eventMessage: 'TCP Conn 0x119eeb700 Failed : error 0:61 [61]',
  });
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.UIKit',
    eventMessage:
      'RCTScrollViewComponentView implements focusItemsInRect: - caching for linear focus movement is limited as long as this view is on screen.',
  });
  assert.equal(messages.length, 0, 'PointerUI, DevTools probe, and UIKit focus noise should be hidden');

  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.BoardServices',
    eventMessage: 'some other BoardServices failure',
  });
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.CFNetwork',
    eventMessage: 'TCP Conn 0x1 Failed : error 0:60 [60]',
  });
  onMessage({
    messageType: 'Error',
    subsystem: 'com.apple.UIKit',
    eventMessage: 'some other UIKit failure',
  });
  assert.equal(messages.length, 3, 'similar but different errors should remain visible');
} finally {
  console.error = originalError;
}

console.log('iOS 27 simulator log filter: exact noise hidden; other errors visible');
