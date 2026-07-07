import { DraftExerciseRow, PerformedExercise, PerformedSet, Workout } from '@/types/workout';

export function expandDraftToSets(row: DraftExerciseRow): PerformedSet[] {
  const setCount = Math.max(0, Number(row.sets) || 0);
  const sets: PerformedSet[] = [];

  for (let index = 0; index < setCount; index += 1) {
    if (row.exerciseType === 'Sets of Duration') {
      sets.push({
        setNumber: index + 1,
        durationSeconds: (Number(row.durationMinutes) || 0) * 60 + (Number(row.durationSeconds) || 0),
      });
    } else {
      const set: PerformedSet = {
        setNumber: index + 1,
        reps: Number(row.reps) || 0,
        weight: row.bodyweight ? 0 : Number(row.weight) || 0,
        bodyweight: Boolean(row.bodyweight),
      };
      if (row.holdSeconds !== undefined) {
        set.holdSeconds = row.holdSeconds;
      }
      sets.push(set);
    }
  }

  return sets;
}

export function collapseSetsToDraft(pe: PerformedExercise): DraftExerciseRow {
  const setCount = Math.max(1, pe.sets.length);
  const first = pe.sets[0];
  const duration = first?.durationSeconds !== undefined && first?.reps === undefined;
  const totalSeconds = duration ? (first?.durationSeconds ?? 0) : 0;

  return {
    exerciseId: pe.exerciseId,
    variationId: pe.variationId,
    label: pe.variationNameSnapshot ?? pe.exerciseNameSnapshot,
    exerciseType: duration ? 'Sets of Duration' : 'Sets of Reps',
    sets: setCount,
    reps: duration ? 0 : first?.reps ?? 0,
    durationMinutes: duration ? Math.floor(totalSeconds / 60) : 0,
    durationSeconds: duration ? totalSeconds % 60 : 0,
    weight: duration || first?.bodyweight ? '' : String(first?.weight ?? ''),
    bodyweight: Boolean(first?.bodyweight),
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

export function summarizePerformedExercise(pe: PerformedExercise): string {
  const setCount = pe.sets.length;
  const first = pe.sets[0];

  let base: string;
  if (isDurationExercise(pe)) {
    const totalSeconds = first?.durationSeconds ?? 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    base = `${setCount} × ${minutes ? `${minutes}m ` : ''}${seconds}s`;
  } else {
    const reps = first?.reps ?? 0;
    const weightSuffix = first?.bodyweight ? '' : ` @ ${first?.weight ?? 0} lbs`;
    base = `${setCount} × ${reps} rep${reps !== 1 ? 's' : ''}${weightSuffix}`;
  }

  if (first?.holdSeconds !== undefined) {
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

export function toDateObj(date: Workout['date']): Date {
  if (date instanceof Date) return date;
  if (typeof (date as { toDate?: () => Date }).toDate === 'function') {
    return (date as { toDate: () => Date }).toDate();
  }
  return new Date((date as { seconds: number }).seconds * 1000);
}
