import type { Persistence } from 'firebase/auth';

/**
 * `getReactNativePersistence` exists at runtime — @firebase/auth 1.13.4 ships
 * it from its `react-native` export condition (dist/rn/index.rn.d.ts), which
 * is the same build that prints the "initializing Firebase Auth for React
 * Native without providing AsyncStorage" warning when it is missing.
 *
 * TypeScript still can't see it. The package's export map lists its `types`
 * key *before* the `react-native` condition, and conditions are matched in
 * order, so TS resolves dist/auth-public.d.ts and stops — tsconfig's
 * `customConditions: ["react-native"]` never gets a chance to apply. Metro has
 * no such problem, since it resolves the runtime conditions only.
 *
 * Hence this declaration rather than a cast: the signature is real, only its
 * visibility to the type checker is not. Delete it if Firebase ever reorders
 * those keys or publishes the helper from the public entry point.
 */
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
