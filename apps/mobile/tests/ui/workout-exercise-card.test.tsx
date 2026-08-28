import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { ExercisePickerSelection } from '@/ui/primitives/exercise-picker';
import type { SetField } from '@/ui/workout/set-fields';
import type { DraftExerciseRow, ExerciseSearchOption, RecentExercise } from '@/types/workout';
import { makeDraftExerciseRow } from '@/tests/factories';

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module(new URL('../../src/ui/primitives/exercise-picker.tsx', import.meta.url).pathname, () => ({
  ExercisePicker: ({
    value,
    placeholder,
    onSelect,
  }: {
    value: string | null;
    placeholder: string;
    onSelect: (selection: ExercisePickerSelection) => void;
    options: ExerciseSearchOption[];
    recentExercises?: RecentExercise[];
    onCreateNew?: (name: string) => Promise<unknown>;
  }) => (
    <button
      aria-label={value || placeholder}
      onClick={() => onSelect({ exerciseId: 'cable-row', variationId: 'wide', label: 'Cable Row' })}
    >
      {value || placeholder}
    </button>
  ),
}));

mock.module(new URL('../../src/ui/primitives/dropdown.tsx', import.meta.url).pathname, () => ({
  Dropdown: ({
    value,
    onSelect,
  }: {
    value: string | null;
    onSelect: (value: string) => void;
    options: readonly string[];
    placeholder: string;
  }) => (
    <button aria-label="Type of exercise" onClick={() => onSelect('Sets of Duration')}>
      {value || 'Type of exercise'}
    </button>
  ),
}));

mock.module(new URL('../../src/ui/primitives/drag-handle.tsx', import.meta.url).pathname, () => ({
  DragHandle: () => <span aria-label="Reorder exercise" />,
}));

mock.module(new URL('../../src/ui/workout/set-fields.tsx', import.meta.url).pathname, () => ({
  SetFields: ({
    set,
    exerciseType,
    bodyweight,
    onUpdate,
    onIncrement,
    onDecrement,
  }: {
    set: DraftExerciseRow['sets'][number];
    exerciseType: DraftExerciseRow['exerciseType'];
    bodyweight: boolean;
    onUpdate: (field: SetField, value: string) => void;
    onIncrement: () => void;
    onDecrement: () => void;
  }) => (
    <div>
      {exerciseType === 'Sets of Duration' ? (
        <>
          <label>
            Minutes
            <input aria-label="Minutes" value={String(set.durationMinutes)} readOnly />
          </label>
          <label>
            Seconds
            <input aria-label="Seconds" value={String(set.durationSeconds)} readOnly />
          </label>
        </>
      ) : (
        <>
          <span>Reps</span>
          <button aria-label="Decrease reps" onClick={onDecrement}>-</button>
          <span>{set.reps}</span>
          <button aria-label="Increase reps" onClick={onIncrement}>+</button>
          {!bodyweight && (
            <label>
              Weight (lbs)
              <input
                aria-label="Weight (lbs)"
                value={set.weight}
                onChange={(event) => onUpdate('weight', event.currentTarget.value)}
              />
            </label>
          )}
        </>
      )}
    </div>
  ),
}));

const catalogOptions: ExerciseSearchOption[] = [];

afterEach(() => {
  cleanup();
});

