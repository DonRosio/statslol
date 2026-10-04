import { useQuery } from '@tanstack/react-query';

import { healthQuery } from '../api/health.ts';
import styles from './ApiStatus.module.css';

const LABELS = {
  pending: 'Checking the API…',
  success: 'API up',
  error: 'API unreachable',
} as const;

/** Tells whether the API answers. Checked again when the visitor comes back to the tab. */
export function ApiStatus() {
  const { status } = useQuery(healthQuery);
  return (
    // role="status": screen readers announce the new text when it changes.
    <p className={styles.status} data-status={status} role="status">
      {LABELS[status]}
    </p>
  );
}
