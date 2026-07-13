import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, apiLanguage } from "./utils";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

/**
 * ElevenLabs Scribe v2, parameterized by diarization knobs. The stock entry
 * uses API defaults; the "tuned" entry targets the over-splitting SYNTHESIS §3
 * measured (34–41 speakers on long meetings) via the two documented params:
 * `diarization_threshold` (default ~0.22 — higher = fewer distinct speakers)
 * and `num_speakers` (max speaker count; for UN meetings the PV gives the true
 * count). The tuned values can be overridden per run via env
 * ELEVENLABS_DIARIZATION_THRESHOLD / ELEVENLABS_NUM_SPEAKERS.
 */
function makeElevenlabs(
  name: string,
  label: string,
  tuned?: { diarizationThreshold: number; numSpeakers?: number },
): TranscriptionProvider {
  return {
    name,
    label,
    model: "scribe_v2",
    capabilities: {
      speakerIdentification: false,
      paragraphSegmentation: false,
      wordTimestamps: true,
    },

    async transcribe(audioUrl, opts) {
      const ownedPath = !opts?.audioFilePath;
      const filePath =
        opts?.audioFilePath ||
        (await downloadAudioToTemp(audioUrl, "ElevenLabs"));

      try {
        const fileData = fs.readFileSync(filePath);
        const blob = new Blob([fileData], { type: "audio/mp4" });

        const form = new FormData();
        form.append("model_id", "scribe_v2");
        form.append("file", blob, path.basename(filePath));
        form.append("diarize", "true");
        form.append("timestamps_granularity", "word");
        if (tuned) {
          // The API rejects requests that set both knobs ("If
          // 'diarization_threshold' is provided, 'num_speakers' must not be
          // set") — send exactly one, num_speakers winning when configured.
          const numSpeakers =
            Number(process.env.ELEVENLABS_NUM_SPEAKERS) || tuned.numSpeakers;
          if (numSpeakers) {
            form.append("num_speakers", String(numSpeakers));
            console.log(`  [${name}] num_speakers=${numSpeakers}`);
          } else {
            const threshold =
              Number(process.env.ELEVENLABS_DIARIZATION_THRESHOLD) ||
              tuned.diarizationThreshold;
            form.append("diarization_threshold", String(threshold));
            console.log(`  [${name}] diarization_threshold=${threshold}`);
          }
        }
        const apiLang = apiLanguage(opts?.language);
        if (apiLang) {
          form.append("language_code", apiLang);
        }

        const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
          body: form,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
        }

        const raw = (await res.json()) as {
          language_code?: string;
          text: string;
          words: Array<{
            text: string;
            start: number;
            end: number;
            type: string;
            speaker_id?: string;
          }>;
        };

        // Group consecutive word-type tokens by speaker_id into utterances
        const utterances: NormalizedTranscript["utterances"] = [];
        for (const word of raw.words) {
          if (word.type !== "word") continue;
          const speaker = word.speaker_id || "A";
          const last = utterances[utterances.length - 1];
          if (last && last.speaker === speaker) {
            last.end = word.end * 1000;
            last.text += " " + word.text;
          } else {
            utterances.push({
              speaker,
              start: word.start * 1000,
              end: word.end * 1000,
              text: word.text,
            });
          }
        }

        const durationMs =
          utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

        return {
          provider: name,
          language: raw.language_code || opts?.language || "en",
          fullText: raw.text,
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
}

export const elevenlabs = makeElevenlabs(
  "elevenlabs-scribe-v2",
  "ElevenLabs Scribe v2",
);
export const elevenlabsTuned = makeElevenlabs(
  "elevenlabs-scribe-v2-tuned",
  "ElevenLabs Scribe v2 (tuned diarization)",
  { diarizationThreshold: 0.35 },
);
