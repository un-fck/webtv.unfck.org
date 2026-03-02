/**
 * Sentence-aligned side-by-side diff with character-level highlighting.
 * Inspired by undifferent (github.com/UN-EOSG-Analytics/undifferent).
 */

export interface DiffToken {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface AlignedRow {
  left: DiffToken[];
  right: DiffToken[];
  type: 'equal' | 'changed' | 'added' | 'removed';
}

/** Split text into sentences for alignment */
function splitSentences(text: string): string[] {
  // Normalize: strip PDF page headers, collapse newlines into spaces
  const normalized = text
    .replace(/\d{2}\/\d{2}\/\d{4}\s+[^\n]+S\/PV\.\d+\s*\n\d{2}-\d+\s+\d+\/\d+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Protect abbreviation periods from triggering sentence breaks
  const safe = normalized.replace(
    /\b(Mr|Ms|Mrs|Dr|St|Gen|Amb|Rev|Prof|Jr|Sr|Lt|Col|No|Vol|Inc|vs|etc|i\.e|e\.g)\. /gi,
    (_, abbr) => abbr + '\u00B7 '
  );
  return safe
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u00B7/g, '.').trim())
    .filter(s => s.length > 0);
}

/** Levenshtein distance (character-level) */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > 500 || b.length > 500) {
    return Math.abs(a.length - b.length) + (a === b ? 0 : Math.max(a.length, b.length) * 0.5);
  }
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? corner
        : 1 + Math.min(prev[j], prev[j - 1], corner);
      corner = temp;
    }
  }
  return prev[b.length];
}

/** Similarity ratio 0..1 (1 = identical) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Word-level diff between two strings, returning tokens for one side */
function charDiff(ref: string, hyp: string): DiffToken[] {
  const refWords = ref.split(/(\s+)/);
  const hypWords = hyp.split(/(\s+)/);

  if (refWords.length > 200 || hypWords.length > 200) {
    return [
      { type: 'delete', text: ref },
      { type: 'insert', text: hyp },
    ];
  }

  const m = refWords.length;
  const n = hypWords.length;
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      table[i][j] = refWords[i - 1] === hypWords[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }

  const ops: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refWords[i - 1] === hypWords[j - 1]) {
      ops.push({ type: 'equal', text: refWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      ops.push({ type: 'insert', text: hypWords[j - 1] });
      j--;
    } else {
      ops.push({ type: 'delete', text: refWords[i - 1] });
      i--;
    }
  }
  ops.reverse();

  const merged: DiffToken[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else merged.push({ ...op });
  }
  return merged;
}

const MATCH_THRESHOLD = 0.4;

/**
 * Align sentences from reference and hypothesis, producing side-by-side rows.
 */
export function alignedDiff(reference: string, hypothesis: string): AlignedRow[] {
  const refSents = splitSentences(reference);
  const hypSents = splitSentences(hypothesis);
  const rows: AlignedRow[] = [];
  const usedHyp = new Set<number>();
  const matchMap = new Map<number, number>(); // ri -> hi

  // Find best matches greedily
  for (let ri = 0; ri < refSents.length; ri++) {
    let bestHi = -1;
    let bestSim = MATCH_THRESHOLD;
    for (let hi = 0; hi < hypSents.length; hi++) {
      if (usedHyp.has(hi)) continue;
      const sim = similarity(refSents[ri].toLowerCase(), hypSents[hi].toLowerCase());
      if (sim > bestSim) { bestSim = sim; bestHi = hi; }
    }
    if (bestHi >= 0) {
      matchMap.set(ri, bestHi);
      usedHyp.add(bestHi);
    }
  }

  // Walk through in order, interleaving unmatched sentences
  let nextHi = 0;

  for (let ri = 0; ri < refSents.length; ri++) {
    const hi = matchMap.get(ri);

    if (hi !== undefined) {
      // Emit unmatched hyp sentences that come before this match
      while (nextHi < hi) {
        if (!usedHyp.has(nextHi) || !matchMap.has(ri)) {
          // This hyp sentence wasn't matched to anything
          if (!Array.from(matchMap.values()).includes(nextHi)) {
            rows.push({
              left: [],
              right: [{ type: 'insert', text: hypSents[nextHi] }],
              type: 'added',
            });
          }
        }
        nextHi++;
      }

      // Emit aligned pair
      const refText = refSents[ri];
      const hypText = hypSents[hi];
      if (refText === hypText) {
        rows.push({
          left: [{ type: 'equal', text: refText }],
          right: [{ type: 'equal', text: hypText }],
          type: 'equal',
        });
      } else {
        const tokens = charDiff(refText, hypText);
        rows.push({
          left: tokens.filter(t => t.type !== 'insert').map(t => ({
            type: t.type === 'delete' ? 'delete' as const : 'equal' as const,
            text: t.text,
          })),
          right: tokens.filter(t => t.type !== 'delete').map(t => ({
            type: t.type === 'insert' ? 'insert' as const : 'equal' as const,
            text: t.text,
          })),
          type: 'changed',
        });
      }
      nextHi = hi + 1;
    } else {
      // Unmatched reference sentence
      rows.push({
        left: [{ type: 'delete', text: refSents[ri] }],
        right: [],
        type: 'removed',
      });
    }
  }

  // Remaining unmatched hypothesis sentences
  for (let h = nextHi; h < hypSents.length; h++) {
    if (!usedHyp.has(h)) {
      rows.push({
        left: [],
        right: [{ type: 'insert', text: hypSents[h] }],
        type: 'added',
      });
    }
  }

  return rows;
}
