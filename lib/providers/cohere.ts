import fs from "fs";
import { execSync } from "child_process";
import os from "os";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "./utils";

/** Convert audio to mp3 if needed (Cohere only supports flac, mp3, mpeg, mpga, ogg, wav) */
function ensureMp3(inputPath: string): { path: string; needsCleanup: boolean } {
  const ext = path.extname(inputPath).toLowerCase();
  if ([".mp3", ".flac", ".ogg", ".wav", ".mpeg", ".mpga"].includes(ext)) {
    return { path: inputPath, needsCleanup: false };
  }
  const tmpPath = path.join(
    os.tmpdir(),
    `cohere-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
  );
  execSync(
    `ffmpeg -i "${inputPath}" -ac 1 -ar 16000 -b:a 48k "${tmpPath}" -y 2>/dev/null`,
  );
  return { path: tmpPath, needsCleanup: true };
}

const CO_API_KEY = process.env.CO_API_KEY!;

export const cohere: TranscriptionProvider = {
  name: "cohere",

  // Cohere Transcribe supports 14 languages: en, fr, de, it, es, pt, el, nl, pl, zh, ja, ko, vi, ar
  supportedLanguages: [
    "en", "fr", "de", "it", "es", "pt", "el", "nl", "pl", "zh", "ja", "ko",
    "vi", "ar",
  ],

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Cohere"));

    const converted = ensureMp3(filePath);

    try {
      const fileData = fs.readFileSync(converted.path);
      const blob = new Blob([fileData], { type: "audio/mpeg" });

      const form = new FormData();
      form.append("model", "cohere-transcribe-03-2026");
      if (lang) form.append("language", lang);
      form.append("temperature", "0");
      form.append("file", blob, "audio.mp3");

      console.log(`  [Cohere] Transcribing with Cohere Transcribe...`);
      const t0 = Date.now();

      const res = await fetch(
        "https://api.cohere.com/v2/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${CO_API_KEY}` },
          body: form,
        },
      );

      if (!res.ok) {
        throw new Error(
          `Cohere API error: ${res.status} ${await res.text()}`,
        );
      }

      const raw = (await res.json()) as {
        text: string;
        language?: string;
        duration?: number;
        segments?: Array<{
          start: number;
          end: number;
          text: string;
          speaker?: string;
        }>;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          type?: string;
          speaker_id?: string;
        }>;
      };

      // Build utterances from segments if available, otherwise from words
      const utterances: NormalizedTranscript["utterances"] = [];

      if (raw.segments && raw.segments.length > 0) {
        for (const seg of raw.segments) {
          utterances.push({
            speaker: seg.speaker || "0",
            start: seg.start * 1000,
            end: seg.end * 1000,
            text: seg.text.trim(),
          });
        }
      } else if (raw.words && raw.words.length > 0) {
        // Group words by speaker
        for (const word of raw.words) {
          if (word.type && word.type !== "word") continue;
          const speaker = word.speaker_id || "0";
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

      const durationMs =
        raw.duration
          ? raw.duration * 1000
          : utterances.length > 0
            ? utterances[utterances.length - 1].end
            : 0;

      console.log(
        `  [Cohere] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} segments, ${(durationMs / 1000 / 60).toFixed(0)}min audio`,
      );

      return {
        provider: "cohere",
        language: raw.language || lang,
        fullText: raw.text || "",
        utterances,
        durationMs,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      if (converted.needsCleanup) {
        try { fs.unlinkSync(converted.path); } catch {}
      }
      if (ownedPath) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
