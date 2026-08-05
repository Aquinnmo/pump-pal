// Web build of db/sync-trigger.ts. Web is directly API-backed per request
// (repositories/*.web.ts) — no outbox, no background sync, nothing to
// trigger. Same exported names as the native file, all no-ops, so
// context/auth-context.tsx can call this uniformly without a Platform.OS
// branch, and the web bundle never reaches NetInfo/TaskManager/BackgroundTask.
type UidProvider = () => { uid: string | null; currentUid: string | null };

export function configureSyncTrigger(_provider: UidProvider): void {}
export function startSyncTriggers(): void {}
export function stopSyncTriggers(): void {}
export function triggerSyncAfterWrite(): void {}
// Web repositories read through to the API, so there is never a local row
// waiting to be hydrated — callers can proceed immediately.
export function waitForInitialSync(): Promise<void> { return Promise.resolve(); }
