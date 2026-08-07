// No-op stub for web. The real implementation lives in
// use-push-token.native.ts and Metro serves it on iOS + Android. Web has no
// Expo push token, so a web-only user is simply never deliverable — chops
// still record, they just don't buzz anything.

export function usePushToken(): void {}
