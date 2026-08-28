import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

type ThemeTestGlobal = typeof globalThis & { __themedComponentColorScheme?: 'light' | 'dark' };
const themeTestGlobal = globalThis as ThemeTestGlobal;
themeTestGlobal.__themedComponentColorScheme = 'light';

mock.module(new URL('../../src/hooks/use-color-scheme.web.ts', import.meta.url).pathname, () => ({
  useColorScheme: () => themeTestGlobal.__themedComponentColorScheme ?? 'light',
}));

const { ThemedView } = await import('../../src/ui/themed-view');

afterEach(() => {
  cleanup();
  themeTestGlobal.__themedComponentColorScheme = 'light';
});

describe('ThemedView', () => {
  it('renders its labeled child content with the light background', () => {
    themeTestGlobal.__themedComponentColorScheme = 'light';

    render(
      <ThemedView accessibilityLabel="Workout surface">
        <span>Today&apos;s workout</span>
      </ThemedView>,
    );

    const view = screen.getByLabelText('Workout surface');
    assert.equal(view.textContent, "Today's workout");
    assert.equal(view.style.backgroundColor, 'rgba(255, 255, 255, 1.00)');
  });

  it('uses the dark background and preserves caller styles', () => {
    themeTestGlobal.__themedComponentColorScheme = 'dark';

    render(
      <ThemedView darkColor="#202124" style={{ padding: 8 }} accessibilityLabel="Dark workout surface">
        <span>Evening workout</span>
      </ThemedView>,
    );

    const view = screen.getByLabelText('Dark workout surface');
    assert.equal(view.textContent, 'Evening workout');
    assert.equal(view.style.backgroundColor, 'rgba(32, 33, 36, 1.00)');
    assert.equal(view.style.padding, '8px');
  });
});
