import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "../utils";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;

export const mistral: TranscriptionProvider = {
  name: "mistral",

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Mistral"));

    try {
      const fileData = fs.readFileSync(filePath);
      const blob = new Blob([fileData], { type: "audio/mp4" });

      const form = new FormData();
      form.append("file", blob, path.basename(filePath));
      form.append("model", "voxtral-mini-latest");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      if (lang) form.append("language", lang);

      console.log(`  [Mistral] Transcribing with Voxtral...`);
      const t0 = Date.now();

      const res = await fetch(
        "https://api.mistral.ai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
          body: form,
        },
      );

      if (!res.ok) {
        throw new Error(
          `Mistral API error: ${res.status} ${await res.text()}`,
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
      };

      const utterances: NormalizedTranscript["utterances"] = (
        raw.segments || []
      ).map((seg) => ({
        speaker: seg.speaker || "0",
        start: seg.start * 1000,
        end: seg.end * 1000,
        text: seg.text.trim(),
      }));

      const durationMs = raw.duration ? raw.duration * 1000 : 0;

      console.log(
        `  [Mistral] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} segments, ${(durationMs / 1000 / 60).toFixed(0)}min audio`,
      );

      return {
        provider: "mistral",
        language: raw.language || lang,
        fullText: raw.text || "",
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
