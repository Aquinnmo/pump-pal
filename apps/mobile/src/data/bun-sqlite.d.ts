// Minimal ambient types for 'bun:sqlite' — only the members
// apps/mobile/src/data/test-executor.ts uses. Deliberately not @types/bun:
// that package redeclares fetch/Request globally and collides with
// react-native's globals under this project's tsconfig `types: ["node", "react"]`.
declare module 'bun:sqlite' {
  class Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    all<T = unknown>(...params: unknown[]): T[];
    get<T = unknown>(...params: unknown[]): T | null;
  }

  export class Database {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}
