import type { PlayerParams, PlayerProfile } from '@statslol/shared';

import { useStaticData } from '../api/static-data.ts';
import { profileIconUrl } from '../data-dragon.ts';
import { REGION_NAMES } from '../regions.ts';
import { GameImage } from './GameImage.tsx';
import styles from './ProfileHeader.module.css';
import { UpdateButton } from './UpdateButton.tsx';

const ICON_SIZE = 72;

interface ProfileHeaderProps {
  /** Who the page is about, from its URL: shown at once, before the profile loads. */
  readonly player: PlayerParams;
  /** Undefined until the API answers. */
  readonly profile: PlayerProfile | undefined;
}

/** Profile icon, Riot ID, region and level of a player, and the "Update" button. */
export function ProfileHeader({ player, profile }: ProfileHeaderProps) {
  const staticData = useStaticData();
  // Riot's answer writes the Riot ID the way its owner chose, whatever was typed in the URL.
  const riotId = profile?.riotId ?? {
    gameName: player.name,
    tagLine: player.tag,
  };
  const iconSrc =
    profile === undefined || staticData === undefined
      ? null
      : profileIconUrl(staticData.version, profile.profileIconId);

  return (
    <header className={styles.header}>
      <GameImage
        src={iconSrc}
        size={ICON_SIZE}
        className={styles.icon}
        fallback={<span className={styles.icon} />}
      />
      <div>
        {/* No space before the tag: the heading reads "Hide on bush#KR1", as in the game. */}
        <h1 className={styles.riotId}>
          {riotId.gameName}
          <span className={styles.tag}>#{riotId.tagLine}</span>
        </h1>
        <p className={styles.details}>
          {REGION_NAMES[player.region]}
          {profile !== undefined && ` · Level ${String(profile.summonerLevel)}`}
        </p>
        {profile !== undefined && <UpdateButton player={player} />}
      </div>
    </header>
  );
}
