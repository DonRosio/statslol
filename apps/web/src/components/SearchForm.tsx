import { DEFAULT_REGION, regionSchema, type Region } from '@statslol/shared';
import { useId, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';

import { playerPath } from '../player-path.ts';
import { REGION_NAMES } from '../regions.ts';
import { parseRiotIdInput } from '../riot-id-input.ts';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  /** Text of the field at first, e.g. a Riot ID to correct. Empty by default. */
  readonly initialRiotId?: string;
  /** Region selected at first. EUW by default. */
  readonly initialRegion?: Region;
}

/** Looks up a player: region + Riot ID, then opens their profile page. */
export function SearchForm({
  initialRiotId = '',
  initialRegion = DEFAULT_REGION,
}: SearchFormProps) {
  const navigate = useNavigate();
  const [riotId, setRiotId] = useState(initialRiotId);
  const [region, setRegion] = useState<Region>(initialRegion);
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
    void navigate(playerPath({ region, name: gameName, tag: tagLine }));
  }

  return (
    <form className={styles.form} role="search" onSubmit={handleSubmit}>
      <label htmlFor={regionFieldId} className="visually-hidden">
        Region
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
            {code.toUpperCase()} – {REGION_NAMES[code]}
          </option>
        ))}
      </select>
      <label htmlFor={riotIdFieldId} className="visually-hidden">
        Riot ID
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
      <button type="submit">Search</button>
      {error !== null && (
        // role="alert": screen readers announce the error as soon as it appears.
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
