import type { RiotMatch } from '@statslol/riot-client';

import type { MatchStore, PlayerGame } from './matches.ts';

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

  findPlayerGames(
    puuid: string,
    keyGeneration: number,
    { fromMs, toMs }: { readonly fromMs: number; readonly toMs: number },
  ): Promise<PlayerGame[]> {
    const games = [...this.rows.values()]
      .filter(
        ({ match, keyGeneration: stored }) =>
          stored === keyGeneration &&
          match.metadata.participants?.includes(puuid) === true &&
          match.info.gameStartTimestamp >= fromMs &&
          match.info.gameStartTimestamp < toMs,
      )
      .sort(
        (a, b) =>
          b.match.info.gameStartTimestamp - a.match.info.gameStartTimestamp,
      )
      .flatMap(({ match }) => {
        const participant = match.info.participants.find(
          (candidate) => candidate.puuid === puuid,
        );
        return participant === undefined
          ? []
          : [
              {
                queueId: match.info.queueId,
                gameDuration: match.info.gameDuration,
                gameEndTimestamp: match.info.gameEndTimestamp,
                participant,
              },
            ];
      });
    return Promise.resolve(games);
  }

  save(match: RiotMatch, keyGeneration: number): Promise<void> {
    this.rows.set(match.metadata.matchId, { match, keyGeneration });
    return Promise.resolve();
  }
}
