// Tokens are short-lived credentials. Keep only an in-memory provider; never
// persist a token in SQLite, AsyncStorage, or logs.
let provider: (() => Promise<string | null>) | undefined;

export function setAppCheckTokenProvider(next: (() => Promise<string | null>) | undefined): void {
  provider = next;
}

export async function getAppCheckToken(): Promise<string | null> {
  try {
    return provider ? await provider() : null;
  } catch {
    return null;
  }
}
