import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, splitAudio, parallelMap } from "./utils";

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB to stay under Groq's 25MB limit
const CHUNK_DURATION_SECS = 600; // 10 min chunks
const PARALLEL_CHUNKS = 10; // concurrent Groq API calls


/** Call Groq transcription API with file upload, with retry on rate limit */
async function transcribeFile(
  filePath: string,
  language?: string,
): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    form.append("file", new Blob([fileBuffer]), path.basename(filePath));
    form.append("model", "whisper-large-v3");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    if (language) form.append("language", language);

    const res = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
      },
    );

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 5;
      const wait = retryAfter * 1000 * (attempt + 1);
      console.log(`  [Groq] Rate limited, waiting ${(wait / 1000).toFixed(0)}s...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }
  throw new Error("Groq API: max retries exceeded (rate limit)");
}


export const groqWhisper: TranscriptionProvider = {
  name: "groq-whisper",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: false,
  },

  async transcribe(audioUrl, opts) {
    const ownedPath = !opts?.audioFilePath;
    const tmpPath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Groq"));

    try {
      const fileSize = fs.statSync(tmpPath).size;

      let allSegments: { start: number; end: number; text: string }[] = [];
      let fullText = "";
      let totalDurationMs = 0;

      const t0 = Date.now();

      if (fileSize <= MAX_FILE_SIZE) {
        // Single file upload
        const response = await transcribeFile(tmpPath, opts?.language);
        allSegments =
          response.segments?.map((seg: any) => ({
            start: seg.start * 1000,
            end: seg.end * 1000,
            text: seg.text.trim(),
          })) || [];
        fullText = response.text || "";
        totalDurationMs = response.duration ? response.duration * 1000 : 0;
      } else {
        // Split into chunks and transcribe in parallel
        console.log(
          `  [Groq] File too large (${(fileSize / 1024 / 1024).toFixed(0)}MB), splitting into chunks...`,
        );
        const tSplit0 = Date.now();
        const chunks = splitAudio(tmpPath, CHUNK_DURATION_SECS, "groq-chunks-");
        console.log(`  [Groq] Split into ${chunks.length} chunks in ${((Date.now() - tSplit0) / 1000).toFixed(1)}s, transcribing ${PARALLEL_CHUNKS} at a time...`);

        const tApi0 = Date.now();
        const chunkResults = await parallelMap(chunks, PARALLEL_CHUNKS, async (chunk, i) => {
          const chunkSize = fs.statSync(chunk.path).size;
          const tChunk = Date.now();
          const response = await transcribeFile(chunk.path, opts?.language);
          console.log(
            `  [Groq] Chunk ${i + 1}/${chunks.length} done in ${((Date.now() - tChunk) / 1000).toFixed(1)}s (offset ${(chunk.offsetMs / 1000 / 60).toFixed(0)}min, ${(chunkSize / 1024 / 1024).toFixed(0)}MB)`,
          );

          // Clean up chunk immediately
          try { fs.unlinkSync(chunk.path); } catch {}

          return { response, offsetMs: chunk.offsetMs };
        });
        console.log(`  [Groq] All chunks transcribed in ${((Date.now() - tApi0) / 1000).toFixed(1)}s`);

        // Reassemble in order
        const textParts: string[] = [];
        for (const { response, offsetMs } of chunkResults) {
          if (response.segments) {
            for (const seg of response.segments) {
              allSegments.push({
                start: seg.start * 1000 + offsetMs,
                end: seg.end * 1000 + offsetMs,
                text: seg.text.trim(),
              });
            }
          }
          textParts.push(response.text || "");
          const chunkDur = response.duration ? response.duration * 1000 : 0;
          totalDurationMs = Math.max(totalDurationMs, offsetMs + chunkDur);
        }
        fullText = textParts.join(" ");

        // Clean up chunk directory
        try {
          const chunkDir = path.dirname(chunks[0].path);
          fs.rmdirSync(chunkDir);
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

      console.log(`  [Groq] Total transcription time: ${((Date.now() - t0) / 1000).toFixed(1)}s for ${(totalDurationMs / 1000 / 60).toFixed(0)}min audio`);

      return {
        provider: "groq-whisper",
        language: opts?.language || "en",
        fullText,
        utterances,
        durationMs: totalDurationMs,
        raw: { segments: allSegments },
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
      }
    }
  },
};
