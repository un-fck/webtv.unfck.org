/**
 * Query parsing + snippet building for full-text search inside transcripts.
 *
 * Pure functions only (no DB imports) — shared between the SQL builder in
 * lib/db.ts and the client components that highlight matches.
 *
 * Routing rule (see eval/analysis + migration 026): a term that contains a
 * digit ("2735", "L.73", "S/2026/243") is a document-symbol-shaped term and
 * goes through trigram containment — Postgres FTS keeps such symbols as
 * single compound tokens ('a/80/l.73'), so a fragment query like "L.73" can
 * never token-match them, and STT garbles symbol prefixes ("A/AT/L.73")
 * which only containment on the distinctive tail survives. Everything else
 * goes through websearch_to_tsquery (stemming, stopwords, quoted phrases).
 * Chinese has no word boundaries for FTS to use, so for zh every term routes
 * to containment.
 */

export interface ParsedSearchQuery {
  /** Digit-bearing terms (and digit-bearing quoted phrases) → containment. */
  symbolTerms: string[];
  /** Remaining query text (words + quoted phrases) → websearch FTS. */
  wordQuery: string;
  /** Every term, for client-side highlighting. */
  highlightTerms: string[];
}

/** Tokenize on whitespace, keeping "quoted phrases" together. */
function tokenize(query: string): Array<{ text: string; quoted: boolean }> {
  const tokens: Array<{ text: string; quoted: boolean }> = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    if (m[1] !== undefined) {
      const t = m[1].trim();
      if (t) tokens.push({ text: t, quoted: true });
    } else if (m[2]) {
      tokens.push({ text: m[2], quoted: false });
    }
  }
  return tokens;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tokens = tokenize(query.trim());
  const symbolTerms: string[] = [];
  const wordParts: string[] = [];
  const highlightTerms: string[] = [];

  for (const tok of tokens) {
    // UN citations decorate resolution numbers with a parenthesized adoption
    // year — "resolution 2735 (2024)" — which speakers don't say and STT
    // doesn't write. Drop standalone "(2024)" tokens and strip the suffix
    // from "2735(2024)" so pasting the official cite matches the spoken form.
    if (/^\(\d{4}\)$/.test(tok.text)) continue;
    if (/\d/.test(tok.text)) {
      const term = tok.text.replace(/\(\d{4}\)$/, "");
      if (!term) continue;
      symbolTerms.push(term);
      highlightTerms.push(term);
    } else {
      // Preserve websearch syntax verbatim (quotes, OR, -exclusion).
      wordParts.push(tok.quoted ? `"${tok.text}"` : tok.text);
      // OR / - operators aren't display terms.
      if (tok.text !== "OR" && !tok.text.startsWith("-")) {
        highlightTerms.push(tok.text.replace(/^"|"$/g, ""));
      }
    }
  }

  return {
    symbolTerms,
    wordQuery: wordParts.join(" "),
    highlightTerms,
  };
}

/** True when the parsed query has nothing searchable. */
export function isEmptyQuery(parsed: ParsedSearchQuery): boolean {
  return parsed.symbolTerms.length === 0 && parsed.wordQuery.trim() === "";
}

const REGEX_META = /[\\^$.|?*+()[\]{}]/g;

