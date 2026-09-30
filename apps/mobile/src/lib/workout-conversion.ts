import { randomId } from '@/data/id';
import { DraftExerciseRow, DraftSet, PerformedExercise, PerformedSet, RecentExercise, Workout } from '@/types/workout';

// Client-only unique id for a draft row (React key + drag identity). Only needs
// to be unique within one screen's editing session.
export function makeUid(): string {
  return randomId('ex');
}

// An edit to a set cascades forward: the new value overwrites each following set that
// still held the old value, stopping at the first set the user deliberately made
// different so pyramids / drop sets survive. Completed sets are a record of what was
// actually lifted — they are skipped, not overwritten, and do not stop the run.
// Lives here rather than in use-draft-exercises so the watch bridge (src/lib/wear-state.ts)
// can apply the same semantics without pulling React Native in.
export function cascadeSetField<K extends keyof DraftSet>(
  sets: DraftSet[],
  from: number,
  field: K,
  value: DraftSet[K]
): DraftSet[] {
  const previous = sets[from][field];
  const next = sets.slice();
  next[from] = { ...next[from], [field]: value };
  for (let si = from + 1; si < next.length; si++) {
    if (next[si].completed) continue;
    if (next[si][field] !== previous) break;
    next[si] = { ...next[si], [field]: value };
  }
  return next;
}

export function expandDraftToSets(row: DraftExerciseRow): PerformedSet[] {
  return row.sets.map((draftSet, index) => {
    if (row.exerciseType === 'Sets of Duration') {
      const set: PerformedSet = {
        setNumber: index + 1,
        durationSeconds: (Number(draftSet.durationMinutes) || 0) * 60 + (Number(draftSet.durationSeconds) || 0),
      };
      if (row.holdSeconds !== undefined) {
        set.holdSeconds = row.holdSeconds;
      }
      if (draftSet.completed !== undefined) {
        set.completed = draftSet.completed;
      }
      return set;
    }
    const set: PerformedSet = {
      setNumber: index + 1,
      reps: Number(draftSet.reps) || 0,
      weight: row.bodyweight ? 0 : Number(draftSet.weight) || 0,
      bodyweight: Boolean(row.bodyweight),
    };
    if (row.holdSeconds !== undefined) {
      set.holdSeconds = row.holdSeconds;
    }
    if (draftSet.completed !== undefined) {
      set.completed = draftSet.completed;
    }
    return set;
  });
}

