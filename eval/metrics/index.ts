import { computeWER, type WERResult } from "./wer";
import { normalizeForWER } from "./text-normalizer";

export interface EvalMetrics {
  wer: WERResult;
  normalizedWer: WERResult;
}

/** Compute WER on both raw and normalized text */
export function computeMetrics(
  reference: string,
  hypothesis: string,
  language = "en",
): EvalMetrics {
  const wer = computeWER(reference, hypothesis);
  const normalizedWer = computeWER(
    normalizeForWER(reference, language),
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
