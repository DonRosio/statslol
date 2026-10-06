import type {
  MatchParticipant,
  MatchSummary,
  PlayerParams,
  StaticData,
} from '@statslol/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import { itemThing, runeThing, spellThing } from '../data-dragon.ts';
import {
  formatDateTime,
  formatDuration,
  formatKdaRatio,
  formatPerMinute,
  formatResult,
  formatTimeAgo,
  teamName,
} from '../format.ts';
import { playerPath } from '../player-path.ts';
import { queueName } from '../queues.ts';
import { ChampionIcon } from './ChampionIcon.tsx';
import { GameSlot } from './GameSlot.tsx';
import { MatchDetails } from './MatchDetails.tsx';
import { PositionIcon } from './PositionIcon.tsx';
import styles from './MatchCard.module.css';

const CHAMPION_IMAGE_SIZE = 46;
// Spells, runes and items: 2 rows of them are about as high as the champion's image.
const SLOT_SIZE = 22;
// The main rune is bigger than the tree of the secondary ones; both fill the height of 2 slots.
const KEYSTONE_SIZE = 26;
const SECONDARY_TREE_SIZE = 16;
const TEAMMATE_IMAGE_SIZE = 20;

/**
 * The slots of the inventory in the order they are shown: 4 columns, the 3 first items then
 * the trinket (the 7th slot) on the first row, the 3 others on the second.
 */
const ITEM_DISPLAY_ORDER = [0, 1, 2, 6, 3, 4, 5] as const;

interface MatchCardProps {
  readonly match: MatchSummary;
  /** The player whose page this is: the players of the match are on the same server. */
  readonly player: PlayerParams;
  readonly staticData: StaticData | undefined;
  /** When the matches were loaded: "2h ago" is counted from then. */
  readonly now: number;
}

/** One game of the player: result, champion, spells, runes, items, and the other players. */
export function MatchCard({ match, player, staticData, now }: MatchCardProps) {
  // What a support is judged on is the vision, not the minions.
  const isSupport = match.position === 'UTILITY';
  // The details are asked to the API when they are opened for the first time.
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  // A win or a loss is told by the color of the card; a place (Arena) or a remake is written.
  const resultIsWritten = match.placement !== null || match.result === 'remake';

  return (
    <li className={styles.match} data-result={match.result}>
      <div className={styles.content}>
        {/* Three lines, one under the other: the mode, the length of the game, how long ago.
          A place (Arena) or a remake is written under the mode, and the length goes with the
          time. */}
        <div className={styles.info}>
          <p className={styles.result}>
            {/* The color is not enough for screen readers: they get the word. */}
            {!resultIsWritten && (
              <>
                <span className="visually-hidden">
                  {formatResult(match)}
                </span>{' '}
              </>
            )}
            <span>{queueName(match.queueId)}</span>
          </p>
          <p className={styles.muted}>
            {resultIsWritten
              ? formatResult(match)
              : formatDuration(match.durationSeconds)}
          </p>
          <p className={styles.muted}>
            {resultIsWritten && <>{formatDuration(match.durationSeconds)} · </>}
            <time
              dateTime={match.startedAt}
              title={formatDateTime(match.startedAt)}
            >
              {formatTimeAgo(match.startedAt, now)}
            </time>
          </p>
        </div>

        <div className={styles.champion}>
          <ChampionIcon
            championId={match.championId}
            championName={match.championName}
            staticData={staticData}
            size={CHAMPION_IMAGE_SIZE}
          />
          <div className={styles.level}>
            <span className={styles.muted}>Lvl. {match.level}</span>
            <PositionIcon position={match.position} />
          </div>
        </div>

        <div className={styles.stats}>
          <p className={styles.score}>
            <span className="visually-hidden">Kills, deaths, assists: </span>
            {match.kills}
            <span className={styles.slash}> / </span>
            <span className={styles.deaths}>{match.deaths}</span>
            <span className={styles.slash}> / </span>
            {match.assists}
          </p>
          <p className={styles.muted}>
            {formatKdaRatio(match.kills, match.deaths, match.assists)} KDA
          </p>
          <p className={styles.muted}>
            {isSupport
              ? `${String(match.visionScore)} vision (${formatPerMinute(match.visionScore, match.durationSeconds)})`
              : `${String(match.creepScore)} CS (${formatPerMinute(match.creepScore, match.durationSeconds)})`}
          </p>
        </div>

        <div className={styles.cluster}>
          <Spells spellIds={match.spellIds} staticData={staticData} />
          <Runes runes={match.runes} staticData={staticData} />
          <Items itemIds={match.itemIds} staticData={staticData} />
        </div>

        <Players match={match} player={player} staticData={staticData} />
      </div>

      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        aria-label={
          open
            ? 'Hide the details of the match'
            : 'Show the details of the match'
        }
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
          className={open ? styles.chevronOpen : styles.chevron}
        >
          <path d="m3 6 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <MatchDetails
          id={detailsId}
          match={match}
          player={player}
          staticData={staticData}
        />
      )}
    </li>
  );
}

