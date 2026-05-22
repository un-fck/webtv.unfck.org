/**
 * Detect UN document references (resolutions, document symbols) in PV text and
 * resolve them to undocs.org URLs. Pure matching logic, extracted from
 * pv-panel.tsx so it can be unit-tested without rendering; the component keeps
 * the thin JSX that turns these matches into links.
 */

export interface ReferenceMatch {
  start: number;
  end: number;
  url: string;
  label: string;
}

const REFERENCE_PATTERNS: Array<{
  regex: RegExp;
  url: (match: string, g1: string, g2: string) => string;
}> = [
  // Resolution references: "resolution 2231 (2015)" → S/RES/2231(2015)
  {
    regex: /resolution\s+(\d+)\s*\((\d{4})\)/gi,
    url: (_match, num, year) => `https://undocs.org/S/RES/${num}(${year})`,
  },
  // Document symbols: S/PV.10124, A/RES/79/1, S/2026/8, A/79/L.1, E/2024/SR.10, A/C.1/79/PV.7, A/ES-11/PV.23
  {
    regex:
      /\b([SAEC]\/(?:[\w.-]+\/)*[\w.-]+\.\d+|[SAEC]\/(?:[\w.-]+\/)*\d+(?:\/[\w.-]+)*)\b/g,
    url: (match) => `https://undocs.org/${match}`,
  },
];

/**
 * Find all non-overlapping reference matches in `text`, sorted by position.
 * Overlaps are resolved by keeping the earlier (and, on ties, longer) match.
 */
export function findReferences(text: string): ReferenceMatch[] {
  const allMatches: ReferenceMatch[] = [];

  for (const pattern of REFERENCE_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((m = re.exec(text)) !== null) {
      allMatches.push({
        start: m.index,
        end: m.index + m[0].length,
        url: pattern.url(m[0], m[1], m[2]),
        label: m[0],
      });
    }
  }

  if (allMatches.length === 0) return [];

  // Sort by position, then remove overlaps (keep earlier/longer).
  allMatches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: ReferenceMatch[] = [];
  let lastEnd = 0;
  for (const m of allMatches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  return filtered;
}
