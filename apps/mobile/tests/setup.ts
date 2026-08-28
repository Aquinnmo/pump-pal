import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { useEffect } from 'react';

// Keep browser globals scoped to the mobile package. API and contract tests
// intentionally retain their workerd/Node fetch and Request implementations.
GlobalRegistrator.register();
(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;

type ModuleExports = Record<string, unknown>;
type Build = {
  onResolve(options: { filter: RegExp }, callback: (args: { path: string; importer: string }) => unknown): void;
  module(path: string, callback: () => { exports: ModuleExports; loader: 'object' }): void;
};

// Bun's runtime APIs are intentionally not included in the package's regular
// type environment (see src/bun-test.d.ts).
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
const bunTest = await import('bun:test');
const mock = bunTest.mock as unknown as <T extends (...args: any[]) => any>(implementation?: T) => T;

// The preload owns long-lived module doubles. Clear only their call history
// between tests so shared implementations stay available while assertions
// cannot inherit a prior test's calls.
bunTest.afterEach(() => {
  bunTest.mock.clearAllMocks();
});

const mobileRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const spy = <T extends (...args: any[]) => any>(implementation?: T): T => mock(implementation);

function passthrough(props: { children?: unknown }): unknown {
  return props.children ?? null;
}

const Stack = Object.assign(passthrough, { Screen: passthrough });
const Tabs = Object.assign(passthrough, { Screen: passthrough });
const useFocusEffect = (effect: () => void | (() => void)) => {
  useEffect(() => effect(), [effect]);
};

const router = {
  replace: spy<(href: unknown) => void>(),
  push: spy<(href: unknown) => void>(),
  back: spy<() => void>(),
};

const inMemoryStorage = new Map<string, string>();
const asyncStorage = {
  getItem: async (key: string) => inMemoryStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => void inMemoryStorage.set(key, value),
  removeItem: async (key: string) => void inMemoryStorage.delete(key),
  clear: async () => void inMemoryStorage.clear(),
  getAllKeys: async () => [...inMemoryStorage.keys()],
  multiRemove: async (keys: string[]) => void keys.forEach((key) => inMemoryStorage.delete(key)),
};

function resolveWebModule(base: string): string | undefined {
  // Keep this order synchronized with tools/check-web-native-deps.js: it is
  // the web bundle's platform resolution contract.
  const candidates = [
    `${base}.web.ts`,
    `${base}.web.tsx`,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.web.ts'),
    join(base, 'index.ts'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function resolveMobileImport(path: string, importer: string): string | undefined {
  const bases = path.startsWith('@/')
    ? [join(mobileRoot, 'src', path.slice(2)), join(mobileRoot, path.slice(2))]
    : [join(dirname(importer), path)];

  for (const base of bases) {
    const hit = resolveWebModule(base);
    if (hit) return hit;
  }
  return undefined;
}

function webModuleEntries(directory: string, prefix = ''): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      entries.push(...webModuleEntries(path, relative));
      continue;
    }
    if (!entry.name.endsWith('.web.ts') && !entry.name.endsWith('.web.tsx')) continue;
    const specifier = `@/${relative.replace(/\.web\.(tsx?|jsx?)$/, '')}`;
    entries.push([specifier, path]);
  }
  return entries;
}

plugin({
  name: 'mobile-web-test-harness',
  setup(build: Build) {
    // Bun's package resolver does not invoke onResolve for a package that is
    // already present in node_modules, so register the replacement module as
    // well as the resolver below. This keeps the mapping effective for every
    // import form (`import` and `require`).
    build.module('react-native', () => ({
      exports: require('react-native-web'),
      loader: 'object',
    }));
    build.onResolve({ filter: /^react-native$/ }, () => ({
      path: require.resolve('react-native-web'),
    }));

    build.onResolve({ filter: /^(?:\.\.?\/|@\/)/ }, (args) => {
      const path = resolveMobileImport(args.path, args.importer);
      return path ? { path } : undefined;
    });

    // `onResolve` is used by Bun's bundler, while `bun test`'s runtime
    // resolver only consults module registrations. Register the same aliases
    // for runtime tests so platform selection is web-first in both modes.
    for (const [specifier, path] of webModuleEntries(join(mobileRoot, 'src'))) {
      build.module(specifier, () => ({
        exports: require(path),
        loader: 'object',
      }));
    }

    build.module('expo-router', () => ({
      exports: {
        router,
        useSegments: () => [],
        useLocalSearchParams: () => ({}),
        useFocusEffect,
        Stack,
        Tabs,
        Link: passthrough,
      },
      loader: 'object',
    }));

    build.module('expo/fetch', () => ({
      exports: {
        fetch: spy((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)),
      },
      loader: 'object',
    }));

    build.module('expo-constants', () => ({
      exports: { default: { expoConfig: { version: 'test' } } },
      loader: 'object',
    }));

    build.module('expo-haptics', () => ({
      exports: {
        ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
        NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
        impactAsync: spy<(style: unknown) => Promise<void>>(async () => undefined),
        notificationAsync: spy<(type: unknown) => Promise<void>>(async () => undefined),
      },
      loader: 'object',
    }));

    build.module('expo-notifications', () => ({
      exports: {
        getPermissionsAsync: spy(async () => ({ status: 'granted', granted: true })),
        requestPermissionsAsync: spy(async () => ({ status: 'granted', granted: true })),
        getExpoPushTokenAsync: spy(async () => ({ data: 'test-push-token' })),
        setNotificationHandler: spy(() => undefined),
        AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
      },
      loader: 'object',
    }));

    build.module('expo-sqlite', () => ({
      exports: {
        openDatabaseAsync: spy(async () => { throw new Error('expo-sqlite is unavailable in UI tests'); }),
        deleteDatabaseAsync: spy(async () => undefined),
      },
      loader: 'object',
    }));

    build.module('@react-native-async-storage/async-storage', () => ({
      exports: { default: asyncStorage, ...asyncStorage },
      loader: 'object',
    }));

    build.module('@notifee/react-native', () => ({
      exports: {
        default: {
          requestPermission: spy(async () => undefined),
          createChannel: spy(async () => 'test-channel'),
          displayNotification: spy(async () => undefined),
          cancelNotification: spy(async () => undefined),
          cancelTriggerNotifications: spy(async () => undefined),
          createTriggerNotification: spy(async () => undefined),
        },
        AndroidImportance: { HIGH: 4, DEFAULT: 3 },
        TriggerType: { TIMESTAMP: 0 },
      },
      loader: 'object',
    }));

    build.module('react-native-reorderable-list', () => ({
      exports: {
        default: passthrough,
        ReorderableList: passthrough,
        useReorderableDrag: () => () => undefined,
        reorderItems: <T>(items: T[]) => items,
      },
      loader: 'object',
    }));

    const netInfo = {
      fetch: spy(async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
      addEventListener: spy(() => () => undefined),
      useNetInfo: () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
    };
    build.module('@react-native-community/netinfo', () => ({
      exports: { default: netInfo, ...netInfo },
      loader: 'object',
    }));
  },
});
