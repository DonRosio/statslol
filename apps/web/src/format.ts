import type { MatchResult, MatchSummary, Rank } from '@statslol/shared';

// How numbers, dates and names of the game are written on the pages (in English for now).

/** "Gold II", or "Master" for the tiers without divisions. */
export function formatTier({
  tier,
  division,
}: Pick<Rank, 'tier' | 'division'>): string {
  const name = tier.charAt(0) + tier.slice(1).toLowerCase();
  return division === null ? name : `${name} ${division}`;
}

/** Percentage of games won, rounded; null before the first game. */
export function winRate(wins: number, losses: number): number | null {
  const games = wins + losses;
  return games === 0 ? null : Math.round((wins / games) * 100);
}

/** (kills + assists) / deaths, with 2 decimals: "3.50". "Perfect" without any death. */
export function formatKdaRatio(
  kills: number,
  deaths: number,
  assists: number,
): string {
  if (deaths === 0) {
    return kills + assists === 0 ? '0.00' : 'Perfect';
  }
  return ((kills + assists) / deaths).toFixed(2);
}

/** Minions and monsters killed per minute, with 1 decimal: "7.2". */
export function formatCsPerMinute(
  creepScore: number,
  durationSeconds: number,
): string {
  if (durationSeconds === 0) return '0.0';
  return (creepScore / (durationSeconds / 60)).toFixed(1);
}

/** "31:05", or "1:02:09" past an hour. */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours === 0
    ? `${String(minutes)}:${seconds}`
    : `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`;
}

const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
const ORDINAL_SUFFIXES: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
};

/** "1st place", "2nd place", "3rd place", "4th place"... */
export function formatPlacement(placement: number): string {
  const suffix = ORDINAL_SUFFIXES[ordinalRules.select(placement)] ?? 'th';
  return `${String(placement)}${suffix} place`;
}

const RESULT_NAMES: Record<MatchResult, string> = {
  win: 'Victory',
  loss: 'Defeat',
  remake: 'Remake',
};

/** "Victory", "Defeat", "Remake", or the place in modes ranked by place (Arena). */
export function formatResult({
  result,
  placement,
}: Pick<MatchSummary, 'result' | 'placement'>): string {
  return placement === null || result === 'remake'
    ? RESULT_NAMES[result]
    : formatPlacement(placement);
}

const POSITION_NAMES: ReadonlyMap<string, string> = new Map([
  ['TOP', 'Top'],
  ['JUNGLE', 'Jungle'],
  ['MIDDLE', 'Mid'],
  ['BOTTOM', 'Bot'],
  ['UTILITY', 'Support'],
]);

/** "Mid", "Support"...; null in modes without positions, or for a position not known yet. */
export function positionName(position: string | null): string | null {
  return position === null ? null : (POSITION_NAMES.get(position) ?? null);
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const TIME_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] =
  [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ];

/** How long before `now` (in ms) the ISO date was: "5 minutes ago", "yesterday"... */
export function formatTimeAgo(isoDate: string, now: number): string {
  const seconds = (now - Date.parse(isoDate)) / 1000;
  for (const [unit, unitSeconds] of TIME_UNITS) {
    if (seconds >= unitSeconds) {
      return relativeTime.format(-Math.floor(seconds / unitSeconds), unit);
    }
  }
  return 'just now';
}

const dateTime = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Date and time in the visitor's time zone: "Oct 3, 2026, 6:41 PM". */
export function formatDateTime(isoDate: string): string {
  return dateTime.format(new Date(isoDate));
}

/** The side of a team: 100 is the blue side of the map, 200 the red one. */
export function teamName(teamId: number): string {
  if (teamId === 100) return 'Blue team';
  if (teamId === 200) return 'Red team';
  return 'Team';
}

/** An average with 1 decimal: "5.2". */
export function formatAverage(value: number): string {
  return value.toFixed(1);
}

/** The average kills, deaths and assists of several games: "4.2 / 5.1 / 7.3". */
export function formatAverageScore(
  kills: number,
  deaths: number,
  assists: number,
): string {
  return [kills, deaths, assists].map(formatAverage).join(' / ');
}
