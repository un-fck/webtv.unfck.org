/** A speaker turn / utterance — contiguous speech from one speaker */
export interface TranscriptUtterance {
  speaker: string;
  start: number; // ms
  end: number; // ms
  text: string;
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

/** Interface every provider adapter must implement */
export interface TranscriptionProvider {
  name: string;
  supportedLanguages?: string[];
  transcribe(
    audioUrl: string,
    opts?: { audioFilePath?: string; language?: string },
  ): Promise<NormalizedTranscript>;
}
