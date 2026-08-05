export type SignOutSafety = { pending: number; conflicts: number };

export async function getSignOutSafety(_uid: string): Promise<SignOutSafety> {
  return { pending: 0, conflicts: 0 };
}

export async function syncBeforeSignOut(_uid: string): Promise<SignOutSafety> {
  return { pending: 0, conflicts: 0 };
}

export async function purgeLocalAccountData(_uid: string): Promise<void> {}
