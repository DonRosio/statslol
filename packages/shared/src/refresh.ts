/**
 * Shortest delay between two updates of a player (the "Update" button), whoever asks: each
 * update costs calls to Riot. The API enforces it; the web app counts it down.
 */
export const REFRESH_COOLDOWN_SECONDS = 120;
