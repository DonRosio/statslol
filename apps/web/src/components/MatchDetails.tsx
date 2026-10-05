import type {
  MatchPlayer,
  MatchRanks,
  MatchSummary,
  MatchTeam,
  PlayerParams,
  StaticData,
} from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';

import { matchDetailsQuery, matchRanksQuery } from '../api/matches.ts';
import { itemThing, runeThing, spellThing } from '../data-dragon.ts';
import { GOLD_ICON, OBJECTIVES, rankEmblem } from '../game-icons.ts';
import {
  formatGold,
  formatKillParticipation,
  formatNumber,
  formatPerMinute,
  formatRankName,
  formatResult,
  teamName,
} from '../format.ts';
import { playerPath } from '../player-path.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { ChampionIcon } from './ChampionIcon.tsx';
import { GameSlot } from './GameSlot.tsx';
import styles from './MatchDetails.module.css';

const CHAMPION_IMAGE_SIZE = 34;
const ITEM_SIZE = 22;
const SPELL_SIZE = 16;
// The main rune is bigger than the tree of the secondary ones.
const KEYSTONE_SIZE = 22;
const SECONDARY_TREE_SIZE = 14;
const RANK_EMBLEM_HEIGHT = 14;

/** The tabs of the opened details. What the second one shows is not decided yet. */
const TABS = [
  { id: 'general', label: 'General' },
  { id: 'analysis', label: 'Analysis' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * The opened details of a match, under its card: a menu bar of tabs, then the content of the
 * tab. The first one holds a table for each team, with all its players; its data is asked to
 * the API when the details are opened for the first time (see MatchCard), then kept.
 */
export function MatchDetails({
  match,
  player,
  staticData,
  id,
}: {
  readonly match: MatchSummary;
  readonly player: PlayerParams;
  readonly staticData: StaticData | undefined;
  /** For the button that opens this: it says what it controls. */
  readonly id: string;
}) {
  const [tab, setTab] = useState<TabId>('general');
  const tabsId = useId();
  const buttons = useRef(new Map<TabId, HTMLButtonElement>());

  // The arrows go from a tab to the next one, as in any tab bar.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.findIndex(({ id: tabId }) => tabId === tab);
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = TABS[(target + TABS.length) % TABS.length];
    if (next !== undefined) {
      setTab(next.id);
      buttons.current.get(next.id)?.focus();
    }
  }

  return (
    <div className={styles.details} id={id}>
      <div
        role="tablist"
        aria-label="Details of the match"
        className={styles.tabs}
        onKeyDown={handleKeyDown}
      >
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            ref={(button) => {
              if (button === null) buttons.current.delete(tabId);
              else buttons.current.set(tabId, button);
            }}
            type="button"
            role="tab"
            id={`${tabsId}-${tabId}-tab`}
            aria-selected={tab === tabId}
            aria-controls={`${tabsId}-${tabId}`}
            // Only the selected tab is reached with Tab: the arrows go to the others.
            tabIndex={tab === tabId ? 0 : -1}
            className={styles.tab}
            onClick={() => {
              setTab(tabId);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-${tab}`}
        aria-labelledby={`${tabsId}-${tab}-tab`}
      >
        {tab === 'general' ? (
          <General match={match} player={player} staticData={staticData} />
        ) : (
          <p className={styles.soon}>The analysis is coming soon.</p>
        )}
      </div>
    </div>
  );
}

/** The "General" tab: the teams of the match and their players. */
function General({
  match,
  player,
  staticData,
}: {
  readonly match: MatchSummary;
  readonly player: PlayerParams;
  readonly staticData: StaticData | undefined;
}) {
  const details = useQuery(matchDetailsQuery(player.region, match.id));
  // The ranks of the players are asked once the details are there, and fill in when they come:
  // the table does not wait for them (each one is a call to Riot), and does without if they fail.
  const ranks = useQuery({
    ...matchRanksQuery(player.region, match.id),
    enabled: details.data !== undefined,
  });

  if (details.data === undefined) {
    return details.error === null ? (
      <>
        <p role="status" className="visually-hidden">
          Loading the details of the match…
        </p>
        <div
          className={['skeleton', styles.placeholder].join(' ')}
          aria-hidden="true"
        />
      </>
    ) : (
      <ErrorMessage
        title="The details of the match could not be loaded."
        error={details.error}
        onRetry={() => {
          void details.refetch();
        }}
        retrying={details.isFetching}
      />
    );
  }

  const { teams, durationSeconds } = details.data;
  // The player whose page this is, in the list of the match: the one to mark.
  const participantId = match.participants.find(
    (participant) => participant.isPlayer,
  )?.participantId;
  const mostDamage = Math.max(
    1,
    ...teams.flatMap((team) =>
      team.players.map((one) => one.damageToChampions),
    ),
  );
  return (
    <div className={styles.teams}>
      {teams.map((team) => (
        <Team
          key={team.id}
          team={team}
          durationSeconds={durationSeconds}
          region={player.region}
          participantId={participantId}
          mostDamage={mostDamage}
          ranks={ranks.data?.ranks}
          staticData={staticData}
        />
      ))}
    </div>
  );
}

function Team({
  team,
  durationSeconds,
  region,
  participantId,
  mostDamage,
  ranks,
  staticData,
}: {
  readonly team: MatchTeam;
  readonly durationSeconds: number;
  readonly region: PlayerParams['region'];
  readonly participantId: number | undefined;
  readonly mostDamage: number;
  /** The rank of each player, by participantId; undefined until they are known. */
  readonly ranks: MatchRanks['ranks'] | undefined;
  readonly staticData: StaticData | undefined;
}) {
  const title = formatResult(team);
  const { objectives } = team;
  // Teams that have a place are the teams of players of Arena: no sides of the map, and no
  // minions to count.
  const arena = team.placement !== null;
  return (
    <section
      className={styles.team}
      data-result={team.result}
      aria-label={arena ? title : `${title}, ${teamName(team.id)}`}
    >
      <header className={styles.teamHeader}>
        <strong className={styles.teamResult}>{title}</strong>
        {!arena && <span>{teamName(team.id)}</span>}
        <span className={styles.stat}>{team.kills} kills</span>
        <span className={styles.stat}>
          <img
            src={GOLD_ICON}
            alt="Gold"
            title="Gold"
            height={14}
            className={styles.statIcon}
          />
          {formatGold(team.gold)}
        </span>
        {objectives !== null &&
          OBJECTIVES.map(({ key, icon, name }) => (
            <span key={key} className={styles.stat}>
              <img
                src={icon}
                alt={name}
                title={name}
                height={16}
                className={styles.statIcon}
              />
              {objectives[key]}
            </span>
          ))}
      </header>
      <div
        role="table"
        aria-label={`${title}, players`}
        className={styles.table}
      >
        {/* The columns are not written above the numbers, but screen readers get them. */}
        <div role="row" className="visually-hidden">
          <span role="columnheader">Player</span>
          <span role="columnheader">KDA and kill participation</span>
          <span role="columnheader">Damage to champions</span>
          <span role="columnheader">
            Creep score per minute, or vision score
          </span>
          <span role="columnheader">Items</span>
        </div>
        {team.players.map((one) => (
          <PlayerRow
            key={one.participantId}
            one={one}
            teamKills={team.kills}
            arena={arena}
            durationSeconds={durationSeconds}
            isPlayer={one.participantId === participantId}
            region={region}
            mostDamage={mostDamage}
            rank={ranks?.[String(one.participantId)]}
            staticData={staticData}
          />
        ))}
      </div>
    </section>
  );
}

function PlayerRow({
  one,
  teamKills,
  arena,
  durationSeconds,
  isPlayer,
  region,
  mostDamage,
  rank,
  staticData,
}: {
  readonly one: MatchPlayer;
  /** The kills of the player's team: kill participation is counted on them. */
  readonly teamKills: number;
  readonly arena: boolean;
  readonly durationSeconds: number;
  readonly isPlayer: boolean;
  readonly region: PlayerParams['region'];
  readonly mostDamage: number;
  /** Solo rank: undefined until it is known, null for no rank. */
  readonly rank: MatchRanks['ranks'][string] | undefined;
  readonly staticData: StaticData | undefined;
}) {
  const rankId = useId();
  const { riotId } = one;
  const name = riotId === null ? one.championName : riotId.gameName;
  // What a support is judged on is the vision, not the minions.
  const isSupport = one.position === 'UTILITY';
  return (
    <div
      role="row"
      className={styles.row}
      // The player whose page this is: marked. The others are links to their page.
      aria-current={isPlayer ? 'true' : undefined}
      data-player={isPlayer}
    >
      <div role="cell" className={[styles.cell, styles.player].join(' ')}>
        <div className={styles.icon}>
          <ChampionIcon
            championId={one.championId}
            championName={one.championName}
            staticData={staticData}
            size={CHAMPION_IMAGE_SIZE}
            badge={one.level}
          />
        </div>
        <div
          role="group"
          aria-label="Summoner spells"
          className={[styles.icon, styles.spells].join(' ')}
        >
          {one.spellIds.map((spellId) => (
            <GameSlot
              key={spellId}
              thing={spellThing(staticData, spellId)}
              size={SPELL_SIZE}
              className={styles.spell}
            />
          ))}
        </div>
        <div
          role="group"
          aria-label="Runes"
          className={[styles.icon, styles.runes].join(' ')}
        >
          {one.runes !== null && (
            <>
              <GameSlot
                thing={runeThing(staticData, one.runes.keystoneId)}
                size={KEYSTONE_SIZE}
                className={styles.keystone}
              />
              <GameSlot
                thing={runeThing(staticData, one.runes.secondaryStyleId)}
                size={SECONDARY_TREE_SIZE}
                className={styles.secondary}
              />
            </>
          )}
        </div>
        {riotId !== null && !isPlayer ? (
          // The link is the whole width the name has, over the height of the row. Its name is
          // the player's: the rank is its description.
          <Link
            className={styles.nameZone}
            to={playerPath({
              region,
              name: riotId.gameName,
              tag: riotId.tagLine,
            })}
            title={`${riotId.gameName}#${riotId.tagLine}`}
            aria-label={name}
            aria-describedby={rankId}
          >
            <span className={styles.name}>{name}</span>
            <RankLine id={rankId} rank={rank} />
          </Link>
        ) : (
          <span className={styles.nameZone}>
            <span className={styles.name}>{name}</span>
            <RankLine id={rankId} rank={rank} />
          </span>
        )}
      </div>
      <div role="cell" className={[styles.cell, styles.kda].join(' ')}>
        <span className={styles.strong}>
          {one.kills} / {one.deaths} / {one.assists}
        </span>
        <span className={styles.small}>
          {formatKillParticipation(one.kills, one.assists, teamKills)} KP
        </span>
      </div>
      <div role="cell" className={[styles.cell, styles.damage].join(' ')}>
        <span>{formatNumber(one.damageToChampions)}</span>
        {/* The bar is only a picture of the number next to it. */}
        <span className={styles.bar} aria-hidden="true">
          <span
            className={styles.barFill}
            style={{
              width: `${String(Math.round((one.damageToChampions / mostDamage) * 100))}%`,
            }}
          />
        </span>
      </div>
      <div role="cell" className={[styles.cell, styles.farm].join(' ')}>
        {arena ? null : isSupport ? (
          <>
            <span>{one.visionScore}</span>
            <span className={styles.small}>vision</span>
          </>
        ) : (
          <>
            <span>{formatPerMinute(one.creepScore, durationSeconds)}</span>
            <span className={styles.small}>CS/min</span>
          </>
        )}
      </div>
      <div role="cell" className={[styles.cell, styles.items].join(' ')}>
        {one.itemIds.map((itemId, slot) =>
          itemId === 0 ? (
            <span key={slot} className={styles.item} aria-hidden="true" />
          ) : (
            <GameSlot
              // The same item can be bought twice: the slot tells them apart.
              key={slot}
              thing={itemThing(staticData, itemId)}
              size={ITEM_SIZE}
              className={styles.item}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * The solo rank of a player, under their name: the emblem and "DIAMOND 1". Nothing until the
 * rank is known (the line keeps its room), "UNRANKED" for a player with no rank.
 */
function RankLine({
  id,
  rank,
}: {
  readonly id: string;
  readonly rank: MatchRanks['ranks'][string] | undefined;
}) {
  if (rank === undefined) {
    return <span id={id} className={styles.rank} />;
  }
  if (rank === null) {
    return (
      <span id={id} className={styles.rank}>
        UNRANKED
      </span>
    );
  }
  const emblem = rankEmblem(rank.tier);
  return (
    <span id={id} className={styles.rank}>
      {emblem !== undefined && (
        <img
          src={emblem}
          alt=""
          height={RANK_EMBLEM_HEIGHT}
          className={styles.emblem}
        />
      )}
      {formatRankName(rank)}
    </span>
  );
}
