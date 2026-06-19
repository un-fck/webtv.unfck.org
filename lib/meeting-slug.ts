/**
 * Conversion between UN document symbols and URL slugs.
 *
 *   S/PV.9748      ↔  sc/9748
 *   A/79/PV.21     ↔  ga/79/21
 *   A/ES-11/PV.23  ↔  ga/es11/23
 *   A/C.1/79/PV.7  ↔  ga/c1/79/7
 *   A/C.3/79/SR.5  ↔  ga/c3/79/5
 *   A/HRC/58/SR.59 ↔  hrc/58/59
 *   E/2024/SR.10   ↔  ecosoc/2024/10
 *
 * Multi-part recordings of the same meeting are addressed with a trailing
 * `/N` (e.g. `sc/9748/2`), where N is the chronological ordinal within the
 * symbol's cluster — see the `pv_part` column on `videos`. Part 1 has no
 * suffix.
 *
 * See docs/official-transcripts.md for which organs use PV vs SR.
 */

/**
 * Top-level path segments under `/{locale}/` that address a meeting page —
 * the citation prefixes from the slug grammar above, plus `asset` for the
 * Web TV-mirroring permalink form. Single source of truth, used by:
 *
 *   - proxy.ts (MEETING_PATH regex — decides where to append per-page
 *     .txt/.json Link headers)
 *   - components/site-footer.tsx (WIDE_SEGMENTS — decides which routes get
 *     the wider page layout, matching the meeting page itself)
 *
 * Add a prefix here whenever a new citation family is introduced.
 */
export const MEETING_URL_PREFIXES = [
  "sc",
  "ga",
  "hrc",
  "ecosoc",
  // Human rights treaty bodies
  "cat",
  "cerd",
  "ccpr",
  "cedaw",
  "crc",
  "crpd",
  "cescr",
  "cmw",
  "ced",
  "spt",
  // Daily press briefings
  "briefing",
  // Permalink form (mirrors webtv.un.org/{locale}/asset/{id})
  "asset",
] as const;

/**
 * Treaty-body symbol prefixes. The slug is `{acronym}/{n}` regardless of
 * which symbol family the body uses (most are `{ACRONYM}/C/SR.N`; CESCR
 * sits under ECOSOC as `E/C.12/SR.N`; SPT uses `CAT/OP/SR.N`).
 */
const TREATY_BODY_SYMBOL_TO_SLUG: Array<[RegExp, string]> = [
  [/^CAT\/C\/SR\.(\d+)$/, "cat"],
  [/^CERD\/C\/SR\.(\d+)$/, "cerd"],
  [/^CCPR\/C\/SR\.(\d+)$/, "ccpr"],
  [/^CEDAW\/C\/SR\.(\d+)$/, "cedaw"],
  [/^CRC\/C\/SR\.(\d+)$/, "crc"],
  [/^CRPD\/C\/SR\.(\d+)$/, "crpd"],
  [/^E\/C\.12\/SR\.(\d+)$/, "cescr"],
  [/^CMW\/C\/SR\.(\d+)$/, "cmw"],
  [/^CED\/C\/SR\.(\d+)$/, "ced"],
  [/^CAT\/OP\/SR\.(\d+)$/, "spt"],
];

const TREATY_BODY_SLUG_TO_SYMBOL: Record<string, string> = {
  cat: "CAT/C",
  cerd: "CERD/C",
  ccpr: "CCPR/C",
  cedaw: "CEDAW/C",
  crc: "CRC/C",
  crpd: "CRPD/C",
  cescr: "E/C.12",
  cmw: "CMW/C",
  ced: "CED/C",
  spt: "CAT/OP",
};

/** Derive a URL slug from a PV/SR document symbol. */
export function slugFromSymbol(symbol: string): string | null {
  // Security Council: S/PV.NNNN
  const sc = symbol.match(/^S\/PV\.(\d+)$/);
  if (sc) return `sc/${sc[1]}`;

  // GA Emergency Special Session: A/ES-NN/PV.NN
  const gaEs = symbol.match(/^A\/ES-(\d+)\/PV\.(\d+)$/);
  if (gaEs) return `ga/es${gaEs[1]}/${gaEs[2]}`;

  // GA Committee: A/C.N/NN/PV.NN or A/C.N/NN/SR.NN
  const gaCom = symbol.match(/^A\/C\.(\d)\/(\d+)\/(?:PV|SR)\.(\d+)$/);
  if (gaCom) return `ga/c${gaCom[1]}/${gaCom[2]}/${gaCom[3]}`;

  // GA Plenary: A/NN/PV.NN
  const ga = symbol.match(/^A\/(\d+)\/PV\.(\d+)$/);
  if (ga) return `ga/${ga[1]}/${ga[2]}`;

  // Human Rights Council: A/HRC/NN/SR.NN
  const hrc = symbol.match(/^A\/HRC\/(\d+)\/SR\.(\d+)$/);
  if (hrc) return `hrc/${hrc[1]}/${hrc[2]}`;

  // ECOSOC: E/YYYY/SR.NN
  const ecosoc = symbol.match(/^E\/(\d{4})\/SR\.(\d+)$/);
  if (ecosoc) return `ecosoc/${ecosoc[1]}/${ecosoc[2]}`;

  // Treaty bodies: {ACRONYM}/C/SR.N → {acronym}/N (CESCR / SPT exceptions
  // covered by the lookup).
  for (const [re, prefix] of TREATY_BODY_SYMBOL_TO_SLUG) {
    const m = symbol.match(re);
    if (m) return `${prefix}/${m[1]}`;
  }

  // Daily briefings: BRIEFING/{HOST}/{YYYY-MM-DD}
  const brief = symbol.match(/^BRIEFING\/(SG|PGA|GENEVA)\/(\d{4}-\d{2}-\d{2})$/);
  if (brief) return `briefing/${brief[1].toLowerCase()}/${brief[2]}`;

  return null;
}

