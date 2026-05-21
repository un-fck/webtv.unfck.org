/**
 * Provider configuration — reads STT provider and analysis model from env vars.
 */
import type { TranscriptionProvider } from "./types";
import { getProvider } from "./registry";

export {
  getAnalysisModel,
  getAnalysisModelMini,
  getAnalysisModelNano,
} from "./models";

export function getSTTProvider(): TranscriptionProvider {
  const name = process.env.STT_PROVIDER || "gemini";
  return getProvider(name);
}
