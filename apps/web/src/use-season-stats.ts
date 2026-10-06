import type { PlayerParams, SeasonId, SeasonSync } from '@statslol/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  championStatsQuery,
  seasonSyncQuery,
  startSeasonSync,
} from './api/players.ts';

/** How often the progress of the loading is asked, while it goes on. */
const SYNC_POLL_MS = 2000;
/** How often the statistics are read again meanwhile (the API reads the games it has). */
const STATS_POLL_MS = 6000;

/** Whether the server is still working on the season: the page keeps asking. */
export function isLoading(sync: SeasonSync | undefined): boolean {
  return sync?.state === 'queued' || sync?.state === 'running';
}

/**
 * The statistics of a season, and the loading of its games. Opening a season asks the server
 * to load the games it does not have (once: it answers "already running" the next times);
 * the progress is read every 2 seconds, and the statistics every few seconds, until the
 * loading ends, with a last reading then.
 */
export function useSeasonStats(player: PlayerParams, season: SeasonId) {
  const queryClient = useQueryClient();
  // The page makes a new `player` object at each render: the effects below depend on its
  // parts, or they would start again at every render.
  const { region, name, tag } = player;

  const sync = useQuery({
    ...seasonSyncQuery(player, season),
    refetchInterval: (query) =>
      isLoading(query.state.data) ? SYNC_POLL_MS : false,
  });
  const stats = useQuery({
    ...championStatsQuery(player, season),
    refetchInterval: isLoading(sync.data) ? STATS_POLL_MS : false,
  });

  // Starts the loading when a season is opened.
  useEffect(() => {
    let current = true;
    const target: PlayerParams = { region, name, tag };
    startSeasonSync(target, season)
      .then((started) => {
        // Shows it at once, and sets the polling going.
        if (current) {
          queryClient.setQueryData(
            seasonSyncQuery(target, season).queryKey,
            started,
          );
        }
      })
      .catch(() => {
        // The progress query shows what is going on; the statistics of the games already
        // stored are shown anyway.
      });
    return () => {
      current = false;
    };
  }, [region, name, tag, season, queryClient]);

  // A last reading of the statistics when the loading ends.
  const state = sync.data?.state;
  useEffect(() => {
    if (state === 'done' || state === 'failed') {
      void queryClient.invalidateQueries({
        queryKey: championStatsQuery({ region, name, tag }, season).queryKey,
      });
    }
  }, [state, region, name, tag, season, queryClient]);

  return { stats, sync: sync.data };
}