function escapeRegex(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

/**
 * Postgres `~*` pattern for one symbol term: escaped literal, word-anchored
 * where the term edge is alphanumeric ("2735" must not match "12735";
 * "L.73" still matches inside "A/80/L.73" because "/" is a non-word char).
 */
export function symbolTermToPgRegex(term: string): string {
  const start = /^[\p{L}\p{N}]/u.test(term) ? "\\m" : "";
  const end = /[\p{L}\p{N}]$/u.test(term) ? "\\M" : "";
  return `${start}${escapeRegex(term)}${end}`;
}

/** regconfig for a transcript language; null → no usable FTS (route all
 *  terms to containment). Must mirror the generated column in migration 026. */
export function ftsConfigForLanguage(language: string): string | null {
  switch (language) {
    case "en":
      return "english";
    case "fr":
      return "french";
    case "es":
      return "spanish";
    case "ru":
      return "russian";
    case "ar":
      return "arabic";
    case "zh":
      return null; // unsegmented CJK — FTS tokens are whole clauses
    default:
      return "simple"; // floor and anything unexpected
  }
}

/**
 * SQL conditions over one row of webtv.transcript_statements (alias `s`),
 * with `?` placeholders in reading order. Returns null when the query has
 * no searchable content.
 */
export function buildStatementConditions(
  parsed: ParsedSearchQuery,
  language: string,
): { conditions: string[]; args: unknown[] } | null {
  if (isEmptyQuery(parsed)) return null;

  const config = ftsConfigForLanguage(language);
  const conditions: string[] = [];
  const args: unknown[] = [];

  let symbolTerms = parsed.symbolTerms;
  let wordQuery = parsed.wordQuery.trim();

  if (config === null && wordQuery) {
    // No FTS for this language: treat every word token as a containment term.
    symbolTerms = [
      ...symbolTerms,
      ...wordQuery
        .split(/\s+/)
        .map((w) => w.replace(/^"|"$/g, ""))
        .filter((w) => w && w !== "OR" && !w.startsWith("-")),
    ];
    wordQuery = "";
  }

  if (wordQuery) {
    conditions.push("s.tsv @@ websearch_to_tsquery(?::regconfig, ?)");
    args.push(config, wordQuery);
  }
  for (const term of symbolTerms) {
    conditions.push("s.text ~* ?");
    args.push(symbolTermToPgRegex(term));
  }

  return conditions.length > 0 ? { conditions, args } : null;
}

// ── Snippets ─────────────────────────────────────────────────────────────────

export interface SnippetPart {
  text: string;
  mark: boolean;
}

/** Case-insensitive matcher over all highlight terms (longest first so
 *  "S/2026/243" wins over "243"). Word-anchors digit-edge terms like the SQL
 *  side. Returns null when there is nothing to highlight. */
function highlightRegex(terms: string[]): RegExp | null {
  const parts = [...terms]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => {
      const start = /^[\p{L}\p{N}]/u.test(t) ? "(?<![\\p{L}\\p{N}])" : "";
      const end = /[\p{L}\p{N}]$/u.test(t) ? "(?![\\p{L}\\p{N}])" : "";
      return `${start}${escapeRegex(t)}${end}`;
    });
  if (parts.length === 0) return null;
  return new RegExp(parts.join("|"), "giu");
}

/**
 * Cut a window of `text` around the first term occurrence. Runs SERVER-side
 * over the full statement text (a client-side window over pre-truncated text
 * silently loses matches beyond the truncation point). Falls back to the
 * text head when no exact term occurs (e.g. only a stemmed FTS variant
 * matched — the row is still a genuine match).
 */
export function windowText(
  text: string,
  highlightTerms: string[],
  windowChars = 240,
): { text: string; leading: boolean; trailing: boolean } {
  const re = highlightRegex(highlightTerms);
  const first = re ? re.exec(text) : null;

  let start = 0;
  if (first && first.index > windowChars / 2) {
    start = first.index - Math.floor(windowChars / 2);
    // Snap forward to a word boundary so the snippet doesn't open mid-word.
    const nextSpace = text.indexOf(" ", start);
    if (nextSpace !== -1 && nextSpace < first.index) start = nextSpace + 1;
  }
  let end = Math.min(text.length, start + windowChars);
  if (end < text.length) {
    const lastSpace = text.lastIndexOf(" ", end);
    if (lastSpace > start + windowChars / 2) end = lastSpace;
  }

  return {
    text: text.slice(start, end),
    leading: start > 0,
    trailing: end < text.length,
  };
}

/** Split (already-windowed) text into mark/no-mark parts for rendering. */
export function markParts(
  text: string,
  highlightTerms: string[],
): SnippetPart[] {
  const re = highlightRegex(highlightTerms);
  if (!re) return [{ text, mark: false }];

  const parts: SnippetPart[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor)
      parts.push({ text: text.slice(cursor, m.index), mark: false });
    parts.push({ text: m[0], mark: true });
    cursor = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // safety against empty matches
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mark: false });
  return parts;
}

/** windowText + markParts in one call (tests / single-consumer paths). */
export function buildSnippet(
  text: string,
  highlightTerms: string[],
  windowChars = 240,
): { parts: SnippetPart[]; leading: boolean; trailing: boolean } {
  const w = windowText(text, highlightTerms, windowChars);
  return {
    parts: markParts(w.text, highlightTerms),
    leading: w.leading,
    trailing: w.trailing,
  };
}
