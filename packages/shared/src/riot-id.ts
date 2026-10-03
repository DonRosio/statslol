/** A player's public identifier, displayed as `gameName#tagLine`. */
export interface RiotId {
  readonly gameName: string;
  readonly tagLine: string;
}

export function formatRiotId({ gameName, tagLine }: RiotId): string {
  return `${gameName}#${tagLine}`;
}
