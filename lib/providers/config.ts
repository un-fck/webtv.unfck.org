/**
 * STT provider configuration — the single source of truth for which provider
 * transcribes each language, plus analysis-model env wiring.
 *
 * Routing was chosen from the manual provider eval (eval/analysis/out/SYNTHESIS.md).
 * The About/Methodology page renders this map with human-readable names.
 */
import type { TranscriptionProvider } from "./types";
import { getProvider } from "./registry";

export {
  getAnalysisModel,
  getAnalysisModelMini,
  getAnalysisModelNano,
} from "./models";

/**
 * Language (BCP-47 code or 'floor') → provider registry key.
 * THE place to change which model transcribes which language.
 */
export const STT_ROUTING: Record<string, string> = {
  floor: "gemini-3-flash", // multilingual original audio
  en: "assemblyai-universal-3-5-pro",
  fr: "azure-gpt-4o-transcribe",
  es: "azure-gpt-4o-transcribe",
  ar: "azure-gpt-4o-transcribe",
  ru: "azure-gpt-4o-transcribe",
  zh: "alibaba-fun-asr",
};

/** Fallback for languages not in STT_ROUTING. */
export const STT_DEFAULT_PROVIDER = "gemini-3-flash";

/** Select the STT provider for a given language track. */
export function getSTTProvider(language?: string): TranscriptionProvider {
  const key = (language && STT_ROUTING[language]) || STT_DEFAULT_PROVIDER;
  return getProvider(key);
}
