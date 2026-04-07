import type { TranscriptionProvider } from "./types";
import { assemblyai } from "./assemblyai";
import { azureOpenai } from "./azure-openai";
import { elevenlabs } from "./elevenlabs";
import { azureSpeech } from "./azure-speech";
import { googleChirp } from "./google-chirp";
import { gemini as geminiEval } from "./gemini";
import { geminiProduction } from "./gemini-production";
import { groqWhisper } from "./groq-whisper";
import { alibaba } from "./alibaba";
import { deepgram } from "./deepgram";
import { mistral } from "./mistral";
import { cohere } from "./cohere";

const providers: Record<string, TranscriptionProvider> = {
  // Production Gemini (rich output with named speakers) — default for main app
  gemini: geminiProduction,
  // Eval Gemini (simplified, for benchmarking only)
  "gemini-eval": geminiEval,
  assemblyai,
  "azure-openai": azureOpenai,
  elevenlabs,
  "azure-speech": azureSpeech,
  "google-chirp": googleChirp,
  "groq-whisper": groqWhisper,
  alibaba,
  deepgram,
  mistral,
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
