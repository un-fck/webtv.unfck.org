import fs from "fs";
import { execSync } from "child_process";
import os from "os";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "../utils";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY!;
// Use international endpoint; switch to dashscope.aliyuncs.com for China region
const BASE = "https://dashscope-intl.aliyuncs.com";
const MODEL = "qwen3-asr-flash";
const MAX_CHUNK_SECS = 240; // 4 min chunks (API limit is ~5 min)
const PARALLEL_CHUNKS = 3;

interface AsrResponse {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          text?: string;
        }>;
      };
    }>;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface AsrSentence {
  begin_time: number;
  end_time: number;
  text: string;
  speaker_id?: string;
}

/** Call Qwen3-ASR-Flash with base64 audio via the multimodal generation endpoint */
async function transcribeChunk(
  audioPath: string,
  language?: string,
): Promise<AsrSentence[]> {
  const audioData = fs.readFileSync(audioPath);
  const base64 = audioData.toString("base64");
  const dataUri = `data:audio/mp3;base64,${base64}`;

  const body = {
    model: MODEL,
    input: {
      messages: [
        { role: "system", content: [{ text: "" }] },
        { role: "user", content: [{ audio: dataUri }] },
      ],
    },
    parameters: {
      asr_options: {
        language_hints: language ? [language] : undefined,
      },
    },
  };

  const res = await fetch(
    `${BASE}/api/v1/services/aigc/multimodal-generation/generation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    throw new Error(`DashScope API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as AsrResponse;
  const text =
    data.output?.choices?.[0]?.message?.content?.[0]?.text || "";

  if (!text) return [];

  // Parse the ASR output — Qwen3-ASR-Flash returns JSON with sentences
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.sentences) return parsed.sentences;
    if (parsed.text) {
      return [{ begin_time: 0, end_time: 0, text: parsed.text }];
    }
  } catch {
    // Plain text response
    return [{ begin_time: 0, end_time: 0, text }];
  }

  return [];
}

/** Split audio into chunks using ffmpeg */
function splitAudio(
  inputPath: string,
  chunkDurationSecs: number,
): { path: string; offsetMs: number }[] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alibaba-chunks-"));
  const pattern = path.join(tmpDir, "chunk_%03d.mp3");

  execSync(
    `ffmpeg -i "${inputPath}" -f segment -segment_time ${chunkDurationSecs} -ac 1 -ar 16000 -b:a 48k -reset_timestamps 1 "${pattern}" -y 2>/dev/null`,
  );

  const files = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("chunk_"))
    .sort();

  return files.map((f, i) => ({
    path: path.join(tmpDir, f),
    offsetMs: i * chunkDurationSecs * 1000,
  }));
}

/** Run promises with concurrency limit */
async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

export const alibaba: TranscriptionProvider = {
  name: "alibaba",

  async transcribe(audioUrl, opts) {
    const lang = opts?.language;
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Alibaba"));

    try {
      console.log(`  [Alibaba] Transcribing with ${MODEL}...`);
      const t0 = Date.now();

      // Split into chunks for the 5-min API limit
      const chunks = splitAudio(filePath, MAX_CHUNK_SECS);
      console.log(
        `  [Alibaba] Split into ${chunks.length} chunk(s), transcribing ${PARALLEL_CHUNKS} at a time...`,
      );

      const chunkResults = await parallelMap(
        chunks,
        PARALLEL_CHUNKS,
        async (chunk, i) => {
          const tChunk = Date.now();
          const sentences = await transcribeChunk(chunk.path, lang);
          console.log(
            `  [Alibaba] Chunk ${i + 1}/${chunks.length} done in ${((Date.now() - tChunk) / 1000).toFixed(1)}s (${sentences.length} sentences)`,
          );
          try { fs.unlinkSync(chunk.path); } catch {}
          return { sentences, offsetMs: chunk.offsetMs };
        },
      );

      // Clean up chunk directory
      try {
        const chunkDir = path.dirname(chunks[0].path);
        fs.rmdirSync(chunkDir);
      } catch {}

      // Reassemble
      const utterances: NormalizedTranscript["utterances"] = [];
      const fullTextParts: string[] = [];

      for (const { sentences, offsetMs } of chunkResults) {
        for (const s of sentences) {
          utterances.push({
            speaker: s.speaker_id ?? "0",
            start: s.begin_time + offsetMs,
            end: s.end_time + offsetMs,
            text: s.text.trim(),
          });
          fullTextParts.push(s.text.trim());
        }
      }

      const durationMs =
        utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

      console.log(
        `  [Alibaba] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} utterances, ${(durationMs / 1000 / 60).toFixed(0)}min audio`,
      );

      return {
        provider: "alibaba",
        language: lang || "en",
        fullText: fullTextParts.join(" "),
        utterances,
        durationMs,
        raw: { chunkResults },
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
