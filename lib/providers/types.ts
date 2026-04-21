/** Per-word timestamp data from providers that support it */
export interface TranscriptWord {
  text: string;
  start: number; // ms
  end: number; // ms
  confidence: number;
  speaker?: string; // opaque label, carried as ASR hint
}

/** A speaker turn / utterance — contiguous speech from one speaker */
export interface TranscriptUtterance {
  speaker: string;
  start: number; // ms
  end: number; // ms
  text: string;
  /** Real word-level timestamps when available from the provider */
  words?: TranscriptWord[];
}

/** Normalized output from any provider */
export interface NormalizedTranscript {
  provider: string;
  language: string;
  fullText: string;
  utterances: TranscriptUtterance[];
  durationMs: number;
  raw: unknown;
}

/** Provider capabilities — used for pipeline branching */
export interface ProviderCapabilities {
  /** Returns named speakers with roles/affiliations (not just opaque labels) */
  speakerIdentification: boolean;
  /** Returns structured paragraphs (not just flat utterances) */
  paragraphSegmentation: boolean;
  /** Returns real per-word timing data */
  wordTimestamps: boolean;
}

/** Interface every provider adapter must implement */
export interface TranscriptionProvider {
  name: string;
  capabilities: ProviderCapabilities;
  supportedLanguages?: string[];
  transcribe(
    audioUrl: string,
    opts?: { audioFilePath?: string; language?: string },
  ): Promise<NormalizedTranscript>;
}
