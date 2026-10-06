import type { RiotMatch } from '@statslol/riot-client';

import type { MatchStore } from './matches.ts';

/** Match store in memory, for the tests that do not need PostgreSQL. */
export class MemoryMatchStore implements MatchStore {
  readonly rows = new Map<
    string,
    { readonly match: RiotMatch; readonly keyGeneration: number }
  >();

  findMany(
    ids: readonly string[],
    keyGeneration: number,
  ): Promise<Map<string, RiotMatch>> {
    const found = new Map<string, RiotMatch>();
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row?.keyGeneration === keyGeneration) found.set(id, row.match);
    }
    return Promise.resolve(found);
  }

  findByPuuid(
    puuid: string,
    keyGeneration: number,
    limit: number,
  ): Promise<RiotMatch[]> {
    const found = [...this.rows.values()]
      .filter(
        (row) =>
          row.keyGeneration === keyGeneration &&
          row.match.metadata.participants?.includes(puuid) === true,
      )
      .map((row) => row.match)
      .sort((a, b) => b.info.gameStartTimestamp - a.info.gameStartTimestamp);
    return Promise.resolve(found.slice(0, limit));
  }

  save(match: RiotMatch, keyGeneration: number): Promise<void> {
    this.rows.set(match.metadata.matchId, { match, keyGeneration });
    return Promise.resolve();
  }
}
