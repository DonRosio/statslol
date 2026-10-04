import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createDataDragonClient, DataDragonError } from './data-dragon.ts';

const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const FILE_URL =
  'https://ddragon.leagueoflegends.com/cdn/:version/data/en_US/:file';

// Same shape as Data Dragon's files, shortened.
const VERSIONS = ['16.19.1', '16.18.1', 'lolpatch_3.7'];
const CHAMPIONS_FILE = {
  type: 'champion',
  version: '16.19.1',
  data: {
    Aatrox: {
      id: 'Aatrox',
      key: '266',
      name: 'Aatrox',
      title: 'the Darkin Blade',
      tags: ['Fighter'],
    },
    MonkeyKing: {
      id: 'MonkeyKing',
      key: '62',
      name: 'Wukong',
      title: 'the Monkey King',
      tags: ['Fighter', 'Tank'],
    },
  },
};
const ITEMS_FILE = {
  type: 'item',
  data: {
    '3078': { name: 'Trinity Force', gold: { total: 3333 }, image: {} },
    // Data Dragon has a few items without a name.
    '2008': { name: '', gold: { total: 0 }, image: {} },
  },
};
const SPELLS_FILE = {
  type: 'summoner',
  data: {
    SummonerFlash: { id: 'SummonerFlash', key: '4', name: 'Flash' },
    SummonerFlash_Jade: { id: 'SummonerFlash_Jade', key: '74', name: 'Flash' },
  },
};
const RUNES_FILE = [
  {
    id: 8000,
    key: 'Precision',
    name: 'Precision',
    icon: 'perk-images/Styles/7201_Precision.png',
    slots: [
      {
        runes: [
          {
            id: 8008,
            name: 'Lethal Tempo',
            icon: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
            shortDesc: '...',
          },
        ],
      },
      { runes: [] },
    ],
  },
];

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

/** Data Dragon answers these files; a test passes another body to break one of them. */
function answer(
  versions: JsonBodyType,
  files: Partial<Record<string, JsonBodyType>> = {},
) {
  const bodies: Record<string, JsonBodyType> = {
    'champion.json': CHAMPIONS_FILE,
    'item.json': ITEMS_FILE,
    'summoner.json': SPELLS_FILE,
    'runesReforged.json': RUNES_FILE,
    ...files,
  };
  const requestedVersions = new Set<string>();
  server.use(
    http.get(VERSIONS_URL, () => HttpResponse.json(versions)),
    http.get(FILE_URL, ({ params }) => {
      requestedVersions.add(String(params.version));
      return HttpResponse.json(bodies[String(params.file)] ?? null);
    }),
  );
  return requestedVersions;
}

function getStaticData() {
  return createDataDragonClient({ timeoutMs: 100 }).getStaticData();
}

describe('createDataDragonClient', () => {
  it('gives the latest version with its champions, items, spells and runes, by ID', async () => {
    answer(VERSIONS);

    await expect(getStaticData()).resolves.toEqual({
      version: '16.19.1',
      champions: {
        '266': { id: 'Aatrox', name: 'Aatrox' },
        '62': { id: 'MonkeyKing', name: 'Wukong' },
      },
      items: { '3078': { name: 'Trinity Force' }, '2008': { name: '' } },
      summonerSpells: {
        '4': { id: 'SummonerFlash', name: 'Flash' },
        '74': { id: 'SummonerFlash_Jade', name: 'Flash' },
      },
      // The tree (8000) and its runes (8008) in one table.
      runes: {
        '8000': {
          name: 'Precision',
          icon: 'perk-images/Styles/7201_Precision.png',
        },
        '8008': {
          name: 'Lethal Tempo',
          icon: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
        },
      },
    });
  });

  it('reads every file from the latest version only', async () => {
    const versions = answer(VERSIONS);

    await getStaticData();

    expect([...versions]).toEqual(['16.19.1']);
  });

  it.each([
    ['no version', []],
    ['a latest version of another format', ['../../evil', '16.18.1']],
    ['not a list', { latest: '16.19.1' }],
  ])('fails when the versions have %s', async (_case, versions) => {
    answer(versions);

    await expect(getStaticData()).rejects.toBeInstanceOf(DataDragonError);
  });

  it.each([
    [
      'a champion ID',
      'champion.json',
      { data: { Evil: { id: '../Evil', key: '1', name: 'Evil' } } },
    ],
    ['an item ID', 'item.json', { data: { '../1': { name: 'Evil' } } }],
    [
      'a summoner spell ID',
      'summoner.json',
      { data: { Evil: { id: '../Evil', key: '1', name: 'Evil' } } },
    ],
    [
      'a rune icon',
      'runesReforged.json',
      [{ id: 1, name: 'Evil', icon: '../../evil.png', slots: [] }],
    ],
  ])('fails when %s could change an image URL', async (_case, file, body) => {
    answer(VERSIONS, { [file]: body });

    await expect(getStaticData()).rejects.toBeInstanceOf(DataDragonError);
  });

  it.each([
    ['an error status', () => new HttpResponse(null, { status: 503 })],
    ['a network failure', () => HttpResponse.error()],
    ['a body that is not JSON', () => new HttpResponse('<html>')],
    ['no answer in time', () => delay('infinite')],
  ])('fails on %s', async (_case, resolver) => {
    server.use(http.get(VERSIONS_URL, resolver));

    const error = await getStaticData().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataDragonError);
    expect(error).toHaveProperty(
      'message',
      expect.stringContaining('/api/versions.json'),
    );
  });
});