/** Two empty squares, where a mode has no spells or no runes: the items stay in line. */
function EmptyPair() {
  return (
    <div className={styles.pair} aria-hidden="true">
      <span className={styles.slot} />
      <span className={styles.slot} />
    </div>
  );
}

/** The 2 summoner spells. */
function Spells({
  spellIds,
  staticData,
}: {
  readonly spellIds: MatchSummary['spellIds'];
  readonly staticData: StaticData | undefined;
}) {
  if (spellIds.length === 0) return <EmptyPair />;
  return (
    <div role="group" aria-label="Summoner spells" className={styles.pair}>
      {spellIds.map((spellId) => (
        <GameSlot
          key={spellId}
          thing={spellThing(staticData, spellId)}
          size={SLOT_SIZE}
          className={styles.slot}
        />
      ))}
    </div>
  );
}

/**
 * The keystone and the secondary tree of runes, with no background (the images have their
 * own shape). In modes without runes (Arena) the room stays, empty, so the items stay in line.
 */
function Runes({
  runes,
  staticData,
}: {
  readonly runes: MatchSummary['runes'];
  readonly staticData: StaticData | undefined;
}) {
  if (runes === null)
    return <div className={styles.runes} aria-hidden="true" />;
  return (
    <div role="group" aria-label="Runes" className={styles.runes}>
      <GameSlot
        thing={runeThing(staticData, runes.keystoneId)}
        size={KEYSTONE_SIZE}
        className={styles.keystone}
      />
      <GameSlot
        thing={runeThing(staticData, runes.secondaryStyleId)}
        size={SECONDARY_TREE_SIZE}
        className={styles.secondary}
      />
    </div>
  );
}

/** The inventory at the end of the game, empty slots included. */
function Items({
  itemIds,
  staticData,
}: {
  readonly itemIds: MatchSummary['itemIds'];
  readonly staticData: StaticData | undefined;
}) {
  return (
    <div role="group" aria-label="Items" className={styles.items}>
      {ITEM_DISPLAY_ORDER.map((slot) => {
        const itemId = itemIds[slot] ?? 0;
        // An empty slot is only a square: nothing to tell.
        if (itemId === 0) {
          return <span key={slot} className={styles.slot} aria-hidden="true" />;
        }
        return (
          <GameSlot
            key={slot}
            thing={itemThing(staticData, itemId)}
            size={SLOT_SIZE}
            className={styles.slot}
          />
        );
      })}
    </div>
  );
}

/**
 * The players of the match, a row of champions for each side, each a link to the profile
 * of the player (their name is in the tooltip). In Arena, where there are 18 players, only
 * the player's own team: the others are for the details of the match.
 */
function Players({
  match,
  player,
  staticData,
}: {
  readonly match: MatchSummary;
  readonly player: PlayerParams;
  readonly staticData: StaticData | undefined;
}) {
  const subteamId = match.participants.find(
    (participant) => participant.isPlayer,
  )?.subteamId;
  const shown =
    subteamId === null || subteamId === undefined
      ? match.participants
      : match.participants.filter(
          (participant) => participant.subteamId === subteamId,
        );
  const teamIds = [...new Set(shown.map(({ teamId }) => teamId))].sort(
    (a, b) => a - b,
  );
  // The block keeps its width without players, so that the other blocks stay in line.
  if (teamIds.length === 0) return <div className={styles.players} />;

  return (
    <div className={styles.players}>
      {teamIds.map((teamId) => (
        <div
          key={teamId}
          role="group"
          aria-label={
            subteamId === null || subteamId === undefined
              ? teamName(teamId)
              : 'Team of the player'
          }
          className={styles.team}
        >
          {shown
            .filter((participant) => participant.teamId === teamId)
            .map((participant) => (
              <Teammate
                // Each player has a place of his own in the match.
                key={participant.participantId}
                participant={participant}
                region={player.region}
                staticData={staticData}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function Teammate({
  participant,
  region,
  staticData,
}: {
  readonly participant: MatchParticipant;
  readonly region: PlayerParams['region'];
  readonly staticData: StaticData | undefined;
}) {
  const { riotId } = participant;
  // The name tells who this is: the icon is only the champion they played.
  const name = riotId === null ? participant.championName : riotId.gameName;
  const fullName =
    riotId === null ? name : `${riotId.gameName}#${riotId.tagLine}`;
  const icon = (
    <ChampionIcon
      championId={participant.championId}
      championName={participant.championName}
      staticData={staticData}
      size={TEAMMATE_IMAGE_SIZE}
    />
  );
  // The others are links to their page; the player whose page this is, and a player Riot
  // does not name, are only marked.
  if (riotId !== null && !participant.isPlayer) {
    return (
      <Link
        className={styles.teammate}
        to={playerPath({ region, name: riotId.gameName, tag: riotId.tagLine })}
        title={fullName}
        aria-label={name}
      >
        {icon}
      </Link>
    );
  }
  return (
    <span
      className={styles.teammate}
      role="img"
      aria-label={name}
      aria-current={participant.isPlayer ? 'true' : undefined}
      data-player={participant.isPlayer}
      title={fullName}
    >
      {icon}
    </span>
  );
}
