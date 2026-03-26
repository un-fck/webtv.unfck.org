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
};

export const PROVIDER_LABELS: Record<string, string> = {
  assemblyai: "AssemblyAI",
  "azure-openai": "Azure OpenAI",
  elevenlabs: "ElevenLabs",
  "azure-speech": "Azure Speech",
  "google-chirp": "Google Chirp 3",
  gemini: "Gemini 3 Flash",
};
