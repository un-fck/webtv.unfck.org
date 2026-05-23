// Pure, dependency-free helpers for speaker-directory URL keys. Kept separate
// from `lib/speaker-index.ts` (which imports the DB layer / `pg`) so client
// components can import these without dragging Node-only modules into the
// browser bundle.

/** URL-safe key for an entity, e.g. `country:CHN`, `group:G77 + China`. */
export function encodeEntityKey(key: string): string {
  return encodeURIComponent(key);
}

export function decodeEntityKey(segment: string): string {
  return decodeURIComponent(segment);
}
