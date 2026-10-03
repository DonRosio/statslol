import type { StaticData } from '@statslol/shared';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { DataDragonError, type DataDragonClient } from '../data-dragon.ts';
import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { TEST_CONFIG as config } from '../test-config.ts';

const STATIC_DATA: StaticData = {
  version: '16.19.1',
  champions: { '62': { id: 'MonkeyKing', name: 'Wukong' } },
};

/** A Data Dragon client that answers without any network call. */
function fakeDataDragon() {
  return {
    getStaticData: vi.fn<DataDragonClient['getStaticData']>(() =>
      Promise.resolve(STATIC_DATA),
    ),
  };
}

/** An app with an empty cache, where each call of `getStaticData` sends GET /api/v1/static-data. */
function createApp(dataDragon: DataDragonClient) {
  const app = buildApp(config, {
    dataDragon,
    cacheStore: new MemoryStore(),
    matchStore: new MemoryMatchStore(),
  });
  onTestFinished(() => app.close());
  return () => app.inject({ method: 'GET', url: '/api/v1/static-data' });
}

describe('GET /api/v1/static-data', () => {
  it("answers Data Dragon's version and champions", async () => {
    const response = await createApp(fakeDataDragon())();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(STATIC_DATA);
  });

  it('asks Data Dragon only once, then answers from the cache', async () => {
    const dataDragon = fakeDataDragon();
    const getStaticData = createApp(dataDragon);

    await getStaticData();
    const response = await getStaticData();

    expect(response.statusCode).toBe(200);
    expect(dataDragon.getStaticData).toHaveBeenCalledTimes(1);
  });

  it('answers 502 when Data Dragon fails, and asks it again next time', async () => {
    const dataDragon = fakeDataDragon();
    dataDragon.getStaticData.mockRejectedValueOnce(
      new DataDragonError('Data Dragon answered 503 for /api/versions.json'),
    );
    const getStaticData = createApp(dataDragon);

    const failure = await getStaticData();
    const success = await getStaticData();

    expect(failure.statusCode).toBe(502);
    expect(failure.json()).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'Data Dragon is unavailable, try again later',
    });
    expect(success.statusCode).toBe(200);
  });
});
