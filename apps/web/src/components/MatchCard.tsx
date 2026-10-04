import type {
  MatchParticipant,
  MatchSummary,
  PlayerParams,
  StaticData,
} from '@statslol/shared';
import { Link } from 'react-router';

import {
  championImageUrl,
  findChampion,
  findItemName,
  findRune,
  findSpell,
  itemImageUrl,
  runeImageUrl,
  spellImageUrl,
} from '../data-dragon.ts';
import {
  formatCsPerMinute,
  formatDateTime,
  formatDuration,
  formatKdaRatio,
  formatResult,
  formatTimeAgo,
  positionName,
  teamName,
} from '../format.ts';
import { playerPath } from '../player-path.ts';
import { queueName } from '../queues.ts';
import { GameImage } from './GameImage.tsx';
import styles from './MatchCard.module.css';

const CHAMPION_IMAGE_SIZE = 56;
// Spells, runes and items: 2 rows of them are as high as the champion's image.
const SLOT_SIZE = 27;
const TEAMMATE_IMAGE_SIZE = 18;

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
  /** When the matches were loaded: "2 hours ago" is counted from then. */
  readonly now: number;
}

/** One game of the player: result, champion, spells, runes, items, and the other players. */
export function MatchCard({ match, player, staticData, now }: MatchCardProps) {
  const champion =
    staticData === undefined
      ? undefined
      : findChampion(staticData, match.championId);
  const position = positionName(match.position);

  return (
    <li className={styles.match} data-result={match.result}>
      <div className={styles.info}>
        <p className={styles.result}>{formatResult(match)}</p>
        <p className={styles.muted}>{queueName(match.queueId)}</p>
        <p className={styles.muted}>
          <time
            dateTime={match.startedAt}
            title={formatDateTime(match.startedAt)}
          >
            {formatTimeAgo(match.startedAt, now)}
          </time>
          {' · '}
          {formatDuration(match.durationSeconds)}
        </p>
      </div>

      <div className={styles.loadout}>
        <GameImage
          src={
            staticData === undefined || champion === undefined
              ? null
              : championImageUrl(staticData.version, champion)
          }
          size={CHAMPION_IMAGE_SIZE}
          className={styles.champion}
          fallback={<span className={styles.champion} />}
        />
        <Spells spellIds={match.spellIds} staticData={staticData} />
        {match.runes !== null && (
          <Runes runes={match.runes} staticData={staticData} />
        )}
      </div>

      <div className={styles.stats}>
        {/* Data Dragon's name ("Wukong"), or else Riot's internal one ("MonkeyKing"). */}
        <p className={styles.strong}>{champion?.name ?? match.championName}</p>
        {position !== null && <p className={styles.muted}>{position}</p>}
        <p className={styles.strong}>
          <span className="visually-hidden">Kills, deaths, assists: </span>
          {match.kills} / {match.deaths} / {match.assists}
        </p>
        <p className={styles.muted}>
          {formatKdaRatio(match.kills, match.deaths, match.assists)} KDA
        </p>
        <p>
          {match.creepScore} CS (
          {formatCsPerMinute(match.creepScore, match.durationSeconds)}/min)
        </p>
      </div>

      <Items itemIds={match.itemIds} staticData={staticData} />
      <Players match={match} player={player} staticData={staticData} />
    </li>
  );
}

interface SlotImageProps {
  /** URL of the image; null when it cannot be known (no static data). */
  readonly src: string | null;
  /** What the image shows; undefined when Data Dragon does not say. */
  readonly name: string | undefined;
}

/** The image of a spell, a rune or an item: a square of the same size, empty if it is missing. */
function SlotImage({ src, name }: SlotImageProps) {
  return (
    <GameImage
      src={src}
      size={SLOT_SIZE}
      className={styles.slot}
      alt={name}
      fallback={
        <span
          className={styles.slot}
          // The name stays for screen readers and for the mouse, whatever the image.
          role={name === undefined ? undefined : 'img'}
          aria-label={name}
          title={name}
        />
      }
    />
  );
}

/** The 2 summoner spells; none in modes without them. */
function Spells({
  spellIds,
  staticData,
}: {
  readonly spellIds: MatchSummary['spellIds'];
  readonly staticData: StaticData | undefined;
}) {
  if (spellIds.length === 0) return null;
  return (
    <div role="group" aria-label="Summoner spells" className={styles.pair}>
      {spellIds.map((spellId) => {
        const spell =
          staticData === undefined ? undefined : findSpell(staticData, spellId);
        return (
          <SlotImage
            key={spellId}
            src={
              staticData === undefined || spell === undefined
                ? null
                : spellImageUrl(staticData.version, spell)
            }
            name={spell?.name}
          />
        );
      })}
    </div>
  );
}

/** The keystone and the secondary tree of runes. */
function Runes({
  runes,
  staticData,
}: {
  readonly runes: NonNullable<MatchSummary['runes']>;
  readonly staticData: StaticData | undefined;
}) {
  return (
    <div role="group" aria-label="Runes" className={styles.pair}>
      {[runes.keystoneId, runes.secondaryStyleId].map((runeId) => {
        const rune =
          staticData === undefined ? undefined : findRune(staticData, runeId);
        return (
          <SlotImage
            key={runeId}
            src={rune === undefined ? null : runeImageUrl(rune)}
            name={rune?.name}
          />
        );
      })}
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
          <SlotImage
            key={slot}
            // The file is named by the ID: the image is known even if the name is not.
            src={
              staticData === undefined
                ? null
                : itemImageUrl(staticData.version, itemId)
            }
            name={
              staticData === undefined
                ? undefined
                : findItemName(staticData, itemId)
            }
          />
        );
      })}
    </div>
  );
}

/**
 * The other players of the match, a column for each side, with a link to each profile. In
 * Arena, where there are 18 players, only the player's own team: the others are for the
 * details of the match.
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
  if (teamIds.length === 0) return null;

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
            .map((participant, index) => (
              <Teammate
                // Riot's order is stable: two players can share a name, never a place.
                key={index}
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
  const champion =
    staticData === undefined
      ? undefined
      : findChampion(staticData, participant.championId);
  const { riotId } = participant;
  const name = riotId === null ? participant.championName : riotId.gameName;
  return (
    <p
      className={styles.teammate}
      // The player whose page this is: the others are links to their page.
      aria-current={participant.isPlayer ? 'true' : undefined}
      data-player={participant.isPlayer}
    >
      <GameImage
        src={
          staticData === undefined || champion === undefined
            ? null
            : championImageUrl(staticData.version, champion)
        }
        size={TEAMMATE_IMAGE_SIZE}
        className={styles.teammateImage}
        fallback={<span className={styles.teammateImage} />}
      />
      {riotId === null || participant.isPlayer ? (
        <span className={styles.teammateName}>{name}</span>
      ) : (
        <Link
          className={styles.teammateName}
          to={playerPath({
            region,
            name: riotId.gameName,
            tag: riotId.tagLine,
          })}
          title={`${riotId.gameName}#${riotId.tagLine}`}
        >
          {name}
        </Link>
      )}
    </p>
  );
}
