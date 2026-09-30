import type { BlockedUserDTO } from '@timber/contract/api';
import { ApiError } from '../errors.js';
import { commit, deleteDoc, getDoc, runQuery, ts } from './rest.js';
import { pairId } from './pair-id.js';

/**
 * `blocks/{blockerUid_blockedUid}` — directed, one doc per block, Worker-only
 * (no rule in `firestore.rules`, so clients fall to deny-all). A block hides
 * both users from each other everywhere the social endpoints look: search,
 * requests, the buddy list, accept and chop. See docs/data-model/buddies.md.
 */

const BLOCKS = 'blocks';

/** Directed on purpose: A blocking B is not B blocking A, and unblock only removes the caller's own. */
export function blockId(blocker: string, blocked: string): string {
  return [blocker, blocked].map((u) => u.replaceAll('_', '__')).join('_');
}

/** Both directions, two single-field reads — no composite index needed. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([getDoc(`${BLOCKS}/${blockId(a, b)}`), getDoc(`${BLOCKS}/${blockId(b, a)}`)]);
  return Boolean(ab || ba);
}

/** Every uid the caller blocked or is blocked by, for filtering a whole result set in one go. */
export async function blockedEitherWay(uid: string): Promise<Set<string>> {
  const [mine, theirs] = await Promise.all([
    // ponytail: one page of 500 per direction; page it if anyone ever gets there.
    runQuery({ collectionId: BLOCKS, where: [{ field: 'blocker', op: 'EQUAL', value: uid }], limit: 500 }),
    runQuery({ collectionId: BLOCKS, where: [{ field: 'blocked', op: 'EQUAL', value: uid }], limit: 500 }),
  ]);
  return new Set([
    ...mine.map((d) => d.fields.blocked as string | undefined),
    ...theirs.map((d) => d.fields.blocker as string | undefined),
  ].filter((u): u is string => Boolean(u)));
}

/**
 * Blocks `targetUid` and drops any friendship in the same atomic commit, so
 * there is never a moment where a block exists next to a live relationship.
 * Deliberately not gated on social being enabled or terms accepted: someone
 * being harassed must always be able to block.
 */
export async function blockUser(uid: string, targetUid: string): Promise<void> {
  if (uid === targetUid) throw new ApiError(400, 'You can\'t block yourself.', 'self_block');
  const target = await getDoc(`users/${targetUid}`, ['username']);
  if (!target) throw new ApiError(404, 'No such user.', 'user_not_found');

  await commit([
    {
      path: `${BLOCKS}/${blockId(uid, targetUid)}`,
      fields: { blocker: uid, blocked: targetUid, createdAt: ts(new Date().toISOString()) },
      updateMask: ['blocker', 'blocked', 'createdAt'],
    },
    { path: `friendships/${pairId(uid, targetUid)}`, delete: true },
  ]);
}

export async function unblockUser(uid: string, targetUid: string): Promise<void> {
  await deleteDoc(`${BLOCKS}/${blockId(uid, targetUid)}`);
}

export async function listBlocks(uid: string): Promise<BlockedUserDTO[]> {
  const docs = await runQuery({ collectionId: BLOCKS, where: [{ field: 'blocker', op: 'EQUAL', value: uid }], limit: 500 });
  const blocked = await Promise.all(
    docs.map(async (d) => {
      const other = d.fields.blocked as string;
      const user = await getDoc(`users/${other}`, ['username']);
      return { uid: other, username: (user?.fields.username as string | undefined) ?? '' };
    })
  );
  return blocked.sort((a, b) => a.username.localeCompare(b.username));
}

/** Account deletion: drop every block the user made or received. */
export async function deleteBlocksFor(uid: string): Promise<void> {
  const docs = await Promise.all([
    runQuery({ collectionId: BLOCKS, where: [{ field: 'blocker', op: 'EQUAL', value: uid }], limit: 5000 }),
    runQuery({ collectionId: BLOCKS, where: [{ field: 'blocked', op: 'EQUAL', value: uid }], limit: 5000 }),
  ]);
  await Promise.all(docs.flat().map((d) => deleteDoc(d.path)));
}
