import assert from 'node:assert/strict';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';
import { type ReactNode, useEffect, useImperativeHandle, useRef } from 'react';
import { useDraftExercises } from '@/hooks/use-draft-exercises';
import { makeDraftExerciseRow } from '@/tests/factories';
import type { DraftExerciseRow } from '@/types/workout';

type Direction = 'left' | 'right';
type SwipeProps = {
  ref?: React.Ref<{ close(): void; reset(): void }>;
  children?: ReactNode;
  onSwipeableWillOpen?: (direction: Direction) => void;
  onSwipeableOpen?: (direction: Direction) => void;
  onSwipeableClose?: (direction: Direction) => void;
  renderRightActions?: unknown;
};
let serial = 0;
const handles = new Map<number, SwipeProps>();
const animations: ((finished: boolean) => void)[] = [];
const pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
function Swipeable(props: SwipeProps) {
  const id = useRef(++serial).current;
  handles.set(id, props);
  useImperativeHandle(props.ref, () => ({ close() {}, reset() {} }));
  return <div data-swipe-id={id}>{props.children}</div>;
}

// Keep React state, row rendering and draft mutations real. Only the native
// gesture/animation boundary is controlled so stale events can arrive on demand.
type Build = { module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void };
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({ name: 'swipe-regression-native-boundaries', setup(build: Build) {
  build.module('react-native-gesture-handler/ReanimatedSwipeable', () => ({ exports: {
    default: Swipeable, SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
  }, loader: 'object' }));
  build.module('react-native-reanimated', () => ({ exports: {
    default: { View: pass },
    runOnJS: (callback: () => void) => callback,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: number) => useRef({ value }).current,
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      if (callback) animations.push(callback);
      return value;
    },
  }, loader: 'object' }));
  build.module('expo-haptics', () => ({ exports: {
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }, impactAsync: () => undefined,
  }, loader: 'object' }));
} });
mock.module('@expo/vector-icons', () => ({ Ionicons: () => null }));
for (const [file, name] of [['exercise-picker', 'ExercisePicker'], ['drag-handle', 'DragHandle']]) {
  mock.module(new URL(`../../src/ui/primitives/${file}.tsx`, import.meta.url).pathname, () => ({ [name]: () => null }));
}
mock.module(new URL('../../src/ui/primitives/dropdown.tsx', import.meta.url).pathname, () => ({
  Dropdown: ({ renderTrigger }: { renderTrigger?: (open: () => void) => ReactNode }) => renderTrigger?.(() => undefined) ?? null,
}));
const { ExerciseCard } = await import('../../src/ui/workout/exercise-card');
let draft: ReturnType<typeof useDraftExercises>;
const noop = () => undefined;
function Harness({ completion = true }: { completion?: boolean }) {
  const current = useDraftExercises({ trackCompletion: completion });
  useEffect(() => { draft = current; });
  return <>{current.exercises.map((exercise, index) => <ExerciseCard
    key={exercise.uid} exercise={exercise} index={index} catalogOptions={[]}
    onSelectExercise={noop} onChangeType={noop} onToggleBodyweight={noop}
    onRemoveExercise={current.removeExercise} onUpdateSet={current.updateSet}
    onIncrementSet={current.incrementSet} onDecrementSet={current.decrementSet} onAddSet={current.addSet}
    onRemovePart={current.removePart} onTogglePartComplete={current.togglePartComplete}
    showCompletion={completion}
  />)}</>;
}
function start(completion = true, rows?: DraftExerciseRow[]) {
  render(<Harness completion={completion} />);
  act(() => draft.setExercises(rows ?? [makeDraftExerciseRow({ sets: [10, 20, 30, 40].map((reps) => ({
    reps, weight: String(reps), durationMinutes: 0, durationSeconds: 0,
  })) })]));
}
function handle(weight: string) {
  const wrapper = screen.getByDisplayValue(weight).closest('[data-swipe-id]')!;
  return { id: wrapper.getAttribute('data-swipe-id'), props: handles.get(Number(wrapper.getAttribute('data-swipe-id')))! };
}
function values() { return draft.exercises[0].sets.map((part) => part.reps); }
function visibleWeights() { return screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value); }

afterEach(() => { cleanup(); handles.clear(); animations.length = 0; });
describe('stateful set swipes', () => {
  for (const completion of [true, false]) {
    it(`deletes immediately and keeps neighboring rows intact (${completion ? 'active' : 'planner'})`, () => {
      start(completion);
      const first = handle('10');
      const second = handle('20');
      act(() => first.props.onSwipeableWillOpen?.('left'));
      assert.deepEqual(values(), [20, 30, 40]);
      assert.deepEqual(visibleWeights(), ['20', '30', '40']);
      assert.equal(handle('20').id, second.id, 'survivor must keep its own swipe instance');
      act(() => { first.props.onSwipeableWillOpen?.('left'); first.props.onSwipeableOpen?.('left'); });
      act(() => animations.splice(0).forEach((finish) => finish(true)));
      assert.deepEqual(values(), [20, 30, 40], 'duplicate and late callbacks must not remove a neighbor');
    });
  }

  it('targets the original rows when neighboring swipes arrive before rerender', () => {
    start();
    const first = handle('10').props;
    const third = handle('30').props;
    act(() => { first.onSwipeableWillOpen?.('left'); third.onSwipeableWillOpen?.('left'); });
    assert.deepEqual(values(), [20, 40]);
    assert.deepEqual(visibleWeights(), ['20', '40']);
    assert.ok(screen.getByLabelText('Set 1 options'));
    assert.ok(screen.getByLabelText('Set 2 options'));
  });

  it('completes once per gesture, can undo after closing, and ignores open callbacks', () => {
    start();
    const props = handle('10').props;
    act(() => { props.onSwipeableWillOpen?.('right'); props.onSwipeableWillOpen?.('right'); props.onSwipeableOpen?.('right'); });
    assert.equal(draft.exercises[0].sets[0].completed, true);
    act(() => props.onSwipeableClose?.('left'));
    act(() => handle('10').props.onSwipeableWillOpen?.('right'));
    assert.equal(draft.exercises[0].sets[0].completed, false);
    assert.deepEqual(values(), [10, 20, 30, 40]);
  });

  it('ignores a late callback after the exercise has been removed', () => {
    start(true, [makeDraftExerciseRow({ uid: 'a', sets: [{ reps: 8, weight: '8', durationMinutes: 0, durationSeconds: 0 }] }), makeDraftExerciseRow({ uid: 'b', sets: [
      { reps: 20, weight: '20', durationMinutes: 0, durationSeconds: 0 },
      { reps: 30, weight: '30', durationMinutes: 0, durationSeconds: 0 },
    ] })]);
    const removed = handle('20').props;
    act(() => draft.removeExercise(1));
    act(() => { removed.onSwipeableWillOpen?.('left'); removed.onSwipeableWillOpen?.('right'); removed.onSwipeableOpen?.('left'); });
    act(() => animations.splice(0).forEach((finish) => finish(true)));
    assert.equal(draft.exercises.length, 1);
    assert.equal(draft.exercises[0].sets[0].reps, 8);
    assert.equal(draft.exercises[0].sets[0].completed, undefined);
  });
});
