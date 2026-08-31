import { getDb } from './client';
import { createSingletonRepository } from './singleton-repository';
import { UserDoc } from '@/types/user';

// users/{uid} — see docs/data-model/users.md. `get()` returns null for a
// user who hasn't completed onboarding yet, same non-existence handling the
// Firestore doc had (callers must not assume the row always exists).
export const profileRepository = createSingletonRepository<UserDoc>(getDb, 'profile', 'profile');
