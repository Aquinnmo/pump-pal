export const APPLE_PROVIDER_ID = 'apple.com';

type ProviderDataEntry = { providerId?: string | null };

export class AppleLinkUserChangedError extends Error {
  code = 'auth/apple-link-user-changed';

  constructor() {
    super('Your signed-in account changed while Apple was connecting. Try again.');
    this.name = 'AppleLinkUserChangedError';
  }
}

export function hasAppleProvider(providerData: readonly ProviderDataEntry[]): boolean {
  return providerData.some((provider) => provider.providerId === APPLE_PROVIDER_ID);
}
