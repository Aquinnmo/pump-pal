import { SetTypeDef, setTypeOf } from '@/constants/set-types';
import { randomId } from '@/data/id';
import { DraftExerciseRow, DraftSet, DraftSubSet, PerformedExercise, PerformedSet, RecentExercise, Workout } from '@/types/workout';

// Client-only unique id for a draft row (React key + drag identity). Only needs
// to be unique within one screen's editing session.
export function makeUid(): string {
  return randomId('ex');
}

// A set's parts in order: the set itself, then its sub-sets (a drop set's drops).
export function setParts(set: DraftSet): DraftSubSet[] {
  return [set, ...(set.subSets ?? [])];
}

// Stage 0 is the set itself; stage k is subSets[k - 1]. These two are the only code
// that knows that layout.
export function stageOf(set: DraftSet, stage: number): DraftSubSet {
  return stage === 0 ? set : set.subSets![stage - 1];
}

export function withStage(set: DraftSet, stage: number, patch: Partial<DraftSubSet>): DraftSet {
  if (stage === 0) return { ...set, ...patch };
  return { ...set, subSets: set.subSets!.map((part, k) => (k === stage - 1 ? { ...part, ...patch } : part)) };
}

// The next part of a sub-set type: the previous part's numbers with the weight cut by
// the type's weightFactor and rounded to 5 lbs. An empty weight (bodyweight) stays empty.
export function nextSubSet(def: SetTypeDef, from: DraftSubSet): DraftSubSet {
  const factor = def.subSet?.weightFactor ?? 1;
  const weight = from.weight.trim() === '' ? '' : String(Math.max(0, Math.round((Number(from.weight) * factor) / 5) * 5));
  return { reps: from.reps, weight, durationMinutes: from.durationMinutes, durationSeconds: from.durationSeconds };
}

// "Drop 2 of 3" for a part of a sub-set type, null for anything else.
export function stageLabel(set: DraftSet, stage: number): string | null {
  const noun = setTypeOf(set).subSet?.noun;
  if (!noun) return null;
  return `${noun[0].toUpperCase()}${noun.slice(1)} ${stage + 1} of ${setParts(set).length}`;
}

// An edit cascades forward to parts that still held the old value, so changing one set
// updates the identical ones after it. Each part sits on two lanes:
// - across: the same stage in later sets. The top of a set (stage 0) crosses every set,
//   simple or drop; drop k crosses only later sets of the same type that have a drop k
//   (others are skipped, not stoppers).
// - down: the later drops inside its own set.
// A walk along a lane stops at the first part the user deliberately made different, so
// pyramids and custom drops survive. Completed parts are a record of what was actually
// lifted — skipped, not overwritten, and they do not stop the walk. Every part the
// cascade changes ripples as if edited there, walking its own lanes with the same
// old → new values; parts already changed by this edit are passed over. Nothing before
// or above the edited part changes.
// Lives here rather than in use-draft-exercises so the watch bridge (src/lib/wear-state.ts)
// can apply the same semantics without pulling React Native in.
export function cascadeSetField<K extends keyof DraftSubSet>(
  sets: DraftSet[],
  from: number,
  field: K,
  value: DraftSubSet[K],
  stage = 0
): DraftSet[] {
  const old = stageOf(sets[from], stage)[field];
  const next = sets.slice();
  const changed = new Set<string>();
  const queue: [number, number][] = [];

  const change = (si: number, k: number) => {
    next[si] = withStage(next[si], k, { [field]: value });
    changed.add(`${si}:${k}`);
    queue.push([si, k]);
  };
  // Changes candidates in order until one holds a value the user made different.
  const walk = (candidates: [number, number][]) => {
    for (const [si, k] of candidates) {
      if (changed.has(`${si}:${k}`)) continue;
      const part = stageOf(next[si], k);
      if (part.completed) continue;
      if (part[field] !== old) break;
      change(si, k);
    }
  };

  change(from, stage);
  while (queue.length > 0) {
    const [si, k] = queue.shift()!;
    const down: [number, number][] = [];
    for (let j = k + 1; j < setParts(next[si]).length; j++) down.push([si, j]);
    walk(down);

    const type = setTypeOf(next[si]).id;
    const across: [number, number][] = [];
    for (let t = si + 1; t < next.length; t++) {
      if (k === 0 || (setTypeOf(next[t]).id === type && setParts(next[t]).length > k)) across.push([t, k]);
    }
    walk(across);
  }
  return next;
}

// Superset membership is positional: rows i and i+1 are linked only when both carry
// the same supersetId. A stale id left behind by a reorder, removal, or the finish
// filter simply stops linking anything, so none of those paths need cleanup.
export function linkedToNext(rows: { supersetId?: string }[], i: number): boolean {
  const id = rows[i]?.supersetId;
  return id !== undefined && id === rows[i + 1]?.supersetId;
}

export function inSuperset(rows: { supersetId?: string }[], i: number): boolean {
  return linkedToNext(rows, i - 1) || linkedToNext(rows, i);
}

// Consecutive rows split into supersets and singles, in order: [[A, B], [C], [D, E]].
export function groupSupersets<T extends { supersetId?: string }>(rows: T[]): T[][] {
  const groups: T[][] = [];
  rows.forEach((row, i) => (linkedToNext(rows, i - 1) ? groups[groups.length - 1].push(row) : groups.push([row])));
  return groups;
}

