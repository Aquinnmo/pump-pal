import { DraftExerciseRow, DraftSet, PerformedExercise, PerformedSet, Workout } from '@/types/workout';

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
    return set;
  });
}

export function collapseSetsToDraft(pe: PerformedExercise): DraftExerciseRow {
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
    };
  });

  return {
    exerciseId: pe.exerciseId,
    variationId: pe.variationId,
    label: pe.variationNameSnapshot ?? pe.exerciseNameSnapshot,
    exerciseType: duration ? 'Sets of Duration' : 'Sets of Reps',
    bodyweight: Boolean(first?.bodyweight),
    sets,
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

export function summarizePerformedExercise(pe: PerformedExercise): string {
  const sets = pe.sets;
  const setCount = sets.length;
  const first = sets[0];
  const holdSuffix = (s?: PerformedSet) => (s?.holdSeconds !== undefined ? ` + ${s.holdSeconds}s hold` : '');
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
    const weightSuffix = (s?: PerformedSet) => (s?.bodyweight ? '' : ` @ ${s?.weight ?? 0} lbs`);
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

export function toDateObj(date: Workout['date']): Date {
  if (date instanceof Date) return date;
  if (typeof (date as { toDate?: () => Date }).toDate === 'function') {
    return (date as { toDate: () => Date }).toDate();
  }
  return new Date((date as { seconds: number }).seconds * 1000);
}
