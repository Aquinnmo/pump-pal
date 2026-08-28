import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, mock } from 'bun:test';

mock.module('@expo/vector-icons/MaterialIcons', () => ({
  default: ({
    name,
    size,
    color,
    style,
  }: {
    name: string;
    size?: number;
    color?: string;
    style?: { opacity?: number };
  }) => (
    <span
      role="img"
      aria-label={`${name} icon`}
      data-icon-name={name}
      data-icon-size={size}
      data-icon-color={color}
      style={style}
    >
      {name}
    </span>
  ),
}));

const { IconSymbol } = await import('../../src/ui/primitives/icon-symbol');

afterEach(() => {
  cleanup();
});

describe('IconSymbol', () => {
  it('renders the mapped Material icon visibly and accessibly for every fallback symbol', () => {
    const mappings = [
      ['house.fill', 'home'],
      ['paperplane.fill', 'send'],
      ['chevron.left.forwardslash.chevron.right', 'code'],
      ['chevron.right', 'chevron-right'],
    ] as const;

    for (const [symbol, materialName] of mappings) {
      const view = render(<IconSymbol name={symbol} color="#e54242" />);
      const icon = screen.getByRole('img', { name: `${materialName} icon` });

      assert.equal(icon.textContent, materialName);
      assert.equal(icon.getAttribute('data-icon-name'), materialName);
      assert.equal(icon.getAttribute('data-icon-size'), '24');
      assert.equal(icon.getAttribute('data-icon-color'), '#e54242');

      view.unmount();
    }
  });

  it('forwards an explicit size, tint, and caller style to the fallback icon', () => {
    render(<IconSymbol name="house.fill" size={18} color="#ffffff" style={{ opacity: 0.5 }} />);

    const icon = screen.getByRole('img', { name: 'home icon' });
    assert.equal(icon.getAttribute('data-icon-size'), '18');
    assert.equal(icon.getAttribute('data-icon-color'), '#ffffff');
    assert.equal(icon.style.opacity, '0.5');
  });
});
