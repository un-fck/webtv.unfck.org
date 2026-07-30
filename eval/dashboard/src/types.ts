export interface Result {
  symbol: string;
  assetId: string;
  language: string;
  provider: string;
  wer: number;
  normalizedWer: number;
  cer: number;
  normalizedCer: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  refLength: number;
  hypLength: number;
  durationMs: number;
  timestamp: string;
  /**
   * Omission (see eval/metrics/omission.ts): seconds of speech energy in the
   * audio with no transcript word over it. Optional — absent means NOT MEASURED,
   * which is distinct from 0. Rows scored before 2026-07-30 have no value, so
   * any aggregate must filter on presence rather than default to 0, and this is
   * why omission is not yet a MetricKey chip in the leaderboard.
   */
  droppedSpeechSeconds?: number;
  droppedSpeechRatio?: number;
  worstOmissionSeconds?: number;
  omissionHoles?: number;
}

export interface DashboardData {
  results: Result[];
  sessions: Record<string, { notes: string; assetId?: string }>;
  groundTruth: Record<string, Record<string, string>>;
  transcriptions: Record<string, Record<string, Record<string, string>>>;
  generatedAt: string;
}

export type MetricKey = "wer" | "normalizedWer" | "cer" | "normalizedCer";

export const METRIC_LABELS: Record<MetricKey, string> = {
  wer: "WER",
  normalizedWer: "Normalized WER",
  cer: "CER",
  normalizedCer: "Normalized CER",
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese",
  ru: "Russian",
};

export const PROVIDER_COLORS: Record<string, string> = {
  assemblyai: "#4F46E5",
  "azure-openai": "#059669",
  elevenlabs: "#06B6D4",
  "azure-speech": "#DC2626",
  "google-chirp": "#4285F4",
  gemini: "#886FBF",
  "groq-whisper": "#F55036",
  alibaba: "#FF6A00",
  deepgram: "#13EF93",
  mistral: "#D97706",
};

export const PROVIDER_LABELS: Record<string, string> = {
  assemblyai: "AssemblyAI",
  "azure-openai": "OpenAI",
  elevenlabs: "ElevenLabs",
  "azure-speech": "Azure Speech",
  "google-chirp": "Google Chirp",
  gemini: "Gemini",
  "groq-whisper": "Whisper",
  alibaba: "Alibaba",
  deepgram: "Deepgram",
  mistral: "Mistral",
};

export const PROVIDER_FULL_LABELS: Record<string, string> = {
  assemblyai: "AssemblyAI Universal-2",
  "azure-openai": "OpenAI GPT-4o Transcribe Diarize",
  elevenlabs: "ElevenLabs Scribe v2",
  "azure-speech": "Azure Cognitive Services Batch",
  "google-chirp": "Google Cloud Chirp 3",
  gemini: "Google Gemini 3 Flash Preview",
  "groq-whisper": "OpenAI Whisper large-v3 (via Groq)",
  alibaba: "Alibaba Qwen3-ASR-Flash",
  deepgram: "Deepgram Nova-3",
  mistral: "Mistral Voxtral Mini Transcribe",
};

export interface ProviderMeta {
  pricing: string;
  diarization: boolean;
  prompting: boolean;
}

// Pricing reflects batch / pre-recorded list rates as of May 2026 (matches how
// the eval runs). gemini and assemblyai are grounded in this project's own
// usage data: gemini ≈ $0.03/hr from measured throughput (~94k input + ~28k
// output tokens/audio-hour at the gemini-3-flash-preview rate card in
// lib/config.ts, $0.15/$0.60 per 1M); assemblyai = the $0.15/hr base rate the
// pipeline actually bills. alibaba is token-priced: $0.000035/sec × 3600 ≈
// $0.13/hr. Remaining providers use published batch list prices.
export const PROVIDER_META: Record<string, ProviderMeta> = {
  assemblyai: { pricing: "$0.15/hr", diarization: true, prompting: false },
  "azure-openai": { pricing: "$0.36/hr", diarization: true, prompting: false },
  elevenlabs: { pricing: "$0.40/hr", diarization: true, prompting: false },
  "azure-speech": { pricing: "$0.18/hr", diarization: true, prompting: false },
  "google-chirp": {
    pricing: "$0.24/hr",
    diarization: true,
    prompting: false,
  },
  gemini: { pricing: "$0.03/hr", diarization: true, prompting: true },
  "groq-whisper": { pricing: "$0.11/hr", diarization: false, prompting: false },
  alibaba: { pricing: "$0.13/hr", diarization: true, prompting: false },
  deepgram: { pricing: "$0.31/hr", diarization: true, prompting: false },
  mistral: { pricing: "$0.18/hr", diarization: true, prompting: false },
};
