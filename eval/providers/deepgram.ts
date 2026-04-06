import fs from "fs";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "../utils";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;

interface DeepgramResponse {
  metadata: { duration: number; models: string[] };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
          speaker?: number;
        }>;
      }>;
    }>;
    utterances?: Array<{
      start: number;
      end: number;
      transcript: string;
      speaker: number;
      words: Array<{ word: string; start: number; end: number }>;
    }>;
  };
}

export const deepgram: TranscriptionProvider = {
  name: "deepgram",

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Deepgram"));

    try {
      const fileData = fs.readFileSync(filePath);

      const params = new URLSearchParams({
        model: "nova-3",
        language: lang,
        diarize: "true",
        utterances: "true",
        smart_format: "true",
        punctuate: "true",
      });

      console.log(`  [Deepgram] Transcribing with Nova-3...`);
      const t0 = Date.now();

      const res = await fetch(
        `https://api.deepgram.com/v1/listen?${params}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            "Content-Type": "audio/mp4",
          },
          body: fileData,
        },
      );

      if (!res.ok) {
        throw new Error(
          `Deepgram API error: ${res.status} ${await res.text()}`,
        );
      }

      const raw = (await res.json()) as DeepgramResponse;

      // Prefer utterances (speaker-diarized segments) if available
      const utterances: NormalizedTranscript["utterances"] = [];

      if (raw.results.utterances && raw.results.utterances.length > 0) {
        for (const utt of raw.results.utterances) {
          utterances.push({
            speaker: String(utt.speaker),
            start: utt.start * 1000,
            end: utt.end * 1000,
            text: utt.transcript.trim(),
          });
        }
      } else {
        // Fall back to word-level with speaker grouping
        const words =
          raw.results.channels[0]?.alternatives[0]?.words || [];
        for (const word of words) {
          const speaker = String(word.speaker ?? 0);
          const last = utterances[utterances.length - 1];
          if (last && last.speaker === speaker) {
            last.end = word.end * 1000;
            last.text += " " + word.word;
          } else {
            utterances.push({
              speaker,
              start: word.start * 1000,
              end: word.end * 1000,
              text: word.word,
            });
          }
        }
      }

      const fullText =
        raw.results.channels[0]?.alternatives[0]?.transcript || "";
      const durationMs = (raw.metadata?.duration || 0) * 1000;

      console.log(
        `  [Deepgram] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} utterances, ${(durationMs / 1000 / 60).toFixed(0)}min audio`,
      );

      return {
        provider: "deepgram",
        language: lang,
        fullText,
        utterances,
        durationMs,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  },
};
