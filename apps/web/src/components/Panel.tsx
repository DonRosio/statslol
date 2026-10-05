import type { ReactNode } from 'react';

import styles from './Panel.module.css';

/**
 * The panel that holds the content of a page: a rounded surface that lets the background show
 * through a little. What sits above it (the header of a profile, its tabs) has none.
 */
export function Panel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}
