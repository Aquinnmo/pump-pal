import { ApiError } from '../errors.js';
import type { ReportUserInput } from '@timber/contract/api';
import { commit, getDoc, ts } from './rest.js';

/**
 * `reports/{reporter_target_day}` — Worker-only, one open-ended queue for the
 * developer to review (`tools/moderation/review-reports.js`). The id caps a
 * reporter at one report per target per day, so the queue can't be flooded
 * from one account; a repeat is accepted and silently dropped.
 *
 * Deliberately not gated on social being enabled or terms accepted: anyone
 * who can see a username can report it. Reports survive the reporter's
 * account deletion because moderation needs the record.
 */

const REPORTS = 'reports';

/** Exported for tests. `day` is a UTC `YYYY-MM-DD`. */
export function reportId(reporter: string, target: string, day: string): string {
  return [reporter, target].map((u) => u.replaceAll('_', '__')).join('_') + `_${day}`;
}

export async function reportUser(uid: string, input: ReportUserInput): Promise<void> {
  if (uid === input.uid) throw new ApiError(400, 'You can\'t report yourself.', 'self_report');
  const target = await getDoc(`users/${input.uid}`, ['username']);
  if (!target) throw new ApiError(404, 'No such user.', 'user_not_found');

  const now = new Date().toISOString();
  try {
    await commit([
      {
        path: `${REPORTS}/${reportId(uid, input.uid, now.slice(0, 10))}`,
        fields: {
          reporter: uid,
          reported: input.uid,
          // Snapshot: the reported user can rename before anyone reads this.
          reportedUsername: (target.fields.username as string | undefined) ?? '',
          reason: input.reason,
          ...(input.note ? { note: input.note } : {}),
          status: 'open',
          createdAt: ts(now),
        },
        updateMask: ['reporter', 'reported', 'reportedUsername', 'reason', ...(input.note ? ['note'] : []), 'status', 'createdAt'],
        currentDocument: { exists: false },
      },
    ]);
  } catch (e) {
    if ((e as { status?: number }).status !== 409) throw e;
  }
}
