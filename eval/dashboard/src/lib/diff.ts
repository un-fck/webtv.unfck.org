/**
 * Sentence-aligned side-by-side diff with character-level highlighting.
 * Inspired by undifferent (github.com/UN-EOSG-Analytics/undifferent).
 */

export interface DiffToken {
  type: 'equal' | 'insert' | 'delete' | 'substitute';
  text: string;
  /** For substitute tokens: the old (reference) text */
  oldText?: string;
  /** True if the difference is only punctuation (letters are identical) */
  punctOnly?: boolean;
}

export interface AlignedRow {
  left: DiffToken[];
  right: DiffToken[];
  type: 'equal' | 'changed' | 'added' | 'removed';
}

/** Normalize Unicode for cleaner diffs */
function normalizeText(text: string): string {
  return text
    // Curly quotes → straight
    .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    // Em/en dashes → hyphen
    .replace(/[\u2013\u2014\u2015]/g, '-')
    // Non-breaking space, thin space, etc → regular space
    .replace(/[\u00A0\u2009\u200A\u202F]/g, ' ')
    // Ellipsis character → three dots
    .replace(/\u2026/g, '...')
    // Zero-width chars
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

/** Strip all non-alphanumeric characters for punctuation comparison */
function lettersOnly(text: string): string {
  return text.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF]/g, '').toLowerCase();
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

/** Word-level diff between two strings, with substitution and punctuation detection */
function wordDiff(ref: string, hyp: string): DiffToken[] {
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

  // Merge consecutive same-type tokens
  const merged: DiffToken[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else merged.push({ ...op });
  }

  // Convert adjacent delete+insert pairs into substitute tokens with punctuation detection
  const result: DiffToken[] = [];
  for (let k = 0; k < merged.length; k++) {
    const cur = merged[k];
    const next = merged[k + 1];
    if (cur.type === 'delete' && next?.type === 'insert') {
      const punctOnly = lettersOnly(cur.text) === lettersOnly(next.text);
      result.push({
        type: 'substitute',
        text: next.text,
        oldText: cur.text,
        punctOnly,
      });
      k++; // skip the insert
    } else {
      result.push(cur);
    }
  }
  return result;
}

const MATCH_THRESHOLD = 0.4;

/** Match hyp sentences to ref sentences greedily, returning ri→hi map */
function greedyMatch(refSents: string[], hypSents: string[]): Map<number, number> {
  const used = new Set<number>();
  const map = new Map<number, number>();
  for (let ri = 0; ri < refSents.length; ri++) {
    let bestHi = -1;
    let bestSim = MATCH_THRESHOLD;
    for (let hi = 0; hi < hypSents.length; hi++) {
      if (used.has(hi)) continue;
      const sim = similarity(refSents[ri].toLowerCase(), hypSents[hi].toLowerCase());
      if (sim > bestSim) { bestSim = sim; bestHi = hi; }
    }
    if (bestHi >= 0) { map.set(ri, bestHi); used.add(bestHi); }
  }
  return map;
}

/** Compute diff tokens for a hyp sentence against a ref sentence. */
function diffPair(refText: string, hypText: string): DiffToken[] {
  if (refText === hypText) return [{ type: 'equal', text: hypText }];
  return wordDiff(refText, hypText);
}

export interface AlignedRow3 {
  ref: string;          // plain ground truth text
  colA: DiffToken[];    // provider A tokens (diff-highlighted vs ref)
  colB: DiffToken[];    // provider B tokens (diff-highlighted vs ref)
}

/** Pair up two lists of orphan sentences by similarity, returning merged rows */
function pairOrphans(aSents: string[], bSents: string[]): AlignedRow3[] {
  const rows: AlignedRow3[] = [];
  const usedB = new Set<number>();

  for (const aText of aSents) {
    let bestBi = -1;
    let bestSim = MATCH_THRESHOLD;
    for (let bi = 0; bi < bSents.length; bi++) {
      if (usedB.has(bi)) continue;
      const sim = similarity(aText.toLowerCase(), bSents[bi].toLowerCase());
      if (sim > bestSim) { bestSim = sim; bestBi = bi; }
    }
    if (bestBi >= 0) {
      usedB.add(bestBi);
      rows.push({
        ref: '',
        colA: [{ type: 'insert', text: aText }],
        colB: [{ type: 'insert', text: bSents[bestBi] }],
      });
    } else {
      rows.push({ ref: '', colA: [{ type: 'insert', text: aText }], colB: [] });
    }
  }
  for (let bi = 0; bi < bSents.length; bi++) {
    if (!usedB.has(bi)) {
      rows.push({ ref: '', colA: [], colB: [{ type: 'insert', text: bSents[bi] }] });
    }
  }
  return rows;
}

/**
 * 3-column alignment: ground truth as anchor, two providers matched independently.
 * Each row has: GT sentence | provider A diff | provider B diff.
 * Unmatched A/B sentences that are similar to each other share a row.
 */
export function alignedDiff3(reference: string, hypA: string, hypB: string): AlignedRow3[] {
  // Normalize Unicode before all processing
  const normRef = normalizeText(reference);
  const normA = normalizeText(hypA);
  const normB = normalizeText(hypB);

  const refSents = splitSentences(normRef);
  const aSents = splitSentences(normA);
  const bSents = splitSentences(normB);

  const matchA = greedyMatch(refSents, aSents);
  const matchB = greedyMatch(refSents, bSents);
  const matchedA = new Set(matchA.values());
  const matchedB = new Set(matchB.values());

  const rows: AlignedRow3[] = [];
  let nextAi = 0;
  let nextBi = 0;

  for (let ri = 0; ri < refSents.length; ri++) {
    const ai = matchA.get(ri);
    const bi = matchB.get(ri);

    // Collect unmatched A sentences before this match
    const pendingA: string[] = [];
    if (ai !== undefined) {
      while (nextAi < ai) {
        if (!matchedA.has(nextAi)) pendingA.push(aSents[nextAi]);
        nextAi++;
      }
      nextAi = ai + 1;
    }

    // Collect unmatched B sentences before this match
    const pendingB: string[] = [];
    if (bi !== undefined) {
      while (nextBi < bi) {
        if (!matchedB.has(nextBi)) pendingB.push(bSents[nextBi]);
        nextBi++;
      }
      nextBi = bi + 1;
    }

    // Pair up similar orphans from A and B, then emit
    if (pendingA.length > 0 || pendingB.length > 0) {
      rows.push(...pairOrphans(pendingA, pendingB));
    }

    // Emit the ref row with matched provider diffs
    rows.push({
      ref: refSents[ri],
      colA: ai !== undefined ? diffPair(refSents[ri], aSents[ai]) : [],
      colB: bi !== undefined ? diffPair(refSents[ri], bSents[bi]) : [],
    });
  }

  // Remaining unmatched sentences after last ref
  const tailA: string[] = [];
  for (let i = nextAi; i < aSents.length; i++) {
    if (!matchedA.has(i)) tailA.push(aSents[i]);
  }
  const tailB: string[] = [];
  for (let i = nextBi; i < bSents.length; i++) {
    if (!matchedB.has(i)) tailB.push(bSents[i]);
  }
  if (tailA.length > 0 || tailB.length > 0) {
    rows.push(...pairOrphans(tailA, tailB));
  }

  return rows;
}
