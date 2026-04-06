import { computeWER, type WERResult } from "./wer";
import { normalizeForWER } from "./text-normalizer";
import { normalizeGroundTruth } from "./ground-truth-normalizer";

export interface EvalMetrics {
  wer: WERResult;
  normalizedWer: WERResult;
}

/**
 * Compute WER on both raw and normalized text.
 * Ground truth is first cleaned of non-spoken content (speaker labels,
 * page headers, vote roll calls, boilerplate) before comparison.
 */
export function computeMetrics(
  reference: string,
  hypothesis: string,
  language = "en",
): EvalMetrics {
  const cleanRef = normalizeGroundTruth(reference, language);
  const wer = computeWER(cleanRef, hypothesis);
  const normalizedWer = computeWER(
    normalizeForWER(cleanRef, language),
    normalizeForWER(hypothesis, language),
  );
  return { wer, normalizedWer };
}

/** Compute pairwise WER between two provider outputs (no ground truth needed) */
export function computePairwiseMetrics(
  textA: string,
  textB: string,
  language = "en",
): EvalMetrics {
  return computeMetrics(textA, textB, language);
}

export { computeWER, type WERResult } from "./wer";
export { normalizeForWER } from "./text-normalizer";
