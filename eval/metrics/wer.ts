export interface WERResult {
  wer: number;
  cer: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  refLength: number;
  hypLength: number;
}

/** Compute edit distance counts between two string arrays */
function editDistance(ref: string[], hyp: string[]) {
  const n = ref.length;
  const m = hyp.length;

  // dp[j] = [cost, sub, ins, del]
  let prev = Array.from({ length: m + 1 }, (_, j) => [j, 0, j, 0]);
  prev[0] = [0, 0, 0, 0];

  for (let i = 1; i <= n; i++) {
    const curr: number[][] = [[i, 0, 0, i]];
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1][0] + (ref[i - 1] !== hyp[j - 1] ? 1 : 0);
      const del = prev[j][0] + 1;
      const ins = curr[j - 1][0] + 1;
      const min = Math.min(sub, del, ins);

      if (min === sub) {
        const isSub = ref[i - 1] !== hyp[j - 1] ? 1 : 0;
        curr.push([
          sub,
          prev[j - 1][1] + isSub,
          prev[j - 1][2],
          prev[j - 1][3],
        ]);
      } else if (min === del) {
        curr.push([del, prev[j][1], prev[j][2], prev[j][3] + 1]);
      } else {
        curr.push([ins, curr[j - 1][1], curr[j - 1][2] + 1, curr[j - 1][3]]);
      }
    }
    prev = curr;
  }

  const [, substitutions, insertions, deletions] = prev[m];
  return { substitutions, insertions, deletions };
}

const MAX_WORDS = 3_000;
const MAX_CHARS = 10_000;

/**
 * Compute edit distance on long arrays by splitting into chunks,
 * computing each chunk's edit distance, and summing the results.
 * This is an approximation but avoids O(n*m) blowup on huge inputs.
 */
function chunkedEditDistance(ref: string[], hyp: string[], maxLen: number) {
  if (ref.length <= maxLen && hyp.length <= maxLen) {
    return editDistance(ref, hyp);
  }

  // Split both into proportional chunks
  const numChunks = Math.ceil(Math.max(ref.length, hyp.length) / maxLen);
  const refChunkSize = Math.ceil(ref.length / numChunks);
  const hypChunkSize = Math.ceil(hyp.length / numChunks);

  let totalSub = 0, totalIns = 0, totalDel = 0;
  for (let i = 0; i < numChunks; i++) {
    const refChunk = ref.slice(i * refChunkSize, (i + 1) * refChunkSize);
    const hypChunk = hyp.slice(i * hypChunkSize, (i + 1) * hypChunkSize);
    const { substitutions, insertions, deletions } = editDistance(refChunk, hypChunk);
    totalSub += substitutions;
    totalIns += insertions;
    totalDel += deletions;
  }

  return { substitutions: totalSub, insertions: totalIns, deletions: totalDel };
}

/** Compute WER and CER between reference and hypothesis text */
export function computeWER(reference: string, hypothesis: string): WERResult {
  const refWords = reference.split(/\s+/).filter(Boolean);
  const hypWords = hypothesis.split(/\s+/).filter(Boolean);

  const { substitutions, insertions, deletions } = chunkedEditDistance(
    refWords,
    hypWords,
    MAX_WORDS,
  );
  const wer =
    refWords.length === 0
      ? hypWords.length === 0
        ? 0
        : 1
      : (substitutions + insertions + deletions) / refWords.length;

  // CER
  const refChars = [...reference.replace(/\s+/g, "")];
  const hypChars = [...hypothesis.replace(/\s+/g, "")];
  const charEdit = chunkedEditDistance(refChars, hypChars, MAX_CHARS);
  const cer =
    refChars.length === 0
      ? hypChars.length === 0
        ? 0
        : 1
      : (charEdit.substitutions + charEdit.insertions + charEdit.deletions) /
        refChars.length;

  return {
    wer,
    cer,
    substitutions,
    insertions,
    deletions,
    refLength: refWords.length,
    hypLength: hypWords.length,
  };
}
