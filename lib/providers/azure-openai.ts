import { AzureOpenAI } from "openai";
import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, splitAudio, parallelMap } from "./utils";

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB — stay under Azure's 25MB limit
const CHUNK_DURATION_SECS = 600; // 10 min chunks (well under 25min duration limit)
const PARALLEL_CHUNKS = 25;

function getClient() {
  return new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  });
}

async function transcribeFile(filePath: string, language?: string): Promise<any> {
  const client = getClient();
  return client.audio.transcriptions.create({
    model: "gpt-4o-transcribe-diarize",
    file: fs.createReadStream(filePath),
    response_format: "diarized_json",
    chunking_strategy: "auto",
    ...(language ? { language } : {}),
  } as any);
}

function segmentsToUtterances(
  segments: any[],
  offsetMs = 0,
): NormalizedTranscript["utterances"] {
  const utterances: NormalizedTranscript["utterances"] = [];
  for (const seg of segments) {
    const last = utterances[utterances.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.end = seg.end * 1000 + offsetMs;
      last.text += " " + seg.text.trim();
    } else {
      utterances.push({
        speaker: seg.speaker,
        start: seg.start * 1000 + offsetMs,
        end: seg.end * 1000 + offsetMs,
        text: seg.text.trim(),
      });
    }
  }
  return utterances;
}

export const azureOpenai: TranscriptionProvider = {
  name: "azure-openai",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: false,
  },

  async transcribe(audioUrl, opts) {
    const ownedPath = !opts?.audioFilePath;
    const tmpPath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Azure"));

    try {
      const fileSize = fs.statSync(tmpPath).size;
      const t0 = Date.now();

      let utterances: NormalizedTranscript["utterances"] = [];
      let fullText = "";
      let totalDurationMs = 0;

      if (fileSize <= MAX_FILE_SIZE) {
        console.log(`  [Azure] Transcribing...`);
        const raw = await transcribeFile(tmpPath, opts?.language);
        utterances = segmentsToUtterances(raw.segments || []);
        fullText = raw.text || utterances.map((u) => u.text).join(" ");
        totalDurationMs = utterances.length > 0 ? utterances[utterances.length - 1].end : 0;
      } else {
        console.log(
          `  [Azure] File too large (${(fileSize / 1024 / 1024).toFixed(0)}MB), splitting into chunks...`,
        );
        const tSplit0 = Date.now();
        const chunks = splitAudio(tmpPath, CHUNK_DURATION_SECS, "azure-chunks-");
        console.log(
          `  [Azure] Split into ${chunks.length} chunks in ${((Date.now() - tSplit0) / 1000).toFixed(1)}s, transcribing ${PARALLEL_CHUNKS} at a time...`,
        );

        const tApi0 = Date.now();
        const chunkResults = await parallelMap(chunks, PARALLEL_CHUNKS, async (chunk, i) => {
          const tChunk = Date.now();
          const raw = await transcribeFile(chunk.path, opts?.language);
          console.log(
            `  [Azure] Chunk ${i + 1}/${chunks.length} done in ${((Date.now() - tChunk) / 1000).toFixed(1)}s (offset ${(chunk.offsetMs / 1000 / 60).toFixed(0)}min)`,
          );
          try { fs.unlinkSync(chunk.path); } catch {}
          return { raw, offsetMs: chunk.offsetMs };
        });
        console.log(`  [Azure] All chunks transcribed in ${((Date.now() - tApi0) / 1000).toFixed(1)}s`);

        const textParts: string[] = [];
        for (const { raw, offsetMs } of chunkResults) {
          utterances.push(...segmentsToUtterances(raw.segments || [], offsetMs));
          textParts.push(raw.text || "");
          const lastSeg = (raw.segments || []).at(-1);
          if (lastSeg) totalDurationMs = Math.max(totalDurationMs, lastSeg.end * 1000 + offsetMs);
        }
        fullText = textParts.join(" ");

        try { fs.rmdirSync(path.dirname(chunks[0].path)); } catch {}
      }

      console.log(
        `  [Azure] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${utterances.length} utterances, ${(totalDurationMs / 1000 / 60).toFixed(0)}min audio`,
      );

      return {
        provider: "azure-openai",
        language: opts?.language || "en",
        fullText,
        utterances,
        durationMs: totalDurationMs,
        raw: { utterances },
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }
  },
};
