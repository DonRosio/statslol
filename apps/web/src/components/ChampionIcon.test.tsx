import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { STATIC_DATA } from '../test-data.ts';
import { ChampionIcon } from './ChampionIcon.tsx';

describe('ChampionIcon', () => {
  it('shows the image of the champion from Data Dragon, named', () => {
    render(
      <ChampionIcon
        championId={62}
        championName="MonkeyKing"
        staticData={STATIC_DATA}
        size={32}
      />,
    );

    const image = screen.getByRole('img', { name: 'Wukong' });
    expect(image.getAttribute('src')).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/MonkeyKing.png',
    );
    expect(image.getAttribute('width')).toBe('32');
  });

  it('cuts off the black edge of the image: it is enlarged inside a frame that clips it', () => {
    const { container } = render(
      <ChampionIcon
        championId={62}
        championName="MonkeyKing"
        staticData={STATIC_DATA}
        size={32}
      />,
    );

    const image = container.querySelector('img');
    // The frame clips what the enlargement pushes out; the image is the one that is enlarged.
    expect(image?.className).toContain('image');
    expect(image?.parentElement?.className).toContain('frame');
  });

  it('has a small badge in the corner when it is given one', () => {
    render(
      <ChampionIcon
        championId={62}
        championName="MonkeyKing"
        staticData={STATIC_DATA}
        size={32}
        badge={17}
      />,
    );

    expect(screen.getByText('17').className).toContain('badge');
  });

  it('has no badge otherwise', () => {
    const { container } = render(
      <ChampionIcon
        championId={62}
        championName="MonkeyKing"
        staticData={STATIC_DATA}
        size={32}
      />,
    );

    expect(container.querySelector('[class*="badge"]')).toBeNull();
  });

  it('keeps the name on the empty square when the image cannot be loaded', () => {
    render(
      <ChampionIcon
        championId={62}
        championName="MonkeyKing"
        staticData={STATIC_DATA}
        size={32}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Wukong' }));

    const empty = screen.getByRole('img', { name: 'Wukong' });
    expect(empty.tagName).toBe('SPAN');
  });

  it("says Riot's name of a champion Data Dragon does not know yet, with no image", () => {
    const { container } = render(
      <ChampionIcon
        championId={999}
        championName="Newcomer"
        staticData={STATIC_DATA}
        size={32}
      />,
    );

    expect(screen.getByRole('img', { name: 'Newcomer' })).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });
});
