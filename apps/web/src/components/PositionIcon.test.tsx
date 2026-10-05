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
  ])('draws %s and says it is %s', (position, name) => {
    render(<PositionIcon position={position} />);

    const icon = screen.getByRole('img', { name });
    expect(icon.tagName.toLowerCase()).toBe('svg');
    // The 3 lanes of the map, and what marks the position.
    expect(icon.querySelectorAll('path')).toHaveLength(4);
  });

  it('draws a different mark for each position', () => {
    const marks = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map(
      (position) => {
        const { container, unmount } = render(
          <PositionIcon position={position} />,
        );
        const paths = [...container.querySelectorAll('path')];
        unmount();
        return paths.at(-1)?.getAttribute('d');
      },
    );

    expect(new Set(marks).size).toBe(5);
  });

  it.each([null, '', 'SOMETHING'])('draws nothing for %j', (position) => {
    const { container } = render(<PositionIcon position={position} />);

    expect(container.querySelector('svg')).toBeNull();
  });
});
