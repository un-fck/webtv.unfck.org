/**
 * Provider configuration — reads STT provider and analysis model from env vars.
 *
 * Only imports the production Gemini provider to avoid pulling eval-only
 * providers (cohere, assemblyai, etc.) into the Next.js build.
 */
import type { TranscriptionProvider } from "./types";
import { geminiProduction } from "./gemini-production";

export { getAnalysisModel, getAnalysisModelMini, getAnalysisModelNano } from "./models";

const PRODUCTION_PROVIDERS: Record<string, TranscriptionProvider> = {
  gemini: geminiProduction,
};

export function getSTTProvider(): TranscriptionProvider {
  const name = process.env.STT_PROVIDER || "gemini";
  const provider = PRODUCTION_PROVIDERS[name];
  if (!provider)
    throw new Error(
      `Unknown STT provider: ${name}. Available in production: ${Object.keys(PRODUCTION_PROVIDERS).join(", ")}`,
    );
  return provider;
}
