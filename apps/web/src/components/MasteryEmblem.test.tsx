import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MasteryEmblem } from './MasteryEmblem.tsx';

function emblemSource(level: number): string | null {
  const { unmount } = render(<MasteryEmblem level={level} />);
  const image = screen.queryByRole('img');
  const source = image?.getAttribute('src') ?? null;
  unmount();
  return source;
}

describe('MasteryEmblem', () => {
  it('has a different emblem for each level from 1 to 10', () => {
    const sources = Array.from({ length: 10 }, (_, index) =>
      emblemSource(index + 1),
    );

    expect(sources.every((source) => source !== null)).toBe(true);
    expect(new Set(sources).size).toBe(10);
  });

  it.each([11, 32, 150])(
    'keeps the emblem of level 10 for level %i',
    (level) => {
      expect(emblemSource(level)).toBe(emblemSource(10));
    },
  );

  it('shows nothing for level 0', () => {
    expect(emblemSource(0)).toBeNull();
  });

  it('is 30 px high by default, and as high as asked, keeping its proportions', () => {
    const { rerender } = render(<MasteryEmblem level={9} />);
    expect(screen.getByRole('img').getAttribute('height')).toBe('30');
    expect(screen.getByRole('img').getAttribute('width')).toBe('42');

    rerender(<MasteryEmblem level={9} height={64} />);

    expect(screen.getByRole('img').getAttribute('height')).toBe('64');
    expect(screen.getByRole('img').getAttribute('width')).toBe('90');
  });

  it('names the level, for screen readers and as a tooltip', () => {
    render(<MasteryEmblem level={32} />);

    const image = screen.getByRole('img', { name: 'Mastery level 32' });
    expect(image.getAttribute('title')).toBe('Mastery level 32');
  });
});
