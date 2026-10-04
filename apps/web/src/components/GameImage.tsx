import { useState, type ReactNode } from 'react';

interface GameImageProps {
  /** URL of the image on Data Dragon; null when it cannot be known (no static data). */
  readonly src: string | null;
  /** Width and height, in pixels: the space is kept while the image loads. */
  readonly size: number;
  /** A class of a CSS Module: undefined if the stylesheet has no class of this name. */
  readonly className?: string | undefined;
  /** Shown instead of the image when there is none, or when it fails to load. */
  readonly fallback: ReactNode;
}

/**
 * An image of the game (champion, profile icon) from Data Dragon. A missing file or an
 * unreachable CDN shows `fallback` instead of a broken image. The text next to the image
 * says what it shows: for screen readers, the image itself is decoration (alt="").
 */
export function GameImage({ src, size, className, fallback }: GameImageProps) {
  // Remembers which URL failed: a new URL (e.g. a newer version) gets a new try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src === null || src === failedSrc) {
    return fallback;
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      loading="lazy"
      onError={() => {
        setFailedSrc(src);
      }}
    />
  );
}
