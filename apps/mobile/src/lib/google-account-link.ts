export const GOOGLE_PROVIDER_ID = 'google.com';

type ProviderDataEntry = { providerId?: string | null; email?: string | null };

export class GoogleLinkEmailMismatchError extends Error {
  code = 'auth/google-email-mismatch';

  constructor() {
    super('The selected Google email does not match this Timber account.');
    this.name = 'GoogleLinkEmailMismatchError';
  }
}

export class GoogleLinkUserChangedError extends Error {
  code = 'auth/google-link-user-changed';

  constructor() {
    super('Your signed-in account changed while Google was connecting. Try again.');
    this.name = 'GoogleLinkUserChangedError';
  }
}

export function hasGoogleProvider(providerData: readonly ProviderDataEntry[]): boolean {
  return providerData.some((provider) => provider.providerId === GOOGLE_PROVIDER_ID);
}

export function googleProviderEmail(providerData: readonly ProviderDataEntry[]): string | null {
  return providerData.find((provider) => provider.providerId === GOOGLE_PROVIDER_ID)?.email ?? null;
}

function normalizedEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLocaleLowerCase();
  return value || null;
}

/**
 * Google is linked only to the user who began the flow and only when its
 * selected email matches the password account. This prevents an accidental
 * cross-email link from becoming a silent account merge.
 */
export function assertGoogleLinkIdentity({
  expectedUid,
  linkedUid,
  accountEmail,
  googleEmail,
}: {
  expectedUid: string;
  linkedUid: string;
  accountEmail: string | null | undefined;
  googleEmail: string | null | undefined;
}): void {
  if (linkedUid !== expectedUid) throw new GoogleLinkUserChangedError();
  if (!accountEmail || !googleEmail || normalizedEmail(accountEmail) !== normalizedEmail(googleEmail)) {
    throw new GoogleLinkEmailMismatchError();
  }
}
