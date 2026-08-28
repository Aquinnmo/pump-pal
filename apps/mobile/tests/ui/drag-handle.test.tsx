import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import { createContext, useContext, type ReactNode } from 'react';

type Build = {
  module(path: string, callback: () => { exports: Record<string, unknown>; loader: 'object' }): void;
};

let dragCalls = 0;
const ReorderableContext = createContext(false);

mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));

// The real hook requires a reorderable-list cell context and is native-only.
// This seam keeps that contract: DragHandle must be rendered inside the
// harness provider, and a long-press event invokes the hook's returned drag.
// @ts-expect-error Bun runtime module has no local declaration.
const { plugin } = await import('bun');
plugin({
  name: 'drag-handle-native-test-double',
  setup(build: Build) {
    const reactNativeWeb = require('react-native-web') as Record<string, unknown>;
    build.module('react-native', () => ({
      exports: {
        ...reactNativeWeb,
        Pressable: ({ children, onLongPress }: {
          children?: ReactNode;
          onLongPress?: () => void;
        }) => (
          <button
            type="button"
            onContextMenu={(event) => {
              event.preventDefault();
              onLongPress?.();
            }}
          >
            {children}
          </button>
        ),
      },
      loader: 'object',
    }));
    build.module('react-native-reorderable-list', () => ({
      exports: {
        ReorderableList: ({ children }: { children?: ReactNode }) => (
          <ReorderableContext.Provider value>{children}</ReorderableContext.Provider>
        ),
        useReorderableDrag: () => {
          if (!useContext(ReorderableContext)) {
            throw new Error('DragHandle must be rendered inside ReorderableList');
          }
          return () => { dragCalls += 1; };
        },
      },
      loader: 'object',
    }));
  },
});

const { DragHandle } = await import('../../src/ui/primitives/drag-handle');
const { ReorderableList } = await import('react-native-reorderable-list') as unknown as {
  ReorderableList: ({ children }: { children?: ReactNode }) => ReactNode;
};

beforeEach(() => {
  dragCalls = 0;
});

afterEach(() => {
  cleanup();
});

describe('DragHandle', () => {
  it('renders the visible reorder grip as an accessible button in a list cell', () => {
    render(
      <ReorderableList>
        <DragHandle />
      </ReorderableList>,
    );

    assert.ok(screen.getByRole('button', { name: 'reorder-three icon' }));
    assert.ok(screen.getByLabelText('reorder-three icon'));
  });

  it('starts one reorder drag for each long-press interaction', () => {
    render(
      <ReorderableList>
        <DragHandle />
      </ReorderableList>,
    );
    const handle = screen.getByRole('button', { name: 'reorder-three icon' });

    fireEvent.contextMenu(handle);
    assert.equal(dragCalls, 1);
    fireEvent.contextMenu(handle);
    assert.equal(dragCalls, 2);
  });
});
