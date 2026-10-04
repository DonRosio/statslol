import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The colors of the site are the design tokens of styles.css: these tests keep it that way,
// and check that the palette stays readable (WCAG contrast) whatever is tuned. They read the
// stylesheets as text, with Node.js: that is why they are here and not in src/ (browser code).

const WEB = join(import.meta.dirname, '..');
const SRC = join(WEB, 'src');
const stylesheets = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))
  .map((path) => ({
    path,
    css: withoutComments(readFileSync(join(SRC, path), 'utf8')),
  }));
const globalStyles = stylesheets.find(({ path }) => path === 'styles.css');
const indexHtml = readFileSync(join(WEB, 'index.html'), 'utf8');

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The custom properties of the :root block of styles.css, as written. */
function readTokens(): Map<string, string> {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(globalStyles?.css ?? '')?.[1];
  const tokens = new Map<string, string>();
  for (const [, name, value] of (root ?? '').matchAll(
    /--([\w-]+):\s*([^;]+);/g,
  )) {
    if (name !== undefined && value !== undefined) {
      // Prettier may split a long value over several lines.
      tokens.set(
        name,
        value
          .replace(/\s+/g, ' ')
          .replace(/\(\s+/g, '(')
          .replace(/\s+\)/g, ')')
          .trim(),
      );
    }
  }
  return tokens;
}

const tokens = readTokens();

type Color = readonly [number, number, number];

/** Splits at the commas that are not inside parentheses. */
function splitArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** The color a token ends up with: #rrggbb, white, var(--x) and color-mix(in srgb, ...). */
function resolve(value: string): Color {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex !== null) {
    return [
      parseInt(hex[1] ?? '', 16),
      parseInt(hex[2] ?? '', 16),
      parseInt(hex[3] ?? '', 16),
    ];
  }
  if (value === 'white') return [255, 255, 255];
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  if (reference !== null) {
    const target = tokens.get(reference[1] ?? '');
    if (target === undefined) throw new Error(`Unknown token ${value}`);
    return resolve(target);
  }
  const mix = /^color-mix\(in srgb,\s*([\s\S]+)\)$/.exec(value);
  if (mix !== null) {
    const [first, second] = splitArguments(mix[1] ?? '');
    const share = /^([\s\S]+?)\s+(\d+(?:\.\d+)?)%$/.exec(first ?? '');
    if (share === null || second === undefined) {
      throw new Error(`Cannot read ${value}`);
    }
    const weight = Number(share[2]) / 100;
    const a = resolve(share[1] ?? '');
    const b = resolve(second);
    return [0, 1, 2].map((index) =>
      Math.round((a[index] ?? 0) * weight + (b[index] ?? 0) * (1 - weight)),
    ) as unknown as Color;
  }
  throw new Error(`Cannot read ${value}`);
}

function color(token: string): Color {
  const value = tokens.get(token);
  if (value === undefined) throw new Error(`No token --${token}`);
  return resolve(value);
}

function luminance([red, green, blue]: Color): number {
  const [r = 0, g = 0, b = 0] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio: 1 (same color) to 21 (black on white). */
function contrast(a: Color, b: Color): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe('design tokens', () => {
  it('are all in the :root block of styles.css', () => {
    expect(tokens.size).toBeGreaterThan(10);
    expect([...tokens.keys()]).toEqual(
      expect.arrayContaining(['color-bg', 'color-text', 'color-accent']),
    );
  });

  it('are the only colors of the components', () => {
    // A color is a hex code, rgb(), hsl(), or the name of one (grey, Canvas...).
    const colorWord =
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(?:white|black|gray|grey|red|green|blue|orange|yellow|purple|pink|brown|Canvas|CanvasText|ButtonFace)\b/i;
    const offenders = stylesheets
      .filter(({ path }) => path !== 'styles.css')
      .flatMap(({ path, css }) =>
        css
          .split('\n')
          .filter((line) => colorWord.test(line))
          .map((line) => `${path}: ${line.trim()}`),
      );

    expect(offenders).toEqual([]);
  });

  it('are the only ones the components use: no typo in a name', () => {
    const used = new Set(
      stylesheets.flatMap(({ css }) =>
        [...css.matchAll(/var\(--([\w-]+)\)/g)].map(([, name]) => name ?? ''),
      ),
    );
    // Custom properties a component sets for itself (--result-color...).
    const own = new Set(
      stylesheets.flatMap(({ path, css }) =>
        path === 'styles.css'
          ? []
          : [...css.matchAll(/(--[\w-]+):/g)].map(([, name]) => name ?? ''),
      ),
    );
    const unknown = [...used].filter(
      (name) => !tokens.has(name) && !own.has(`--${name}`),
    );

    expect(unknown).toEqual([]);
  });

  it('give the browser bar the color of the background', () => {
    const [, themeColor] = /name="theme-color" content="(#[0-9a-f]{6})"/i.exec(
      indexHtml,
    ) ?? [undefined, undefined];

    expect(themeColor).toBe(tokens.get('color-bg'));
  });
});

describe('contrast of the palette', () => {
  // Text of normal size has to reach 4.5:1 against its background (WCAG AA).
  it.each([
    ['text', 'color-text', 'color-bg'],
    ['text on a card', 'color-text', 'color-surface'],
    ['secondary text', 'color-muted', 'color-bg'],
    ['secondary text on a card', 'color-muted', 'color-surface'],
    ['a link', 'color-accent', 'color-bg'],
    ['a link under the mouse', 'color-accent-hover', 'color-bg'],
    ['the label of a colored button', 'color-on-accent', 'color-accent'],
    [
      'the label of a colored button under the mouse',
      'color-on-accent',
      'color-accent-hover',
    ],
    ['an error', 'color-error', 'color-bg'],
    ['the status "up"', 'color-success', 'color-bg'],
    ['"Victory"', 'color-win-text', 'color-win-bg'],
    ['"Defeat"', 'color-loss-text', 'color-loss-bg'],
    ['details of a won match', 'color-win-muted', 'color-win-bg'],
    ['details of a lost match', 'color-loss-muted', 'color-loss-bg'],
    ['text of a won match', 'color-text', 'color-win-bg'],
    ['text of a lost match', 'color-text', 'color-loss-bg'],
  ])('is readable for %s (4.5:1)', (_what, foreground, background) => {
    expect(
      contrast(color(foreground), color(background)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // What is not text, but has to be seen (WCAG: 3:1).
  it.each([
    ['the color of a win', 'color-win', 'color-bg'],
    ['the color of a loss', 'color-loss', 'color-bg'],
    ['the edge of a field', 'color-border-strong', 'color-bg'],
    ['the edge of a field on a card', 'color-border-strong', 'color-surface'],
  ])('shows %s (3:1)', (_what, foreground, background) => {
    // The edge is the text color, translucent: what is seen is its mix with what is behind.
    const behind = color(background);
    const value = tokens.get(foreground) ?? '';
    const translucent =
      /^color-mix\(in srgb,\s*var\(--([\w-]+)\)\s+(\d+)%,\s*transparent\)$/.exec(
        value,
      );
    const front =
      translucent === null
        ? color(foreground)
        : ([0, 1, 2].map((index) =>
            Math.round(
              (color(translucent[1] ?? '')[index] ?? 0) *
                (Number(translucent[2]) / 100) +
                (behind[index] ?? 0) * (1 - Number(translucent[2]) / 100),
            ),
          ) as unknown as Color);

    expect(contrast(front, behind)).toBeGreaterThanOrEqual(3);
  });
});