// Auto-fill normalization: repeat one representative set across every slot. The
// representative is the most frequent (reps, weight, duration) set; when several tie —
// including "none repeats", where every set ties at one — it is the median of the tied
// sets ordered by weight, then reps, then duration. An even count takes the upper
// (heavier) middle, so the pick is always a set that was actually performed.
export function normalizeDraftSets(sets: DraftSet[]): DraftSet[] {
  if (sets.length < 2) return sets;
  const weightOf = (s: DraftSet) => Number(s.weight) || 0;
  const secondsOf = (s: DraftSet) => s.durationMinutes * 60 + s.durationSeconds;
  const keyOf = (s: DraftSet) => `${s.reps}|${weightOf(s)}|${secondsOf(s)}`;

  const counts = new Map<string, number>();
  for (const s of sets) counts.set(keyOf(s), (counts.get(keyOf(s)) ?? 0) + 1);
  const top = Math.max(...counts.values());

  const seen = new Set<string>();
  const candidates = sets.filter((s) => {
    const key = keyOf(s);
    if (counts.get(key) !== top || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  candidates.sort((a, b) => weightOf(a) - weightOf(b) || a.reps - b.reps || secondsOf(a) - secondsOf(b));
  const pick = candidates[Math.floor(candidates.length / 2)];
  return sets.map((s) => ({ ...pick, completed: s.completed }));
}

export function collapseSetsToDraft(pe: PerformedExercise, normalize = false): DraftExerciseRow {
  const first = pe.sets[0];
  const duration = first?.durationSeconds !== undefined && first?.reps === undefined;
  const sourceSets = pe.sets.length > 0 ? pe.sets : [first];

  const sets: DraftSet[] = sourceSets.map((s): DraftSet => {
    const totalSeconds = duration ? (s?.durationSeconds ?? 0) : 0;
    return {
      reps: duration ? 0 : s?.reps ?? 0,
      weight: duration || s?.bodyweight ? '' : String(s?.weight ?? ''),
      durationMinutes: duration ? Math.floor(totalSeconds / 60) : 0,
      durationSeconds: duration ? totalSeconds % 60 : 0,
      completed: s?.completed,
    };
  });

  return {
    uid: makeUid(),
    exerciseId: pe.exerciseId,
    variationId: pe.variationId,
    label: pe.variationNameSnapshot ?? pe.exerciseNameSnapshot,
    exerciseType: duration ? 'Sets of Duration' : 'Sets of Reps',
    bodyweight: Boolean(first?.bodyweight),
    sets: normalize ? normalizeDraftSets(sets) : sets,
    holdSeconds: first?.holdSeconds,
    peNotes: pe.notes,
    legacy: pe.legacy,
  };
}

export function buildPerformedExercise(row: DraftExerciseRow, order: number): PerformedExercise {
  return {
    order,
    exerciseId: row.exerciseId ?? 'under-review',
    exerciseRefPath: `exercises/${row.exerciseId ?? 'under-review'}`,
    exerciseNameSnapshot: row.label,
    variationId: row.variationId ?? null,
    variationNameSnapshot: row.variationId ? row.label : null,
    sets: expandDraftToSets(row),
    ...(row.peNotes !== undefined ? { notes: row.peNotes } : {}),
    ...(row.legacy !== undefined ? { legacy: row.legacy } : {}),
  };
}

export function exerciseLabel(pe: PerformedExercise): string {
  return pe.variationNameSnapshot ?? pe.exerciseNameSnapshot;
}

export function isDurationExercise(pe: PerformedExercise): boolean {
  const first = pe.sets[0];
  return first?.durationSeconds !== undefined && first?.reps === undefined;
}

function fmtDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes ? `${minutes}m ` : ''}${seconds}s`;
}

function holdSuffix(s?: PerformedSet): string {
  return s?.holdSeconds !== undefined ? ` + ${s.holdSeconds}s hold` : '';
}

function weightSuffix(s?: PerformedSet): string {
  return s?.bodyweight ? '' : ` @ ${s?.weight ?? 0} lbs`;
}

function sameDisplayedSet(a: PerformedSet, b: PerformedSet): boolean {
  return (
    (a.reps ?? 0) === (b.reps ?? 0) &&
    (a.weight ?? 0) === (b.weight ?? 0) &&
    Boolean(a.bodyweight) === Boolean(b.bodyweight) &&
    (a.durationSeconds ?? 0) === (b.durationSeconds ?? 0) &&
    a.holdSeconds === b.holdSeconds
  );
}

export function summarizePerformedExerciseSetGroups(pe: PerformedExercise): string[] {
  const groups: { set: PerformedSet; count: number }[] = [];

  pe.sets.forEach((set) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && sameDisplayedSet(lastGroup.set, set)) {
      lastGroup.count += 1;
      return;
    }
    groups.push({ set, count: 1 });
  });

  return groups.map(({ set, count }) => {
    const countPrefix = count > 1 ? `${count} x ` : '';
    if (isDurationExercise(pe)) {
      return `${countPrefix}${fmtDuration(set.durationSeconds ?? 0)}${holdSuffix(set)}`;
    }

    const reps = set.reps ?? 0;
    return `${countPrefix}${reps} rep${reps !== 1 ? 's' : ''}${weightSuffix(set)}${holdSuffix(set)}`;
  });
}

export function summarizePerformedExercise(pe: PerformedExercise): string {
  const sets = pe.sets;
  const setCount = sets.length;
  const first = sets[0];
  const holdUniform = sets.every((s) => s.holdSeconds === first?.holdSeconds);

  let base: string;
  if (isDurationExercise(pe)) {
    const durations = sets.map((s) => s.durationSeconds ?? 0);
    const uniform = durations.every((d) => d === durations[0]) && holdUniform;
    base = uniform
      ? `${setCount} × ${fmtDuration(durations[0] ?? 0)}`
      : sets.map((s) => `${fmtDuration(s.durationSeconds ?? 0)}${holdSuffix(s)}`).join(', ');
  } else {
    const uniform =
      sets.every((s) => s.reps === first?.reps && s.weight === first?.weight && s.bodyweight === first?.bodyweight) &&
      holdUniform;
    if (uniform) {
      const reps = first?.reps ?? 0;
      base = `${setCount} × ${reps} rep${reps !== 1 ? 's' : ''}${weightSuffix(first)}`;
    } else {
      base = sets.map((s) => `${s.reps ?? 0}${weightSuffix(s)}${holdSuffix(s)}`).join(', ');
    }
  }

  if (holdUniform && first?.holdSeconds !== undefined) {
    base += ` + ${first.holdSeconds}s hold`;
  }

  return base;
}

export function workoutVolume(w: Workout): number {
  return w.performedExercises.reduce((sum, pe) => {
    return sum + pe.sets.reduce((s, set) => {
      if (set.bodyweight || !set.weight) return s;
      return s + (set.reps ?? 0) * set.weight;
    }, 0);
  }, 0);
}

export function workoutTotalReps(w: Workout): number {
  return w.performedExercises.reduce((sum, pe) => {
    return sum + pe.sets.reduce((s, set) => s + (set.reps ?? 0), 0);
  }, 0);
}

export function toDateObj(date: unknown): Date | null {
  let parsed: Date;

  try {
    if (date instanceof Date) {
      parsed = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      if (date === '') return null;
      parsed = new Date(date);
    } else if (
      date &&
      typeof date === 'object' &&
      'toDate' in date &&
      typeof date.toDate === 'function'
    ) {
      parsed = date.toDate();
    } else if (date && typeof date === 'object') {
      const seconds = 'seconds' in date ? date.seconds : undefined;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
      parsed = new Date(seconds * 1000);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function recentExercisesForDay(
  history: Workout[],
  workoutName: string,
  now = new Date(),
  windowDays = 30
): RecentExercise[] {
  if (!workoutName) return [];

  const cutoff = now.getTime() - windowDays * 86400000;
  const seen = new Set<string>();
  const result: RecentExercise[] = [];

  for (const w of history) {
    if (w.name !== workoutName) continue;
    const workoutDate = toDateObj(w.date);
    if (!workoutDate || workoutDate.getTime() < cutoff) continue;

    for (const pe of w.performedExercises) {
      const key = `${pe.exerciseId}:${pe.variationId ?? 'root'}`;
      if (seen.has(key)) continue;
      const label = exerciseLabel(pe);
      if (!label) continue;
      seen.add(key);
      result.push({ exerciseId: pe.exerciseId, variationId: pe.variationId, label });
    }
  }

  return result;
}
