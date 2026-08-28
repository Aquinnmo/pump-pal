// Minimal ambient types for 'bun:test'. Deliberately not @types/bun:
// that package redeclares fetch/Request globally and collides with
// react-native's globals under this project's tsconfig `types: ["node", "react"]`.
declare module 'bun:test' {
  type TestFn = (name: string, fn: () => unknown | Promise<unknown>) => void;

  interface Matchers<T = unknown> {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toMatch(expected: RegExp | string): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toThrow(expected?: RegExp | string): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    not: Matchers<T>;
  }

  export function describe(name: string, fn: () => void): void;
  export const it: TestFn;
  export const test: TestFn;
  export function expect<T = unknown>(actual: T): Matchers<T>;
  export function beforeEach(fn: () => unknown | Promise<unknown>): void;
  export function afterEach(fn: () => unknown | Promise<unknown>): void;
  export const mock: {
    module(path: string, factory: () => Record<string, unknown>): void;
    fn<T extends (...args: any[]) => any>(implementation?: T): T;
    clearAllMocks(): void;
    resetAllMocks(): void;
  };
}
