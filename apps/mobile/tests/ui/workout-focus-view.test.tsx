import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import type { DraftExerciseRow } from '@/types/workout';
import type { SetField } from '@/ui/workout/set-fields';

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
          <span>Minutes</span>
          <span>{set.durationMinutes}</span>
          <span>Seconds</span>
          <span>{set.durationSeconds}</span>
        </>
      ) : (
        <>
          <span>Reps</span>
          <button aria-label="Decrease current reps" onClick={onDecrement}>-</button>
          <span>{set.reps}</span>
          <button aria-label="Increase current reps" onClick={onIncrement}>+</button>
          {!bodyweight && (
            <label>
              Weight (lbs)
              <input
                aria-label="Current weight (lbs)"
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

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Bun's runtime export is callable here, while the installed typings describe
// only its module-mocking methods.
const createMock = mock as unknown as (implementation: (...args: any[]) => unknown) => any;

afterEach(() => {
  cleanup();
});

function row(overrides: Partial<DraftExerciseRow> = {}): DraftExerciseRow {
  return {
    uid: 'row-1',
    exerciseId: 'bench-press',
    variationId: null,
    label: 'Bench Press',
    exerciseType: 'Sets of Reps',
    bodyweight: false,
    sets: [
      { reps: 8, weight: '135', durationMinutes: 0, durationSeconds: 0 },
      { reps: 6, weight: '145', durationMinutes: 0, durationSeconds: 0 },
    ],
    ...overrides,
  };
}

function props(overrides: { exercises?: DraftExerciseRow[]; saving?: boolean } = {}) {
  return {
    exercises: [row()],
    saving: false,
    onCompleteSet: createMock(() => undefined),
    onUndo: createMock(() => undefined),
    onFinish: createMock(() => undefined),
    onEdit: createMock(() => undefined),
    onOpenPlateCalc: createMock(() => undefined),
    onUpdateSet: createMock((_index: number, _setIdx: number, _field: SetField, _value: string) => undefined),
    onIncrementSet: createMock((_index: number, _setIdx: number) => undefined),
    onDecrementSet: createMock((_index: number, _setIdx: number) => undefined),
    ...overrides,
  };
}

describe('FocusView', () => {
  it('renders the empty completion baseline and keeps undo disabled', async () => {
    const { FocusView } = await import('../../src/ui/workout/focus-view');
    const viewProps = props({ exercises: [] });
    render(<FocusView {...viewProps} />);

    assert.ok(screen.getByText('ALL SETS COMPLETE', { exact: true }));
    assert.ok(screen.getByText('0/0', { exact: true }));
    assert.ok(screen.getByText('Finish Workout', { exact: true }));
    assert.ok(screen.getByText('Undo last set', { exact: true }));
    assert.equal(screen.getByText('Undo last set').parentElement?.getAttribute('aria-disabled'), 'true');
    assert.equal(screen.queryByText('Bench Press', { exact: true }), null);

    fireEvent.click(screen.getByText('Finish Workout', { exact: true }));
    assert.equal(viewProps.onFinish.mock.calls.length, 1);
  });

  it('renders the current populated set and forwards visible session/edit actions exactly once', async () => {
    const { FocusView } = await import('../../src/ui/workout/focus-view');
    const viewProps = props({ exercises: [row(), row({ uid: 'row-2', label: 'Cable Row', sets: [
      { reps: 10, weight: '90', durationMinutes: 0, durationSeconds: 0 },
    ] })] });
    render(<FocusView {...viewProps} />);

    assert.ok(screen.getByText('Bench Press', { exact: true }));
    assert.equal(screen.getAllByText((_, element) => element?.textContent === 'Bench Press x2').length, 2);
    assert.equal(screen.getAllByText((_, element) => element?.textContent === 'Cable Row x1').length, 2);
    assert.ok(screen.getByText('Complete set 1/2', { exact: true }));
    assert.ok(screen.getByText('Reps', { exact: true }));
    assert.ok(screen.getByDisplayValue('135'));
    assert.ok(screen.getByText('Undo last set', { exact: true }));
    assert.equal(screen.getByText('Undo last set').parentElement?.getAttribute('aria-disabled'), 'true');

    fireEvent.click(screen.getByText('Complete set 1/2', { exact: true }));
    fireEvent.click(screen.getByText('Edit workout', { exact: true }));
    fireEvent.click(screen.getByText('Plate calculator', { exact: true }));
    fireEvent.click(screen.getByLabelText('Increase current reps'));
    fireEvent.click(screen.getByLabelText('Decrease current reps'));
    fireEvent.change(screen.getByLabelText('Current weight (lbs)'), { target: { value: '140' } });
    fireEvent.click(screen.getByText('Undo last set', { exact: true }));

    assert.equal(viewProps.onCompleteSet.mock.calls.length, 1);
    assert.equal(viewProps.onEdit.mock.calls.length, 1);
    assert.equal(viewProps.onOpenPlateCalc.mock.calls.length, 1);
    assert.equal(viewProps.onIncrementSet.mock.calls.length, 1);
    assert.deepEqual(viewProps.onIncrementSet.mock.calls[0], [0, 0]);
    assert.equal(viewProps.onDecrementSet.mock.calls.length, 1);
    assert.deepEqual(viewProps.onDecrementSet.mock.calls[0], [0, 0]);
    assert.deepEqual(viewProps.onUpdateSet.mock.calls, [[0, 0, 'weight', '140']]);
    assert.equal(viewProps.onUndo.mock.calls.length, 0);
  });

  it('shows the done state when every set is complete and keeps Finish disabled while saving', async () => {
    const { FocusView } = await import('../../src/ui/workout/focus-view');
    const complete = row({ sets: row().sets.map((set) => ({ ...set, completed: true })) });
    const viewProps = props({ exercises: [complete], saving: true });
    render(<FocusView {...viewProps} />);

    assert.ok(screen.getByText('ALL SETS COMPLETE', { exact: true }));
    assert.ok(screen.getByText('2/2', { exact: true }));
    const progress = screen.getByRole('progressbar');
    assert.equal(progress.parentElement?.getAttribute('aria-disabled'), 'true');
    assert.ok(progress);
    assert.equal(screen.queryByText('Finish Workout', { exact: true }), null);
    assert.equal(screen.queryByText('Complete set 1/2', { exact: true }), null);
  });

  it('renders duration fields for the current duration set without reps or weight', async () => {
    const { FocusView } = await import('../../src/ui/workout/focus-view');
    const duration = row({
      label: 'Plank',
      exerciseType: 'Sets of Duration',
      sets: [{ reps: 0, weight: '', durationMinutes: 1, durationSeconds: 30 }],
    });
    render(<FocusView {...props({ exercises: [duration] })} />);

    assert.ok(screen.getByText('Plank', { exact: true }));
    assert.ok(screen.getByText('Minutes', { exact: true }));
    assert.ok(screen.getByText('Seconds', { exact: true }));
    assert.equal(screen.queryByText('Reps', { exact: true }), null);
    assert.equal(screen.queryByDisplayValue('135'), null);
  });
});
