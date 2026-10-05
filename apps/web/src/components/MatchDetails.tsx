import type {
  MatchPlayer,
  MatchSummary,
  MatchTeam,
  PlayerParams,
  StaticData,
} from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';

import { matchDetailsQuery } from '../api/matches.ts';
import {
  championImageUrl,
  findChampion,
  findItemName,
  itemImageUrl,
} from '../data-dragon.ts';
import {
  formatGold,
  formatKdaRatio,
  formatNumber,
  formatPerMinute,
  formatResult,
  teamName,
} from '../format.ts';
import { playerPath } from '../player-path.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { GameImage } from './GameImage.tsx';
import styles from './MatchDetails.module.css';

const CHAMPION_IMAGE_SIZE = 26;
const ITEM_SIZE = 22;

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
  staticData,
}: {
  readonly team: MatchTeam;
  readonly durationSeconds: number;
  readonly region: PlayerParams['region'];
  readonly participantId: number | undefined;
  readonly mostDamage: number;
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
        <span className={styles.muted}>
          {team.kills} kills · {formatGold(team.gold)} gold
        </span>
        {objectives !== null && (
          <span className={styles.muted}>
            {objectives.towers} towers · {objectives.dragons} dragons ·{' '}
            {objectives.barons} barons
            {objectives.heralds > 0 &&
              ` · ${String(objectives.heralds)} heralds`}
            {objectives.inhibitors > 0 &&
              ` · ${String(objectives.inhibitors)} inhibitors`}
          </span>
        )}
      </header>
      <div
        role="table"
        aria-label={`${title}, players`}
        className={styles.table}
      >
        {/* The columns are not written above the numbers, but screen readers get them. */}
        <div role="row" className="visually-hidden">
          <span role="columnheader">Player</span>
          <span role="columnheader">KDA</span>
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
            arena={arena}
            durationSeconds={durationSeconds}
            isPlayer={one.participantId === participantId}
            region={region}
            mostDamage={mostDamage}
            staticData={staticData}
          />
        ))}
      </div>
    </section>
  );
}

function PlayerRow({
  one,
  arena,
  durationSeconds,
  isPlayer,
  region,
  mostDamage,
  staticData,
}: {
  readonly one: MatchPlayer;
  readonly arena: boolean;
  readonly durationSeconds: number;
  readonly isPlayer: boolean;
  readonly region: PlayerParams['region'];
  readonly mostDamage: number;
  readonly staticData: StaticData | undefined;
}) {
  const champion =
    staticData === undefined
      ? undefined
      : findChampion(staticData, one.championId);
  const championName = champion?.name ?? one.championName;
  const { riotId } = one;
  const name = riotId === null ? championName : riotId.gameName;
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
        <GameImage
          src={
            staticData === undefined || champion === undefined
              ? null
              : championImageUrl(staticData.version, champion)
          }
          size={CHAMPION_IMAGE_SIZE}
          className={styles.championImage}
          alt={championName}
          fallback={
            <span
              className={styles.championImage}
              role="img"
              aria-label={championName}
            />
          }
        />
        {riotId !== null && !isPlayer ? (
          <Link
            className={styles.name}
            to={playerPath({
              region,
              name: riotId.gameName,
              tag: riotId.tagLine,
            })}
            title={`${riotId.gameName}#${riotId.tagLine}`}
          >
            {name}
          </Link>
        ) : (
          <span className={styles.name}>{name}</span>
        )}
      </div>
      <div role="cell" className={[styles.cell, styles.kda].join(' ')}>
        <span className={styles.strong}>
          {one.kills} / {one.deaths} / {one.assists}
        </span>
        <span className={styles.small}>
          {formatKdaRatio(one.kills, one.deaths, one.assists)}
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
        {one.itemIds.map((itemId, slot) => (
          <Item
            // The same item can be bought twice: the slot tells them apart.
            key={slot}
            itemId={itemId}
            staticData={staticData}
          />
        ))}
      </div>
    </div>
  );
}

function Item({
  itemId,
  staticData,
}: {
  readonly itemId: number;
  readonly staticData: StaticData | undefined;
}) {
  if (itemId === 0) {
    return <span className={styles.item} aria-hidden="true" />;
  }
  const name =
    staticData === undefined ? undefined : findItemName(staticData, itemId);
  return (
    <GameImage
      src={
        staticData === undefined
          ? null
          : itemImageUrl(staticData.version, itemId)
      }
      size={ITEM_SIZE}
      className={styles.item}
      alt={name}
      fallback={
        <span
          className={styles.item}
          role={name === undefined ? undefined : 'img'}
          aria-label={name}
          title={name}
        />
      }
    />
  );
}
