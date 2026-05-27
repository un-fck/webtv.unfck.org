import type { TranscriptionProvider } from "./types";
import { assemblyai, assemblyaiU3Pro } from "./assemblyai";
import { azureOpenai } from "./azure-openai";
import { elevenlabs } from "./elevenlabs";
import { azureSpeech } from "./azure-speech";
import { googleChirp } from "./google-chirp";
import { gemini as geminiEval, gemini35Flash } from "./gemini";
import { geminiProduction } from "./gemini-production";
import { groqWhisper } from "./groq-whisper";
import { alibaba, alibabaOmni } from "./alibaba";
import { funAsr } from "./fun-asr";
import { deepgram } from "./deepgram";
import { mistral } from "./mistral";
import { voxtralSmall } from "./voxtral-small";
import { cohere } from "./cohere";

const providers: Record<string, TranscriptionProvider> = {
  // Production Gemini (rich output with named speakers) — default for main app
  gemini: geminiProduction,
  // Eval Gemini (simplified, for benchmarking only)
  "gemini-eval": geminiEval,
  "gemini-3.5-flash": gemini35Flash,
  assemblyai,
  "assemblyai-u3-pro": assemblyaiU3Pro,
  "azure-openai": azureOpenai,
  elevenlabs,
  "azure-speech": azureSpeech,
  "google-chirp": googleChirp,
  "groq-whisper": groqWhisper,
  alibaba,
  "qwen3.5-omni-plus": alibabaOmni,
  "fun-asr": funAsr,
  deepgram,
  mistral,
  "voxtral-small": voxtralSmall,
  cohere,
};

export function getProvider(name: string): TranscriptionProvider {
  const provider = providers[name];
  if (!provider)
    throw new Error(
      `Unknown provider: ${name}. Available: ${Object.keys(providers).join(", ")}`,
    );
  return provider;
}

export function getAllProviders(): TranscriptionProvider[] {
  return Object.values(providers);
}

export function getProviderNames(): string[] {
  return Object.keys(providers);
}
