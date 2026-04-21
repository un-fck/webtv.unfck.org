/**
 * Provider configuration — reads STT provider and analysis model from env vars.
 */
import type { TranscriptionProvider } from "./types";
import { getProvider } from "./registry";

/**
 * Get the STT provider for transcription.
 * Reads STT_PROVIDER env var, defaults to "gemini" (production wrapper).
 */
export function getSTTProvider(): TranscriptionProvider {
  const name = process.env.STT_PROVIDER || "gemini";
  return getProvider(name);
}

/**
 * Get the analysis model name (for speaker ID, topics, propositions).
 * Reads STT_ANALYSIS_MODEL env var, defaults to "gpt-5.4".
 */
export function getAnalysisModel(): string {
  return process.env.STT_ANALYSIS_MODEL || "gpt-5.4";
}

/**
 * Get the mini analysis model name (for normalization).
 * Reads STT_ANALYSIS_MODEL_MINI env var, defaults to "gpt-5.4-mini".
 */
export function getAnalysisModelMini(): string {
  return process.env.STT_ANALYSIS_MODEL_MINI || "gpt-5.4-mini";
}

/**
 * Get the nano analysis model name (for sentence tagging).
 * Reads STT_ANALYSIS_MODEL_NANO env var, defaults to "gpt-5.4-nano".
 */
export function getAnalysisModelNano(): string {
  return process.env.STT_ANALYSIS_MODEL_NANO || "gpt-5.4-nano";
}
