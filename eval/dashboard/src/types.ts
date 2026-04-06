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
  elevenlabs: "#D97706",
  "azure-speech": "#DC2626",
  "google-chirp": "#4285F4",
  gemini: "#886FBF",
  "groq-whisper": "#F55036",
  alibaba: "#FF6A00",
  deepgram: "#13EF93",
  mistral: "#FF7000",
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

export const PROVIDER_META: Record<string, ProviderMeta> = {
  assemblyai: { pricing: "$0.27/hr", diarization: true, prompting: false },
  "azure-openai": { pricing: "$0.06/hr", diarization: true, prompting: false },
  elevenlabs: { pricing: "$0.40/hr", diarization: true, prompting: false },
  "azure-speech": { pricing: "$0.36/hr", diarization: true, prompting: false },
  "google-chirp": {
    pricing: "$0.96/hr",
    diarization: true,
    prompting: false,
  },
  gemini: { pricing: "$0.01/hr", diarization: true, prompting: true },
  "groq-whisper": { pricing: "$0.09/hr", diarization: false, prompting: false },
  alibaba: { pricing: "$0.11/hr", diarization: true, prompting: false },
  deepgram: { pricing: "$0.15/hr", diarization: true, prompting: false },
  mistral: { pricing: "$0.06/hr", diarization: true, prompting: false },
};
