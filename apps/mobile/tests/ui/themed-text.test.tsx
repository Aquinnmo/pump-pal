import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

type ThemeTestGlobal = typeof globalThis & { __themedComponentColorScheme?: 'light' | 'dark' };
const themeTestGlobal = globalThis as ThemeTestGlobal;
themeTestGlobal.__themedComponentColorScheme = 'light';

mock.module(new URL('../../src/hooks/use-color-scheme.web.ts', import.meta.url).pathname, () => ({
  useColorScheme: () => themeTestGlobal.__themedComponentColorScheme ?? 'light',
}));

const { ThemedText } = await import('../../src/ui/themed-text');

afterEach(() => {
  cleanup();
  themeTestGlobal.__themedComponentColorScheme = 'light';
});

describe('ThemedText', () => {
  it('renders visible children with the light theme color', () => {
    themeTestGlobal.__themedComponentColorScheme = 'light';

    render(<ThemedText>Training volume</ThemedText>);

    const text = screen.getByText('Training volume');
    assert.equal(text.textContent, 'Training volume');
    assert.equal(text.style.color, 'rgba(17, 24, 28, 1.00)');
  });

  it('uses the dark theme color and preserves caller styles', () => {
    themeTestGlobal.__themedComponentColorScheme = 'dark';

    render(
      <ThemedText darkColor="#f5f5f5" style={{ marginTop: 12 }}>
        Night session
      </ThemedText>,
    );

    const text = screen.getByText('Night session');
    assert.equal(text.textContent, 'Night session');
    assert.equal(text.style.color, 'rgba(245, 245, 245, 1.00)');
    assert.equal(text.style.marginTop, '12px');
  });
});
