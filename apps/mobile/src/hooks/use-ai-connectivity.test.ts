import assert from 'node:assert/strict';
import { renderHook } from '@testing-library/react';

type NetInfo = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

let platform: 'ios' | 'web' = 'ios';
let netInfo: NetInfo = {};

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// The mobile preload registers package doubles before test files run. Register
// these two seams again so each assertion can vary platform and connectivity.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'ai-connectivity-test-doubles',
  setup(build: Build) {
    build.module('@react-native-community/netinfo', () => ({
      exports: { useNetInfo: () => netInfo },
      loader: 'object',
    }));
    build.module('react-native', () => ({
      exports: { Platform: { get OS() { return platform; } } },
      loader: 'object',
    }));
  },
});

const { useAIGenerationAvailable } = await import('./use-ai-connectivity');

function readAvailability(): boolean {
  const rendered = renderHook(() => useAIGenerationAvailable());
  const value = rendered.result.current;
  rendered.unmount();
  return value;
}

// Unknown connectivity is treated as available so a temporary lack of
// reachability information does not hide generation controls on native.
platform = 'ios';
netInfo = { isConnected: null, isInternetReachable: null };
assert.equal(readAvailability(), true, 'null connectivity remains available');
netInfo = {};
assert.equal(readAvailability(), true, 'unknown connectivity remains available');

// A known offline signal disables generation.
netInfo = { isConnected: false, isInternetReachable: true };
assert.equal(readAvailability(), false, 'disconnected native state is unavailable');
netInfo = { isConnected: true, isInternetReachable: false };
assert.equal(readAvailability(), false, 'unreachable native state is unavailable');

// The web implementation is always available, even if its mocked NetInfo
// state reports disconnected.
platform = 'web';
netInfo = { isConnected: false, isInternetReachable: false };
assert.equal(readAvailability(), true, 'web is always available');

console.log('use-ai-connectivity: all assertions passed');