describe('ExerciseCard', () => {
  it('renders the empty exercise baseline with selection and add-set affordances', async () => {
    const { ExerciseCard } = await import('../../src/ui/workout/exercise-card');
    render(
      <ExerciseCard
        exercise={makeDraftExerciseRow({ label: '', sets: [] })}
        index={0}
        catalogOptions={catalogOptions}
        canRemove={false}
        onSelectExercise={() => undefined}
        onChangeType={() => undefined}
        onToggleBodyweight={() => undefined}
        onRemoveExercise={() => undefined}
        onUpdateSet={() => undefined}
        onIncrementSet={() => undefined}
        onDecrementSet={() => undefined}
        onAddSet={() => undefined}
        onRemoveSet={() => undefined}
      />,
    );

    assert.ok(screen.getByRole('button', { name: 'Select exercise' }));
    assert.ok(screen.getByRole('button', { name: 'Type of exercise' }));
    assert.ok(screen.getByText('Add Set', { exact: true }));
    assert.ok(screen.getByText('Bodyweight exercise', { exact: true }));
    assert.equal(screen.queryByText('Reps', { exact: true }), null);
    assert.equal(screen.queryByLabelText('trash-outline icon'), null);
  });

  it('renders a populated reps exercise and forwards visible edit/remove actions once', async () => {
    const exercise = makeDraftExerciseRow({
      label: 'Bench Press',
      bodyweight: false,
      sets: [
        { reps: 8, weight: '135', durationMinutes: 0, durationSeconds: 0 },
        { reps: 6, weight: '145', durationMinutes: 0, durationSeconds: 0 },
      ],
    });
    const selected: Array<[number, ExercisePickerSelection]> = [];
    const changedTypes: Array<[number, string, string]> = [];
    const bodyweightToggles: number[] = [];
    const removedExercises: number[] = [];
    const updatedSets: Array<[number, number, SetField, string]> = [];
    const increments: Array<[number, number]> = [];
    const decrements: Array<[number, number]> = [];
    const addedSets: number[] = [];
    const removedSets: Array<[number, number]> = [];
    const { ExerciseCard } = await import('../../src/ui/workout/exercise-card');

    render(
      <ExerciseCard
        exercise={exercise}
        index={2}
        catalogOptions={catalogOptions}
        canRemove
        onSelectExercise={(index, selection) => selected.push([index, selection])}
        onChangeType={(index, field, value) => changedTypes.push([index, field, value])}
        onToggleBodyweight={(index) => bodyweightToggles.push(index)}
        onRemoveExercise={(index) => removedExercises.push(index)}
        onUpdateSet={(index, setIdx, field, value) => updatedSets.push([index, setIdx, field, value])}
        onIncrementSet={(index, setIdx) => increments.push([index, setIdx])}
        onDecrementSet={(index, setIdx) => decrements.push([index, setIdx])}
        onAddSet={(index) => addedSets.push(index)}
        onRemoveSet={(index, setIdx) => removedSets.push([index, setIdx])}
      />,
    );

    assert.ok(screen.getByRole('button', { name: 'Bench Press' }));
    assert.equal(screen.getAllByText('Reps', { exact: true }).length, 2);
    assert.equal(screen.getAllByLabelText('Weight (lbs)').length, 2);
    assert.ok(screen.getByText('Bodyweight exercise', { exact: true }));
    assert.ok(screen.getByLabelText('trash-outline icon'));
    assert.equal(screen.getAllByLabelText('close-circle icon').length, 2);

    fireEvent.click(screen.getByRole('button', { name: 'Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Type of exercise' }));
    fireEvent.click(screen.getByText('Bodyweight exercise', { exact: true }));
    fireEvent.click(screen.getByLabelText('trash-outline icon'));
    fireEvent.click(screen.getByText('Add Set', { exact: true }));
    fireEvent.click(screen.getAllByLabelText('Increase reps')[0]);
    fireEvent.click(screen.getAllByLabelText('Decrease reps')[0]);
    fireEvent.change(screen.getAllByLabelText('Weight (lbs)')[0], { target: { value: '150' } });
    fireEvent.click(screen.getAllByLabelText('close-circle icon')[1]);

    assert.deepEqual(selected, [[2, { exerciseId: 'cable-row', variationId: 'wide', label: 'Cable Row' }]]);
    assert.deepEqual(changedTypes, [[2, 'exerciseType', 'Sets of Duration']]);
    assert.deepEqual(bodyweightToggles, [2]);
    assert.deepEqual(removedExercises, [2]);
    assert.deepEqual(updatedSets, [[2, 0, 'weight', '150']]);
    assert.deepEqual(increments, [[2, 0]]);
    assert.deepEqual(decrements, [[2, 0]]);
    assert.deepEqual(addedSets, [2]);
    assert.deepEqual(removedSets, [[2, 1]]);
  });

  it('renders duration fields and keeps bodyweight hidden while retaining removal', async () => {
    const exercise = makeDraftExerciseRow({
      label: 'Plank',
      exerciseType: 'Sets of Duration',
      sets: [{ reps: 0, weight: '', durationMinutes: 1, durationSeconds: 30 }],
    });
    const removed: number[] = [];
    const { ExerciseCard } = await import('../../src/ui/workout/exercise-card');

    render(
      <ExerciseCard
        exercise={exercise}
        index={1}
        catalogOptions={catalogOptions}
        canRemove
        onSelectExercise={() => undefined}
        onChangeType={() => undefined}
        onToggleBodyweight={() => undefined}
        onRemoveExercise={(index) => removed.push(index)}
        onUpdateSet={() => undefined}
        onIncrementSet={() => undefined}
        onDecrementSet={() => undefined}
        onAddSet={() => undefined}
        onRemoveSet={() => undefined}
      />,
    );

    assert.ok(screen.getByRole('button', { name: 'Plank' }));
    assert.ok(screen.getByDisplayValue('1'));
    assert.ok(screen.getByDisplayValue('30'));
    assert.equal(screen.queryByText('Bodyweight exercise', { exact: true }), null);
    fireEvent.click(screen.getByLabelText('trash-outline icon'));
    assert.deepEqual(removed, [1]);
  });
});
