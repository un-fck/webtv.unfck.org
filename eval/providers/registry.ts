import type { TranscriptionProvider } from "./types";
import { assemblyai } from "./assemblyai";
import { azureOpenai } from "./azure-openai";
import { elevenlabs } from "./elevenlabs";
import { azureSpeech } from "./azure-speech";
import { googleChirp } from "./google-chirp";
import { gemini } from "./gemini";
import { groqWhisper } from "./groq-whisper";
import { alibaba } from "./alibaba";
import { deepgram } from "./deepgram";
import { mistral } from "./mistral";
const providers: Record<string, TranscriptionProvider> = {
  assemblyai,
  "azure-openai": azureOpenai,
  elevenlabs,
  "azure-speech": azureSpeech,
  "google-chirp": googleChirp,
  gemini,
  "groq-whisper": groqWhisper,
  alibaba,
  deepgram,
  mistral,
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
