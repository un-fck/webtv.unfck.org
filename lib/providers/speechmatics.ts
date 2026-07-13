import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, apiLanguage } from "./utils";

const SPEECHMATICS_API_KEY = process.env.SPEECHMATICS_API_KEY!;
const BASE = "https://asr.api.speechmatics.com/v2";

/**
 * Speechmatics Melia (melia-1, 2026-06-17, production preview) — multilingual
 * batch model with automatic code-switching across 56+ languages and per-word
 * language labels. Selected via `model: "melia-1"` + `language: "multi"`;
 * Melia does not support the `auto` language value, custom dictionary, or
 * confidence scores. For single-language tracks we keep `language: <iso>`
 * (served by their monolingual stack) so one provider entry covers both.
 */
export const speechmaticsMelia: TranscriptionProvider = {
  name: "speechmatics-melia-1",
  label: "Speechmatics Melia 1",
  model: "melia-1",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: true,
  },

  async transcribe(audioUrl, opts) {
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath ||
      (await downloadAudioToTemp(audioUrl, "Speechmatics"));

    try {
      const lang = apiLanguage(opts?.language);
      // language_hints bias (not restrict) Melia's per-word language labels —
      // documented as most useful "where two languages sound similar", which
      // is exactly the ru/uk confusion the unhinted run showed on Russian
      // floor statements. The six UN languages are always known a priori.
      const config = {
        type: "transcription",
        transcription_config: lang
          ? { language: lang, diarization: "speaker" }
          : {
              model: "melia-1",
              language: "multi",
              language_hints: ["en", "fr", "es", "ar", "cmn", "ru"],
              diarization: "speaker",
            },
      };

      const form = new FormData();
      form.append("config", JSON.stringify(config));
      form.append(
        "data_file",
        new Blob([fs.readFileSync(filePath)], { type: "audio/mp4" }),
        path.basename(filePath),
      );

      const submitRes = await fetch(`${BASE}/jobs/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` },
        body: form,
      });
      if (!submitRes.ok)
        throw new Error(
          `Speechmatics submit failed ${submitRes.status}: ${await submitRes.text()}`,
        );
      const { id } = (await submitRes.json()) as { id: string };

      for (let i = 0; ; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`${BASE}/jobs/${id}/`, {
          headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` },
        });
        const { job } = (await pollRes.json()) as {
          job: { status: string; errors?: unknown };
        };
        if (job.status === "done") break;
        if (job.status === "rejected" || job.status === "deleted")
          throw new Error(
            `Speechmatics job ${job.status}: ${JSON.stringify(job.errors ?? job)}`,
          );
        if (i % 6 === 5)
          console.log(`  [speechmatics] Still processing... (${(i + 1) * 5}s)`);
      }

      const trRes = await fetch(`${BASE}/jobs/${id}/transcript?format=json-v2`, {
        headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` },
      });
      if (!trRes.ok)
        throw new Error(
          `Speechmatics transcript fetch failed ${trRes.status}: ${await trRes.text()}`,
        );
      const raw = (await trRes.json()) as {
        results: Array<{
          type: string; // "word" | "punctuation"
          start_time: number; // seconds
          end_time: number;
          attaches_to?: string;
          alternatives?: Array<{
            content: string;
            speaker?: string;
            language?: string;
            confidence?: number;
          }>;
        }>;
      };

      // Group consecutive word results by speaker into utterances;
      // punctuation attaches to the previous token without a space.
      const utterances: NormalizedTranscript["utterances"] = [];
      for (const r of raw.results) {
        const alt = r.alternatives?.[0];
        if (!alt) continue;
        if (r.type === "punctuation") {
          const last = utterances[utterances.length - 1];
          if (last) last.text += alt.content;
          continue;
        }
        const speaker = alt.speaker || "UU";
        const startMs = r.start_time * 1000;
        const endMs = r.end_time * 1000;
        const word = {
          text: alt.content,
          start: startMs,
          end: endMs,
          confidence: alt.confidence,
          speaker,
        };
        const last = utterances[utterances.length - 1];
        if (last && last.speaker === speaker) {
          last.end = endMs;
          last.text += " " + alt.content;
          last.words!.push(word);
        } else {
          utterances.push({
            speaker,
            start: startMs,
            end: endMs,
            text: alt.content,
            words: [word],
          });
        }
      }

      const durationMs =
        utterances.length > 0 ? utterances[utterances.length - 1].end : 0;
      return {
        provider: "speechmatics-melia-1",
        language: opts?.language || "multi",
        fullText: utterances.map((u) => u.text).join("\n"),
        utterances,
        durationMs,
        usage: durationMs ? { audioSeconds: durationMs / 1000 } : undefined,
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