export interface ParsedCitationSlug {
  /** The PV symbol (verbatim record). Always returned. */
  pvSymbol: string;
  /**
   * The SR (summary record) symbol where applicable — GA committees 2–6,
   * HRC, ECOSOC use SR rather than PV in their official record series.
   */
  srSymbol?: string;
  /** Chronological ordinal within the symbol's cluster; defaults to 1. */
  pvPart: number;
}

/**
 * Parse a citation slug back into a document symbol + part ordinal.
 *
 * Accepts an optional trailing `/N` (N ≥ 2) to address parts after the first.
 * Returns null for non-citation slugs (e.g. `asset/...`).
 */
export function symbolFromSlug(slug: string): ParsedCitationSlug | null {
  const segs = slug.split("/");

  // Optional trailing "/N" — only consumed when the prefix's canonical
  // segment count is exceeded by exactly one. Without this guard, /sc/10175
  // would be misread as prefix=sc + part=10175 instead of meeting 10175.
  let pvPart = 1;
  const canonical = canonicalSegmentCount(segs[0], segs[1]);
  if (
    canonical !== null &&
    segs.length === canonical + 1 &&
    /^\d+$/.test(segs[segs.length - 1])
  ) {
    pvPart = parseInt(segs[segs.length - 1], 10);
    segs.pop();
  }

  // sc/NNNN → S/PV.NNNN
  if (segs[0] === "sc" && segs.length === 2 && /^\d+$/.test(segs[1])) {
    return { pvSymbol: `S/PV.${segs[1]}`, pvPart };
  }

  // ga/esNN/NN → A/ES-NN/PV.NN
  if (
    segs[0] === "ga" &&
    segs.length === 3 &&
    /^es\d+$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    const esNum = segs[1].slice(2);
    return { pvSymbol: `A/ES-${esNum}/PV.${segs[2]}`, pvPart };
  }

  // ga/cN/NN/NN → A/C.N/NN/PV.NN or SR.NN
  if (
    segs[0] === "ga" &&
    segs.length === 4 &&
    /^c[1-6]$/.test(segs[1]) &&
    /^\d+$/.test(segs[2]) &&
    /^\d+$/.test(segs[3])
  ) {
    const comNum = segs[1].slice(1);
    if (comNum === "1") {
      return { pvSymbol: `A/C.1/${segs[2]}/PV.${segs[3]}`, pvPart };
    }
    return {
      pvSymbol: `A/C.${comNum}/${segs[2]}/PV.${segs[3]}`,
      srSymbol: `A/C.${comNum}/${segs[2]}/SR.${segs[3]}`,
      pvPart,
    };
  }

  // ga/NN/NN → A/NN/PV.NN
  if (
    segs[0] === "ga" &&
    segs.length === 3 &&
    /^\d+$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    return { pvSymbol: `A/${segs[1]}/PV.${segs[2]}`, pvPart };
  }

  // hrc/NN/NN → A/HRC/NN/SR.NN
  if (
    segs[0] === "hrc" &&
    segs.length === 3 &&
    /^\d+$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    return {
      pvSymbol: `A/HRC/${segs[1]}/PV.${segs[2]}`,
      srSymbol: `A/HRC/${segs[1]}/SR.${segs[2]}`,
      pvPart,
    };
  }

  // ecosoc/YYYY/NN → E/YYYY/SR.NN
  if (
    segs[0] === "ecosoc" &&
    segs.length === 3 &&
    /^\d{4}$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    return {
      pvSymbol: `E/${segs[1]}/PV.${segs[2]}`,
      srSymbol: `E/${segs[1]}/SR.${segs[2]}`,
      pvPart,
    };
  }

  // Treaty bodies: {acronym}/N → {symbol prefix}/SR.N
  if (segs.length === 2 && /^\d+$/.test(segs[1])) {
    const prefix = TREATY_BODY_SLUG_TO_SYMBOL[segs[0]];
    if (prefix) {
      return { pvSymbol: `${prefix}/SR.${segs[1]}`, pvPart };
    }
  }

  // Daily briefings: briefing/{sg|pga|geneva}/{YYYY-MM-DD}
  if (
    segs[0] === "briefing" &&
    segs.length === 3 &&
    /^(sg|pga|geneva)$/.test(segs[1]) &&
    /^\d{4}-\d{2}-\d{2}$/.test(segs[2])
  ) {
    return {
      pvSymbol: `BRIEFING/${segs[1].toUpperCase()}/${segs[2]}`,
      pvPart,
    };
  }

  return null;
}

/** Number of segments a citation slug of a given prefix has without `/N`. */
function canonicalSegmentCount(
  prefix: string,
  second: string | undefined,
): number | null {
  if (prefix === "sc") return 2;
  if (prefix === "ga" && second && /^es\d+$/.test(second)) return 3;
  if (prefix === "ga" && second && /^c[1-6]$/.test(second)) return 4;
  if (prefix === "ga") return 3;
  if (prefix === "hrc") return 3;
  if (prefix === "ecosoc") return 3;
  if (prefix in TREATY_BODY_SLUG_TO_SYMBOL) return 2;
  if (prefix === "briefing") return 3;
  return null;
}
