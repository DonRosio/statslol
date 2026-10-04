import { describeError } from '../api/errors.ts';
import styles from './ErrorMessage.module.css';

interface ErrorMessageProps {
  /** What could not be done, e.g. "The profile could not be loaded." */
  readonly title: string;
  readonly error: Error;
  /** Sends the failed request again ("Try again" button). */
  readonly onRetry: () => void;
  /** True while the request is sent again. */
  readonly retrying: boolean;
}

/** A failed request to the API: what failed, why in plain words, and a way to try again. */
export function ErrorMessage({
  title,
  error,
  onRetry,
  retrying,
}: ErrorMessageProps) {
  return (
    <div className={styles.error}>
      <p role="alert">
        <strong>{title}</strong> {describeError(error)}
      </p>
      <button
        type="button"
        className={styles.retry}
        disabled={retrying}
        onClick={onRetry}
      >
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  );
}
