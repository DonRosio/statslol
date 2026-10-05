import type { GameThing } from '../data-dragon.ts';
import { GameImage } from './GameImage.tsx';

interface GameSlotProps {
  readonly thing: GameThing;
  /** Width and height in pixels. */
  readonly size: number;
  /** A class of a CSS Module that gives the size and the shape of the (empty) square. */
  readonly className: string | undefined;
}

/**
 * The image of a spell, a rune or an item. Its name is for screen readers and the tooltip, and
 * stays on the empty square shown when the image is missing.
 */
export function GameSlot({ thing, size, className }: GameSlotProps) {
  return (
    <GameImage
      src={thing.src}
      size={size}
      className={className}
      alt={thing.name}
      fallback={
        <span
          className={className}
          role={thing.name === undefined ? undefined : 'img'}
          aria-label={thing.name}
          title={thing.name}
        />
      }
    />
  );
}
