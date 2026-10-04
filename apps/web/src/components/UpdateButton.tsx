import { REFRESH_COOLDOWN_SECONDS, type PlayerParams } from '@statslol/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client.ts';
import { describeError } from '../api/errors.ts';
import { refreshPlayer, reloadPlayer } from '../api/players.ts';
import { formatDuration } from '../format.ts';
import { useCooldown } from '../use-cooldown.ts';
import styles from './UpdateButton.module.css';

/**
 * "Update": asks the API to forget what it knows about the player, then loads fresh data.
 * A player can be updated once every 2 minutes, whoever asks: the button counts down.
 */
export function UpdateButton({ player }: { player: PlayerParams }) {
  const queryClient = useQueryClient();
  const cooldown = useCooldown();
  const update = useMutation({
    mutationFn: () => refreshPlayer(player),
    onSuccess: () => {
      cooldown.start(REFRESH_COOLDOWN_SECONDS);
      // Stays "Updating…" until the fresh data is shown.
      return reloadPlayer(queryClient, player);
    },
    onError: (error) => {
      if (isTooSoon(error)) {
        cooldown.start(error.retryAfterSeconds ?? REFRESH_COOLDOWN_SECONDS);
      }
    },
  });

  let label = 'Update';
  if (update.isPending) {
    label = 'Updating…';
  } else if (cooldown.secondsLeft > 0) {
    label = `Update in ${formatDuration(cooldown.secondsLeft)}`;
  }

  return (
    <div className={styles.update}>
      <button
        type="button"
        className={styles.button}
        disabled={update.isPending || cooldown.secondsLeft > 0}
        onClick={() => {
          update.mutate();
        }}
      >
        {label}
      </button>
      {/* Always in the page: screen readers announce the changes of a status region they
          already know of. The countdown stays in the button, not to be read every second. */}
      <p role="status" className={styles.message}>
        {update.isSuccess && 'Updated.'}
        {isTooSoon(update.error) && 'This player was updated recently.'}
      </p>
      {update.error !== null && !isTooSoon(update.error) && (
        <p role="alert" className={styles.message}>
          The update failed. {describeError(update.error)}
        </p>
      )}
    </div>
  );
}

/** A 429: the player was updated less than 2 minutes ago, or this visitor asked too often. */
function isTooSoon(error: Error | null): error is ApiError {
  return error instanceof ApiError && error.status === 429;
}
