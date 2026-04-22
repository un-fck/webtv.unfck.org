import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, splitAudio, parallelMap } from "./utils";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;
const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB — stay under Mistral's ~25MB request limit
const CHUNK_DURATION_SECS = 600; // 10 min chunks
const PARALLEL_CHUNKS = 2;

async function transcribeFile(
  filePath: string,
  language?: string,
): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const fileData = fs.readFileSync(filePath);
    const blob = new Blob([fileData], { type: "audio/mp4" });

    const form = new FormData();
    form.append("file", blob, path.basename(filePath));
    form.append("model", "voxtral-mini-latest");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    if (language) form.append("language", language);

    const res = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
      body: form,
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 10;
      const wait = retryAfter * 1000 * (attempt + 1);
      console.log(`  [Mistral] Rate limited, waiting ${(wait / 1000).toFixed(0)}s...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Mistral API error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }
  throw new Error("Mistral API: max retries exceeded (rate limit)");
}

export const mistral: TranscriptionProvider = {
  name: "mistral",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: false,
  },

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Mistral"));

    try {
      const fileSize = fs.statSync(filePath).size;
      const t0 = Date.now();

      let allSegments: { start: number; end: number; text: string }[] = [];
      let fullText = "";
      let totalDurationMs = 0;

      if (fileSize <= MAX_FILE_SIZE) {
        console.log(`  [Mistral] Transcribing with Voxtral...`);
        const raw = await transcribeFile(filePath, lang);
        allSegments = (raw.segments || []).map((seg: any) => ({
          start: seg.start * 1000,
          end: seg.end * 1000,
          text: seg.text.trim(),
        }));
        fullText = raw.text || "";
        totalDurationMs = raw.duration ? raw.duration * 1000 : 0;
      } else {
        console.log(
          `  [Mistral] File too large (${(fileSize / 1024 / 1024).toFixed(0)}MB), splitting into chunks...`,
        );
        const tSplit0 = Date.now();
        const chunks = splitAudio(filePath, CHUNK_DURATION_SECS, "mistral-chunks-");
        console.log(
          `  [Mistral] Split into ${chunks.length} chunks in ${((Date.now() - tSplit0) / 1000).toFixed(1)}s, transcribing ${PARALLEL_CHUNKS} at a time...`,
        );

        const tApi0 = Date.now();
        const chunkResults = await parallelMap(
          chunks,
          PARALLEL_CHUNKS,
          async (chunk, i) => {
            const tChunk = Date.now();
            const raw = await transcribeFile(chunk.path, lang);
            console.log(
              `  [Mistral] Chunk ${i + 1}/${chunks.length} done in ${((Date.now() - tChunk) / 1000).toFixed(1)}s (offset ${(chunk.offsetMs / 1000 / 60).toFixed(0)}min)`,
            );
            try { fs.unlinkSync(chunk.path); } catch {}
            return { raw, offsetMs: chunk.offsetMs };
          },
        );
        console.log(
          `  [Mistral] All chunks transcribed in ${((Date.now() - tApi0) / 1000).toFixed(1)}s`,
        );

        const textParts: string[] = [];
        for (const { raw, offsetMs } of chunkResults) {
          for (const seg of raw.segments || []) {
            allSegments.push({
              start: seg.start * 1000 + offsetMs,
              end: seg.end * 1000 + offsetMs,
              text: seg.text.trim(),
            });
          }
          textParts.push(raw.text || "");
          const chunkDur = raw.duration ? raw.duration * 1000 : 0;
          totalDurationMs = Math.max(totalDurationMs, offsetMs + chunkDur);
        }
        fullText = textParts.join(" ");

        try {
          fs.rmdirSync(path.dirname(chunks[0].path));
        } catch {}
      }

      const utterances: NormalizedTranscript["utterances"] = allSegments.map(
        (seg) => ({
          speaker: "0",
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }),
      );

      console.log(
        `  [Mistral] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} segments, ${(totalDurationMs / 1000 / 60).toFixed(0)}min audio`,
      );

      return {
        provider: "mistral",
        language: lang,
        fullText,
        utterances,
        durationMs: totalDurationMs,
        raw: { segments: allSegments },
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
