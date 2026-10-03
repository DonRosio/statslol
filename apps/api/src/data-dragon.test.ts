import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createDataDragonClient, DataDragonError } from './data-dragon.ts';

const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const CHAMPIONS_URL =
  'https://ddragon.leagueoflegends.com/cdn/:version/data/en_US/champion.json';

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

function answer(
  versions: JsonBodyType,
  championsFile: JsonBodyType = CHAMPIONS_FILE,
) {
  const requestedVersions: string[] = [];
  server.use(
    http.get(VERSIONS_URL, () => HttpResponse.json(versions)),
    http.get(CHAMPIONS_URL, ({ params }) => {
      requestedVersions.push(String(params.version));
      return HttpResponse.json(championsFile);
    }),
  );
  return requestedVersions;
}

function getStaticData() {
  return createDataDragonClient({ timeoutMs: 100 }).getStaticData();
}

describe('createDataDragonClient', () => {
  it('gives the latest version and its champions, by champion ID', async () => {
    const requestedVersions = answer(VERSIONS);

    await expect(getStaticData()).resolves.toEqual({
      version: '16.19.1',
      champions: {
        '266': { id: 'Aatrox', name: 'Aatrox' },
        '62': { id: 'MonkeyKing', name: 'Wukong' },
      },
    });
    expect(requestedVersions).toEqual(['16.19.1']);
  });

  it.each([
    ['no version', []],
    ['a latest version of another format', ['../../evil', '16.18.1']],
    ['not a list', { latest: '16.19.1' }],
  ])('fails when the versions have %s', async (_case, versions) => {
    answer(versions);

    await expect(getStaticData()).rejects.toBeInstanceOf(DataDragonError);
  });

  it('fails when a champion ID could change an image URL', async () => {
    answer(VERSIONS, {
      data: { Evil: { id: '../Evil', key: '1', name: 'Evil' } },
    });

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
