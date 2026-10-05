import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PositionIcon } from './PositionIcon.tsx';

describe('PositionIcon', () => {
  it.each([
    ['TOP', 'Top'],
    ['JUNGLE', 'Jungle'],
    ['MIDDLE', 'Mid'],
    ['BOTTOM', 'Bot'],
    ['UTILITY', 'Support'],
  ])('shows the icon of %s and says it is %s', (position, name) => {
    render(<PositionIcon position={position} />);

    const icon = screen.getByRole('img', { name });
    expect(icon.tagName.toLowerCase()).toBe('img');
    expect(icon.getAttribute('title')).toBe(name);
  });

  it('has an icon of its own for each position', () => {
    const sources = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map(
      (position) => {
        const { container, unmount } = render(
          <PositionIcon position={position} />,
        );
        const source = container.querySelector('img')?.getAttribute('src');
        unmount();
        return source;
      },
    );

    expect(new Set(sources).size).toBe(5);
    expect(
      sources.every((source) => source !== null && source !== undefined),
    ).toBe(true);
  });

  it.each([null, '', 'SOMETHING'])('shows nothing for %j', (position) => {
    const { container } = render(<PositionIcon position={position} />);

    expect(container.querySelector('img')).toBeNull();
  });
});
