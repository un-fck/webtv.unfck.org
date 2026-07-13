import type { TranscriptionProvider } from "./types";
import {
  assemblyaiUniversal2,
  assemblyaiUniversal3Pro,
  assemblyaiUniversal35Pro,
} from "./assemblyai";
import { azureOpenai } from "./azure-openai";
import { elevenlabs, elevenlabsTuned } from "./elevenlabs";
import { azureSpeech } from "./azure-speech";
import { azureLlmSpeech } from "./azure-llm-speech";
import { sonioxV5 } from "./soniox";
import { speechmaticsMelia } from "./speechmatics";
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
  gemini3Flash, // routing fallback (floor moved to Melia 2026-07-10)
  gemini35Flash,
  assemblyaiUniversal35Pro, // production English
  assemblyaiUniversal2,
  assemblyaiUniversal3Pro,
  azureOpenai,
  alibabaQwen3Asr,
  alibabaQwen35Omni,
  funAsr,
  mistral,
  voxtralSmall,
  elevenlabs,
  elevenlabsTuned, // floor bake-off arm: diarization_threshold/num_speakers
  sonioxV5, // floor bake-off arm (SYNTHESIS §13)
  speechmaticsMelia, // production floor since 2026-07-10 (SYNTHESIS §13)
  azureLlmSpeech, // floor bake-off arm (SYNTHESIS §13)
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
