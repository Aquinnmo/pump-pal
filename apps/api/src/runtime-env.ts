// Server configuration shared by the Vercel adapter and the Cloudflare
// Worker. The Worker sets bindings per request; Vercel continues to use
// process.env. Keeping this tiny avoids a second Firestore implementation.
let bindings: Record<string, string | undefined> | undefined;

export function configureRuntimeEnv(next: Record<string, string | undefined> | undefined): void {
  bindings = next;
}

export function runtimeEnv(name: string): string | undefined {
  if (bindings?.[name]) return bindings[name];
  return typeof process === 'undefined' ? undefined : process.env[name];
}

export function requiredRuntimeEnv(name: string): string {
  const value = runtimeEnv(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
