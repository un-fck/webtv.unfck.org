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
 * Reads STT_ANALYSIS_MODEL env var, defaults to "gpt-5".
 */
export function getAnalysisModel(): string {
  return process.env.STT_ANALYSIS_MODEL || "gpt-5";
}

/**
 * Get the mini analysis model name (for sentence tagging, normalization).
 * Reads STT_ANALYSIS_MODEL_MINI env var, defaults to "gpt-5-mini".
 */
export function getAnalysisModelMini(): string {
  return process.env.STT_ANALYSIS_MODEL_MINI || "gpt-5-mini";
}
