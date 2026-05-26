// Pure, dependency-free helpers for speaker-directory URL slugs. Kept separate
// from `lib/speaker-index.ts` (which imports the DB layer / `pg`) so client
// components can import these without dragging Node-only modules into the
// browser bundle.

/**
 * Turn an entity label or person name into a clean URL slug.
 *
 * Lowercase, strip accents (NFKD), collapse any run of non-alphanumerics into a
 * single hyphen, trim leading/trailing hyphens. Casing / accent / punctuation
 * variants of the same name collapse to the same slug on purpose — the speaker
 * index merges entities that share a slug into one profile.
 *
 * Examples: "OCHA" → "ocha", "Tom Fletcher" → "tom-fletcher",
 * "China" → "china", "G77 + China" → "g77-china",
 * "António Guterres" → "antonio-guterres".
 */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
