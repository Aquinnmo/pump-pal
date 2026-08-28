import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

// The widget implementation is an Android-native package; replace it with
// inert exports so reading its AsyncStorage payload stays a pure test.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'widget-up-next-test-double',
  setup(build: Build) {
    build.module('react-native-android-widget', () => ({
      exports: {
        FlexWidget: () => null,
        TextWidget: () => null,
        requestWidgetUpdate: async () => {},
      },
      loader: 'object',
    }));
  },
});

const { readWidgetUpNext, WIDGET_UP_NEXT_FALLBACK } = await import('./widget-up-next');

const key = 'pumppal_widget_up_next';
await AsyncStorage.removeItem(key);
assert.deepEqual(await readWidgetUpNext(), WIDGET_UP_NEXT_FALLBACK, 'missing cache uses the fallback');

// Each falsy field independently falls back while truthy sibling fields are
// preserved. This is deliberately field-level `||` behavior.
await AsyncStorage.setItem(key, JSON.stringify({
  label: '',
  name: 'Resume Bench Press',
  action: null,
  source: false,
}));
assert.deepEqual(await readWidgetUpNext(), {
  label: WIDGET_UP_NEXT_FALLBACK.label,
  name: 'Resume Bench Press',
  action: WIDGET_UP_NEXT_FALLBACK.action,
  source: WIDGET_UP_NEXT_FALLBACK.source,
});

// Malformed JSON is swallowed and returns the complete fallback object.
await AsyncStorage.setItem(key, '{not-json');
assert.deepEqual(await readWidgetUpNext(), WIDGET_UP_NEXT_FALLBACK, 'malformed cache uses the fallback');

// The widget cache is intentionally one global key, not uid-keyed. Replacing
// that shared payload is visible to the next read regardless of account.
const first = {
  label: 'Up next',
  name: 'Push',
  action: 'Start planned workout',
  source: 'Planned',
};
const second = {
  label: 'Resume',
  name: 'Pull',
  action: 'Resume workout',
  source: 'In progress',
};
await AsyncStorage.removeItem(key);
await AsyncStorage.setItem(key, JSON.stringify(first));
assert.deepEqual(await readWidgetUpNext(), first);
await AsyncStorage.setItem(key, JSON.stringify(second));
assert.deepEqual(await readWidgetUpNext(), second);
assert.equal(
  await AsyncStorage.getItem(`${key}_user-1`),
  null,
  'there is no uid-specific widget cache key',
);

console.log('widget-up-next: all assertions passed');
