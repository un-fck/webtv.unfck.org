import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import {
  downloadAudioToTemp,
  splitAudio,
  parallelMap,
  apiLanguage,
} from "./utils";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;
const MODEL = "voxtral-small-latest";
// Mistral's binding limit for audio chat is tokens/minute (50k on low tiers),
// not requests. A 10-min audio chunk alone can approach/exceed that, so we use
// small chunks and serial requests to stay under budget; the 429 backoff paces
// the rest. Raise both if your Mistral rate-limit tier is higher.
const CHUNK_SECS = 180; // 3 min (~150k audio tokens, fits a 200k tok/min tier)
const PARALLEL = 1;

// voxtral-small is an audio-*understanding* (chat) model, not a transcription
// endpoint model. We call chat/completions with an audio part + a verbatim
// transcription instruction. Chat output has no reliable sub-timestamps, so
// each chunk becomes one utterance spanning the chunk (content-quality probe,
// coarse timing) — mirrors how artificialanalysis benchmarks these models.
async function transcribeChunk(
  filePath: string,
  langName: string,
): Promise<string> {
  const base64 = fs.readFileSync(filePath).toString("base64");
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "input_audio", input_audio: base64 },
              {
                type: "text",
                text:
                  `Transcribe this audio verbatim in ${langName}. ` +
                  "Output only the transcription text — no commentary, no labels, " +
                  "no timestamps. Transcribe every word exactly as spoken.",
              },
            ],
          },
        ],
      }),
    });
    if (res.status === 429) {
      const wait =
        (Number(res.headers.get("retry-after")) || 10) * 1000 * (attempt + 1);
      console.log(
        `  [voxtral-small] Rate limited, waiting ${(wait / 1000).toFixed(0)}s...`,
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok)
      throw new Error(
        `Voxtral-small API error: ${res.status} ${await res.text()}`,
      );
    const data = (await res.json()) as any;
    const msg = data.choices?.[0]?.message?.content;
    return typeof msg === "string"
      ? msg
      : (msg || []).map((p: any) => p.text || "").join(" ");
  }
  throw new Error("Voxtral-small: max retries exceeded (rate limit)");
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese",
  ru: "Russian",
};

export const voxtralSmall: TranscriptionProvider = {
  name: "voxtral-small",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: false,
  },

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const langName =
      LANGUAGE_NAMES[apiLanguage(opts?.language) || ""] ||
      "the spoken language";
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath ||
      (await downloadAudioToTemp(audioUrl, "voxtral-small"));

    try {
      const t0 = Date.now();
      const chunks = splitAudio(filePath, CHUNK_SECS, "voxtral-small-chunks-");
      console.log(
        `  [voxtral-small] Split into ${chunks.length} chunk(s), ${PARALLEL} at a time...`,
      );

      const results = await parallelMap(chunks, PARALLEL, async (chunk, i) => {
        const text = await transcribeChunk(chunk.path, langName);
        console.log(
          `  [voxtral-small] Chunk ${i + 1}/${chunks.length} (offset ${(chunk.offsetMs / 60000).toFixed(0)}min)`,
        );
        try {
          fs.unlinkSync(chunk.path);
        } catch {}
        return { text: text.trim(), offsetMs: chunk.offsetMs };
      });
      try {
        fs.rmdirSync(path.dirname(chunks[0].path));
      } catch {}

      const utterances: NormalizedTranscript["utterances"] = [];
      for (const { text, offsetMs } of results) {
        if (!text) continue;
        utterances.push({
          speaker: "0",
          start: offsetMs,
          end: offsetMs + CHUNK_SECS * 1000,
          text,
        });
      }
      const fullText = results
        .map((r) => r.text)
        .filter(Boolean)
        .join(" ");
      const durationMs = utterances.length
        ? utterances[utterances.length - 1].end
        : 0;

      console.log(
        `  [voxtral-small] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} chunks`,
      );

      return {
        provider: "voxtral-small",
        language: lang,
        fullText,
        utterances,
        durationMs,
        raw: { results },
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