// Groups stored sets into the sets the user sees: parts of one sub-set type that share
// a setNumber form one cluster. Legacy data has unique set numbers, so it never groups.
export function setClusters(sets: { setNumber: number; type?: string }[]): number[][] {
  const clusters: number[][] = [];
  sets.forEach((set, i) => {
    const prev = sets[i - 1];
    const sameSet = prev && setTypeOf(set).subSet && prev.setNumber === set.setNumber && prev.type === set.type;
    if (sameSet) clusters[clusters.length - 1].push(i);
    else clusters.push([i]);
  });
  return clusters;
}

// Badge text per set: the type's glyph, or the set's number.
export function setLabels(sets: { type?: string }[]): string[] {
  return sets.map((set, i) => setTypeOf(set).glyph ?? String(i + 1));
}

// One PerformedSet per part; a drop set's parts share its setNumber.
export function expandDraftToSets(row: DraftExerciseRow): PerformedSet[] {
  return row.sets.flatMap((draftSet, index) =>
    setParts(draftSet).map((part) => {
      const set: PerformedSet =
        row.exerciseType === 'Sets of Duration'
          ? {
              setNumber: index + 1,
              durationSeconds: (Number(part.durationMinutes) || 0) * 60 + (Number(part.durationSeconds) || 0),
            }
          : {
              setNumber: index + 1,
              reps: Number(part.reps) || 0,
              weight: row.bodyweight ? 0 : Number(part.weight) || 0,
              bodyweight: Boolean(row.bodyweight),
            };
      if (row.holdSeconds !== undefined) {
        set.holdSeconds = row.holdSeconds;
      }
      if (draftSet.type !== undefined) {
        set.type = draftSet.type;
      }
      if (part.completed !== undefined) {
        set.completed = part.completed;
      }
      return set;
    })
  );
}

// Auto-fill normalization: repeat one representative set across every slot. The
// representative is the most frequent (reps, weight, duration) set; when several tie —
// including "none repeats", where every set ties at one — it is the median of the tied
// sets ordered by weight, then reps, then duration. An even count takes the upper
// (heavier) middle, so the pick is always a set that was actually performed.
export function normalizeDraftSets(sets: DraftSet[]): DraftSet[] {
  // ponytail: typed sets opt out entirely — repeating one representative would erase
  // the drop structure. Normalize just the normal sets if that ever matters.
  if (sets.length < 2 || sets.some((s) => setTypeOf(s).id !== 'normal')) return sets;
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

  const toPart = (s: PerformedSet | undefined): DraftSubSet => {
    const totalSeconds = duration ? (s?.durationSeconds ?? 0) : 0;
    return {
      reps: duration ? 0 : s?.reps ?? 0,
      weight: duration || s?.bodyweight ? '' : String(s?.weight ?? ''),
      durationMinutes: duration ? Math.floor(totalSeconds / 60) : 0,
      durationSeconds: duration ? totalSeconds % 60 : 0,
      completed: s?.completed,
    };
  };
  const sets: DraftSet[] =
    pe.sets.length === 0
      ? [toPart(undefined)]
      : setClusters(pe.sets).map(([head, ...rest]) => ({
          ...toPart(pe.sets[head]),
          ...(pe.sets[head].type !== undefined ? { type: pe.sets[head].type } : {}),
          ...(rest.length > 0 ? { subSets: rest.map((i) => toPart(pe.sets[i])) } : {}),
        }));

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
    supersetId: pe.supersetId,
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
    ...(row.supersetId !== undefined ? { supersetId: row.supersetId } : {}),
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

function describeSet(pe: PerformedExercise, set: PerformedSet): string {
  if (isDurationExercise(pe)) return `${fmtDuration(set.durationSeconds ?? 0)}${holdSuffix(set)}`;
  const reps = set.reps ?? 0;
  return `${reps} rep${reps !== 1 ? 's' : ''}${weightSuffix(set)}${holdSuffix(set)}`;
}

// One line per run of identical clusters; a drop set chains onto its set with an arrow:
// "3 x 8 reps @ 185 lbs → 6 reps @ 135 lbs".
export function summarizePerformedExerciseSetGroups(pe: PerformedExercise): string[] {
  const groups: { line: string; count: number }[] = [];
  for (const cluster of setClusters(pe.sets)) {
    const line = cluster.map((i) => describeSet(pe, pe.sets[i])).join(' → ');
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.line === line) lastGroup.count += 1;
    else groups.push({ line, count: 1 });
  }
  return groups.map(({ line, count }) => `${count > 1 ? `${count} x ` : ''}${line}`);
}

export function summarizePerformedExercise(pe: PerformedExercise): string {
  if (pe.sets.some((set) => setTypeOf(set).subSet)) return summarizePerformedExerciseSetGroups(pe).join(', ');
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

// Plain-text exercise list for sharing. A superset becomes one bullet with its
// exercises nested under it, so the grouping survives without any UI.
export function shareExerciseLines(exercises: PerformedExercise[]): string {
  const line = (pe: PerformedExercise) => `${exerciseLabel(pe)} — ${summarizePerformedExercise(pe)}`;
  return groupSupersets(exercises)
    .map((group) =>
      group.length > 1 ? ['  • Superset', ...group.map((pe) => `      – ${line(pe)}`)].join('\n') : `  • ${line(group[0])}`
    )
    .join('\n');
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

// Exercises to copy from the last completed workout: the latest one with this name if
// there is one, else simply the latest. `history` is completed-only, date DESC (getHistory).
export function lastWorkoutExercises(history: Workout[], workoutName: string): PerformedExercise[] {
  const source = history.find((w) => workoutName && w.name === workoutName) ?? history[0];
  return source?.performedExercises ?? [];
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
