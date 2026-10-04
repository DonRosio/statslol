import type { RiotMatch } from '@statslol/riot-client';
import { describe, expect, it } from 'vitest';

import { fakeMatch, PLAYER_PUUID } from '../test-matches.ts';
import { buildMatchDetails } from './match-details.ts';

type Participant = RiotMatch['info']['participants'][number];

/** The fields Riot added over the years: a match from before them does not have these. */
const ADDED_LATER = [
  'champLevel',
  'totalDamageDealtToChampions',
  'goldEarned',
  'visionScore',
  'riotIdGameName',
  'riotIdTagline',
  'summoner1Id',
  'summoner2Id',
  'item0',
  'item1',
  'item6',
  'perks',
];

function without(participant: Participant, fields: string[]): Participant {
  return Object.fromEntries(
    Object.entries(participant).filter(([field]) => !fields.includes(field)),
  ) as Participant;
}

/** A match of 18 players in 6 teams of 3, the team of a player being the one of their rank. */
function arenaMatch(): RiotMatch {
  const match = fakeMatch('EUW1_1');
  const [first] = match.info.participants;
  if (first === undefined) throw new Error('A fake match has players');
  match.info.queueId = 1750;
  match.info.participants = Array.from({ length: 18 }, (_, index) => {
    // Team 1 is the last of the places, as Riot does not sort them.
    const subteam = Math.floor(index / 3) + 1;
    const placement = 7 - subteam;
    return {
      ...first,
      puuid: index === 0 ? PLAYER_PUUID : `other-${String(index)}`,
      participantId: index + 1,
      teamId: 100,
      playerSubteamId: subteam,
      placement,
      win: placement <= 3,
      teamPosition: '',
      perks: { styles: [] },
    };
  });
  return match;
}

describe('buildMatchDetails', () => {
  it('gives the 2 sides, blue then red, with the result of each', () => {
    const details = buildMatchDetails(fakeMatch('KR_1'));

    expect(details).toMatchObject({
      id: 'KR_1',
      queueId: 420,
      startedAt: '2026-10-03T16:41:12.000Z',
      durationSeconds: 1834,
    });
    expect(details.teams.map((team) => [team.id, team.result])).toEqual([
      [100, 'win'],
      [200, 'loss'],
    ]);
    expect(details.teams.map((team) => team.players.length)).toEqual([5, 5]);
    expect(details.teams.every((team) => team.placement === null)).toBe(true);
  });

  it('tells all about each player', () => {
    const [blue] = buildMatchDetails(fakeMatch('KR_1')).teams;

    expect(blue?.players[0]).toEqual({
      participantId: 1,
      riotId: { gameName: 'Player 0', tagLine: 'EUW0' },
      championId: 517,
      championName: 'Sylas',
      level: 16,
      position: 'MIDDLE',
      spellIds: [4, 14],
      runes: { keystoneId: 8008, secondaryStyleId: 8400 },
      itemIds: [3078, 3157, 0, 0, 0, 0, 3340],
      kills: 7,
      deaths: 2,
      assists: 9,
      creepScore: 192,
      damageToChampions: 10_000,
      gold: 12_000,
      visionScore: 20,
    });
  });

  it('adds up the kills and the gold of a team', () => {
    const [blue, red] = buildMatchDetails(fakeMatch('KR_1')).teams;

    expect(blue).toMatchObject({ kills: 35, gold: 60_000 + 1000 });
    // Players 5 to 9 earned 12 500 to 12 900.
    expect(red?.gold).toBe(12_500 + 12_600 + 12_700 + 12_800 + 12_900);
  });

  it('gives what each side took on the map', () => {
    const match = fakeMatch('KR_1');
    match.info.teams = [
      { teamId: 200, objectives: { tower: { kills: 2, first: false } } },
      {
        teamId: 100,
        objectives: {
          tower: { kills: 9 },
          inhibitor: { kills: 1 },
          dragon: { kills: 3 },
          baron: { kills: 1 },
          riftHerald: { kills: 2 },
          // Left out: not shown.
          horde: { kills: 6 },
        },
      },
    ];

    const [blue, red] = buildMatchDetails(match).teams;

    expect(blue?.objectives).toEqual({
      towers: 9,
      inhibitors: 1,
      dragons: 3,
      barons: 1,
      heralds: 2,
    });
    // What Riot does not list is 0.
    expect(red?.objectives).toEqual({
      towers: 2,
      inhibitors: 0,
      dragons: 0,
      barons: 0,
      heralds: 0,
    });
  });

  it('gives no objectives for a match that does not tell them', () => {
    const teams = buildMatchDetails(fakeMatch('KR_1')).teams;

    expect(teams.map((team) => team.objectives)).toEqual([null, null]);
  });

  it('puts the best team first in Arena, which has no objectives', () => {
    const details = buildMatchDetails(arenaMatch());

    expect(details.teams).toHaveLength(6);
    // Team 6 came first, team 1 last.
    expect(details.teams.map((team) => [team.id, team.placement])).toEqual([
      [6, 1],
      [5, 2],
      [4, 3],
      [3, 4],
      [2, 5],
      [1, 6],
    ]);
    expect(details.teams.map((team) => team.result)).toEqual([
      'win',
      'win',
      'win',
      'loss',
      'loss',
      'loss',
    ]);
    expect(details.teams.every((team) => team.players.length === 3)).toBe(true);
    expect(details.teams.every((team) => team.objectives === null)).toBe(true);
    expect(details.teams[5]?.players[0]).toMatchObject({
      participantId: 1,
      runes: null,
      position: null,
    });
  });

  it('counts what a match from before the later fields does not tell as 0', () => {
    const old = fakeMatch('EUW1_1');
    old.info.participants = old.info.participants.map((participant) =>
      without(participant, ADDED_LATER),
    );

    const [blue] = buildMatchDetails(old).teams;

    expect(blue?.players[0]).toMatchObject({
      riotId: null,
      level: 0,
      spellIds: [],
      runes: null,
      itemIds: [0, 0, 0, 0, 0, 0, 0],
      damageToChampions: 0,
      gold: 0,
      visionScore: 0,
    });
    expect(blue?.gold).toBe(0);
  });

  it('keeps the PUUIDs to itself', () => {
    const json = JSON.stringify(buildMatchDetails(fakeMatch('KR_1')));

    expect(json).not.toContain('other-puuid');
    expect(json).not.toContain(PLAYER_PUUID);
  });
});
