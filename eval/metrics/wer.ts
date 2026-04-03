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

/** Compute WER and CER between reference and hypothesis text */
export function computeWER(reference: string, hypothesis: string): WERResult {
  const refWords = reference.split(/\s+/).filter(Boolean);
  const hypWords = hypothesis.split(/\s+/).filter(Boolean);

  const { substitutions, insertions, deletions } = editDistance(
    refWords,
    hypWords,
  );
  const wer =
    refWords.length === 0
      ? hypWords.length === 0
        ? 0
        : 1
      : (substitutions + insertions + deletions) / refWords.length;

  // CER — skip for very long texts (DP is O(n*m) on characters)
  const refChars = [...reference.replace(/\s+/g, "")];
  const hypChars = [...hypothesis.replace(/\s+/g, "")];
  const MAX_CER_CHARS = 30_000;
  let cer: number;
  if (refChars.length > MAX_CER_CHARS || hypChars.length > MAX_CER_CHARS) {
    // Sample-based CER: compute on first N chars as an approximation
    const sRef = refChars.slice(0, MAX_CER_CHARS);
    const sHyp = hypChars.slice(0, MAX_CER_CHARS);
    const charEdit = editDistance(sRef, sHyp);
    cer =
      sRef.length === 0
        ? sHyp.length === 0
          ? 0
          : 1
        : (charEdit.substitutions + charEdit.insertions + charEdit.deletions) /
          sRef.length;
  } else {
    const charEdit = editDistance(refChars, hypChars);
    cer =
      refChars.length === 0
        ? hypChars.length === 0
          ? 0
          : 1
        : (charEdit.substitutions + charEdit.insertions + charEdit.deletions) /
          refChars.length;
  }

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
