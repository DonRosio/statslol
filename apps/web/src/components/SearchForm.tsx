import { DEFAULT_REGION, regionSchema, type Region } from '@statslol/shared';
import { useId, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';

import { loadLastRegion, saveLastRegion } from '../last-region.ts';
import { playerPath } from '../player-path.ts';
import { REGION_NAMES } from '../regions.ts';
import { parseRiotIdInput } from '../riot-id-input.ts';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  /** Text of the field at first, e.g. a Riot ID to correct. Empty by default. */
  readonly initialRiotId?: string;
  /** Region selected at first. By default the one of the last search, or EUW. */
  readonly initialRegion?: Region | undefined;
  /** The small version for the header: region code only, a magnifier instead of "Search". */
  readonly compact?: boolean;
}

/** Looks up a player: region + Riot ID, then opens their profile page. */
export function SearchForm({
  initialRiotId = '',
  initialRegion,
  compact = false,
}: SearchFormProps) {
  const navigate = useNavigate();
  const [riotId, setRiotId] = useState(initialRiotId);
  const [region, setRegion] = useState<Region>(
    () => initialRegion ?? loadLastRegion() ?? DEFAULT_REGION,
  );
  const [error, setError] = useState<string | null>(null);
  const riotIdFieldId = useId();
  const regionFieldId = useId();
  const errorId = useId();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseRiotIdInput(riotId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const { gameName, tagLine } = result.riotId;
    saveLastRegion(region);
    void navigate(playerPath({ region, name: gameName, tag: tagLine }));
  }

  return (
    <form
      className={compact ? styles.compact : styles.form}
      role="search"
      // The header's form shares the page with others: its name tells them apart.
      aria-label={compact ? 'Look up another player' : undefined}
      onSubmit={handleSubmit}
    >
      <label htmlFor={regionFieldId} className="visually-hidden">
        {compact ? 'Region of the player to look up' : 'Region'}
      </label>
      <select
        id={regionFieldId}
        value={region}
        onChange={(event) => {
          setRegion(regionSchema.parse(event.target.value));
        }}
      >
        {regionSchema.options.map((code) => (
          <option key={code} value={code}>
            {compact
              ? code.toUpperCase()
              : `${code.toUpperCase()} – ${REGION_NAMES[code]}`}
          </option>
        ))}
      </select>
      <label htmlFor={riotIdFieldId} className="visually-hidden">
        {compact ? 'Riot ID of the player to look up' : 'Riot ID'}
      </label>
      <input
        id={riotIdFieldId}
        type="text"
        value={riotId}
        placeholder="Game name#Tag"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => {
          setRiotId(event.target.value);
          setError(null);
        }}
      />
      {compact ? (
        <button type="submit" aria-label="Look up">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
        </button>
      ) : (
        <button type="submit">Search</button>
      )}
      {error !== null && (
        // role="alert": screen readers announce the error as soon as it appears.
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
