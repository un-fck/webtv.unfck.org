import type { TranscriptionProvider } from "./types";
import { assemblyaiUniversal2, assemblyaiUniversal3Pro } from "./assemblyai";
import { azureOpenai } from "./azure-openai";
import { elevenlabs } from "./elevenlabs";
import { azureSpeech } from "./azure-speech";
import { googleChirp } from "./google-chirp";
import { gemini3Flash, gemini35Flash } from "./gemini";
import { groqWhisper } from "./groq-whisper";
import { alibabaQwen3Asr, alibabaQwen35Omni } from "./alibaba";
import { funAsr } from "./fun-asr";
import { deepgram } from "./deepgram";
import { mistral } from "./mistral";
import { voxtralSmall } from "./voxtral-small";
// `cohere` is intentionally NOT statically imported here. cohere.ts uses
// `path.join(os.tmpdir(), …)` and `child_process.execSync(ffmpeg)`, which
// Vercel's Node File Tracer treats as a dynamic require — it then traces the
// whole project as a transitive dependency of any route that imports the
// registry (e.g. /api/pv/align → lib/transcription → providers/config →
// registry). That blows up the deployment bundle. cohere isn't part of
// STT_ROUTING so removing the eager import has no production impact; if
// it needs to come back for eval, re-add it with a lazy `await import`.

// Registry keyed by each provider's `name` (the stable {vendor}-{model} identifier),
// so the key and the provider's own name can never drift apart.
const ALL: TranscriptionProvider[] = [
  gemini3Flash, // production default + multilingual floor
  gemini35Flash,
  assemblyaiUniversal2,
  assemblyaiUniversal3Pro,
  azureOpenai,
  alibabaQwen3Asr,
  alibabaQwen35Omni,
  funAsr,
  mistral,
  voxtralSmall,
  elevenlabs,
  azureSpeech,
  googleChirp,
  groqWhisper,
  deepgram,
];

const providers: Record<string, TranscriptionProvider> = Object.fromEntries(
  ALL.map((p) => [p.name, p]),
);

export function getProvider(name: string): TranscriptionProvider {
  const provider = providers[name];
  if (!provider)
    throw new Error(
      `Unknown provider: ${name}. Available: ${Object.keys(providers).join(", ")}`,
    );
  return provider;
}

export function getAllProviders(): TranscriptionProvider[] {
  return [...ALL];
}

export function getProviderNames(): string[] {
  return ALL.map((p) => p.name);
}
