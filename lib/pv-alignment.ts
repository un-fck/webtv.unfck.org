/**
 * Align PV document turns with audio timestamps using Gemini.
 *
 * Given a parsed PV document and the meeting audio, asks Gemini to identify
 * where each speaker turn begins and ends in the audio. The output is just
 * timestamps (not text), making it very token-efficient.
 *
 * Uses the same Gemini Files API approach as gemini-transcription.ts for
 * audio upload, but with a much simpler prompt focused only on alignment.
 */
import fs from "fs";
import https from "https";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import type { PVDocument, PVTurn } from "./pv-parser";
import { downloadAudioToTemp } from "../eval/utils";

const execFileAsync = promisify(execFile);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = "gemini-3-flash-preview";
const BASE = "https://generativelanguage.googleapis.com";

// Chunking: 10-min chunks give Gemini the most accurate timestamps.
// Gemini tends to hallucinate timestamps for longer audio clips.
const CHUNK_THRESHOLD_SECONDS = 10 * 60;
const CHUNK_DURATION_SECONDS = 10 * 60;

// ── Types ──────────────────────────────────────────────────────────────

export interface AlignedTurn extends PVTurn {
  startTime: number; // ms — start of first paragraph
  endTime: number; // ms — end of last paragraph
  /** Per-paragraph start times in ms. Length matches paragraphs array. -1 = unaligned. */
  paragraphTimestamps?: number[];
}

export interface AlignedPVDocument extends PVDocument {
  turns: AlignedTurn[];
  aligned: true;
}

interface AlignmentResult {
  itemIndex: number;
  startTime: string; // HH:MM:SS
  endTime: string; // HH:MM:SS
  firstWords?: string; // optional grounding quote
}

/** Flat representation of a paragraph for alignment */
interface AlignmentItem {
  turnIndex: number;
  paraIndex: number;
  speaker: string;
  affiliation?: string;
  paraNumber?: number;
  preview: string;
}

export interface AlignmentOptions {
  enableThinking?: boolean; // default: false (thinkingBudget=0)
  contentPreviewLength?: number; // default: 100 chars
  requestFirstWords?: boolean; // ask model to return firstWords quotes
  overlapBuffer?: number; // turn overlap between chunks (default: 2)
}

// ── Gemini API plumbing ────────────────────────────────────────────────

function httpsPostJson(
  url: string,
  body: object,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function uploadFileToGemini(
  filePath: string,
): Promise<{ name: string; uri: string }> {
  const fileSize = fs.statSync(filePath).size;
  const fileData = fs.readFileSync(filePath);

  const startRes = await fetch(
    `${BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": "audio/mp4",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: { displayName: `pv-align-${Date.now()}` },
      }),
    },
  );
  if (!startRes.ok)
    throw new Error(
      `Gemini upload start failed ${startRes.status}: ${await startRes.text()}`,
    );
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No Gemini upload URL returned");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileData,
  });
  if (!uploadRes.ok)
    throw new Error(
      `Gemini file upload failed ${uploadRes.status}: ${await uploadRes.text()}`,
    );
  const result = (await uploadRes.json()) as {
    file: { name: string; uri: string };
  };
  return result.file;
}

async function waitForGeminiFile(name: string): Promise<void> {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`);
    const file = (await res.json()) as { state: string };
    if (file.state === "ACTIVE") return;
    if (file.state === "FAILED")
      throw new Error("Gemini file processing failed");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function deleteGeminiFile(name: string): Promise<void> {
  await fetch(`${BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`, {
    method: "DELETE",
  }).catch(() => {});
}

// ── Audio utilities ────────────────────────────────────────────────────

async function getAudioDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function extractAudioChunk(
  filePath: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<string> {
  const chunkPath = path.join(
    os.tmpdir(),
    `pv-align-chunk-${Date.now()}-${startSeconds}.mp4`,
  );
  await execFileAsync("ffmpeg", [
    "-i",
    filePath,
    "-ss",
    String(startSeconds),
    "-t",
    String(durationSeconds),
    "-c",
    "copy",
    "-y",
    chunkPath,
  ]);
  return chunkPath;
}

function fmtHHMMSS(totalSec: number): string {
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(totalSec % 60)).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function parseHHMMSS(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("Unterminated JSON object in response");
}

// ── Alignment prompt ──────────────────────────────────────────────────

/** Build flat list of alignment items from turns — one per paragraph. */
function buildAlignmentItems(turns: PVTurn[], opts?: AlignmentOptions): AlignmentItem[] {
  const previewLen = opts?.contentPreviewLength ?? 100;
  const items: AlignmentItem[] = [];
  for (let ti = 0; ti < turns.length; ti++) {
    const t = turns[ti];
    for (let pi = 0; pi < t.paragraphs.length; pi++) {
      // Extract paragraph number from text prefix (e.g. "25. In accordance...")
      let paraNumber = pi === 0 ? t.paragraphNumber : undefined;
      if (pi > 0) {
        const numMatch = t.paragraphs[pi].match(/^(\d{1,3})\.\s/);
        if (numMatch) paraNumber = parseInt(numMatch[1]);
      }
      const text = t.paragraphs[pi].replace(/^\d{1,3}\.\s+/, "");
      items.push({
        turnIndex: ti,
        paraIndex: pi,
        speaker: t.speaker,
        affiliation: t.affiliation,
        paraNumber,
        preview: text.slice(0, previewLen),
      });
    }
  }
  return items;
}

function buildAlignmentPrompt(
  items: AlignmentItem[],
  chunkDurationSec?: number,
  opts?: AlignmentOptions,
): string {
  const itemList = items
    .map((item, i) => {
      const paraLabel = item.paraNumber ? `§${item.paraNumber} ` : "";
      return `  [${i}] ${paraLabel}${item.speaker}${item.affiliation ? ` (${item.affiliation})` : ""}: "${item.preview}..."`;
    })
    .join("\n");

  const durationNote = chunkDurationSec
    ? `\nIMPORTANT: This audio clip is ${fmtHHMMSS(chunkDurationSec)} long. It is an excerpt from a longer meeting. All timestamps in your response MUST be relative to the START of this clip. The clip starts at 00:00:00 and ends at ${fmtHHMMSS(chunkDurationSec)}. Do NOT use timestamps larger than ${fmtHHMMSS(chunkDurationSec)}. Only align items that you can actually hear in this audio clip.`
    : "";

  return `You are given audio from a United Nations meeting and a list of paragraphs from the official record. Your task is to find the timestamp in the audio where each paragraph begins and ends.

The official text is an edited version of what was said — it's close but not verbatim. Match by speaker identity and content meaning, not exact wording. Multiple consecutive paragraphs may be from the same speaker — each paragraph still needs its own timestamp.
${durationNote}

PARAGRAPHS:
${itemList}

OUTPUT FORMAT — respond with ONLY a JSON object:
{
  "alignments": [
    { "itemIndex": 0, "startTime": "HH:MM:SS", "endTime": "HH:MM:SS"${opts?.requestFirstWords ? ', "firstWords": "first 5-10 words you hear"' : ""} },
    { "itemIndex": 1, "startTime": "HH:MM:SS", "endTime": "HH:MM:SS"${opts?.requestFirstWords ? ', "firstWords": "first 5-10 words you hear"' : ""} }
  ]
}

Rules:
- Include ONLY paragraphs that you can actually hear in this audio
- Skip paragraphs not present in this audio
- startTime = when the content of this paragraph begins in the audio
- endTime = when this paragraph's content ends (just before the next paragraph starts)
- Timestamps must be in HH:MM:SS format, relative to the start of this audio clip
- Be as precise as possible (±5 seconds)${opts?.requestFirstWords ? "\n- firstWords = the first 5-10 words you actually hear for this paragraph (helps verify alignment)" : ""}`;
}

// ── Core alignment ────────────────────────────────────────────────────

async function alignChunk(
  filePath: string,
  items: AlignmentItem[],
  chunkDurationSec?: number,
  opts?: AlignmentOptions,
): Promise<AlignmentResult[]> {
  console.log("  [PV Align] Uploading audio chunk...");
  const file = await uploadFileToGemini(filePath);
  await waitForGeminiFile(file.name);

  const prompt = buildAlignmentPrompt(items, chunkDurationSec, opts);

  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    maxOutputTokens: 8192,
  };
  if (!opts?.enableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const requestBody = {
    contents: [
      {
        parts: [
          { fileData: { mimeType: "audio/mp4", fileUri: file.uri } },
          { text: prompt },
        ],
      },
    ],
    generationConfig,
  };

  const apiUrl = `${BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const result = await httpsPostJson(apiUrl, requestBody);
  await deleteGeminiFile(file.name);

  if (result.status !== 200) {
    throw new Error(
      `Gemini API error ${result.status}: ${result.body.slice(0, 500)}`,
    );
  }

  const raw = JSON.parse(result.body) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const responseText = (raw.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!responseText) throw new Error("Gemini returned empty response");

  const parsed = JSON.parse(extractJsonObject(responseText)) as {
    alignments: Array<{ itemIndex: number; startTime: string; endTime: string; firstWords?: string }>;
  };

  return parsed.alignments;
}

// ── Main alignment function ───────────────────────────────────────────

export async function alignPVWithAudio(
  pvDoc: PVDocument,
  audioUrl: string,
  opts?: AlignmentOptions,
): Promise<AlignedPVDocument> {
  // Build flat list of paragraph-level alignment items
  const allItems = buildAlignmentItems(pvDoc.turns, opts);
  const totalParas = allItems.length;
  console.log(
    `[PV Align] Aligning ${pvDoc.symbol} (${pvDoc.turns.length} turns, ${totalParas} paragraphs) with audio...`,
  );

  // Download audio
  const tmpPath = await downloadAudioToTemp(audioUrl);

  try {
    const totalSeconds = await getAudioDurationSeconds(tmpPath);
    console.log(
      `  [PV Align] Audio duration: ${fmtHHMMSS(totalSeconds)} (${Math.round(totalSeconds)}s)`,
    );

    let allAlignments: AlignmentResult[];

    if (totalSeconds <= CHUNK_THRESHOLD_SECONDS) {
      // Short audio — single call
      allAlignments = await alignChunk(tmpPath, allItems, undefined, opts);
    } else {
      // Long audio — chunk and process in parallel
      const numChunks = Math.ceil(totalSeconds / CHUNK_DURATION_SECONDS);
      console.log(
        `  [PV Align] Processing ${numChunks} chunk(s) in parallel...`,
      );

      // Estimate which items are in each chunk based on proportional position
      const itemsPerChunk = totalParas / numChunks;

      const chunkResults = await Promise.all(
        Array.from({ length: numChunks }, async (_, i) => {
          const startSeconds = i * CHUNK_DURATION_SECONDS;
          const chunkDurationSec = Math.min(
            CHUNK_DURATION_SECONDS,
            totalSeconds - startSeconds,
          );
          const chunkPath = await extractAudioChunk(
            tmpPath,
            startSeconds,
            CHUNK_DURATION_SECONDS,
          );

          // Estimate item range for this chunk, with configurable buffer
          const buffer = opts?.overlapBuffer ?? 2;
          const estStart = Math.max(0, Math.floor(i * itemsPerChunk) - buffer);
          const estEnd = Math.min(
            totalParas,
            Math.ceil((i + 1) * itemsPerChunk) + buffer,
          );
          const chunkItems = allItems.slice(estStart, estEnd);
          const itemIndexOffset = estStart;

          try {
            const results = await alignChunk(
              chunkPath,
              chunkItems,
              chunkDurationSec,
              opts,
            );
            // Adjust timestamps by chunk offset and item indices.
            const maxTimeSec = chunkDurationSec + 60;
            return results
              .filter((r) => r.startTime && r.endTime)
              .filter((r) => parseHHMMSS(r.startTime) <= maxTimeSec)
              .map((r) => ({
                ...r,
                itemIndex: r.itemIndex + itemIndexOffset,
                startTime: fmtHHMMSS(
                  parseHHMMSS(r.startTime) + startSeconds,
                ),
                endTime: fmtHHMMSS(
                  parseHHMMSS(r.endTime) + startSeconds,
                ),
              }));
          } finally {
            fs.unlinkSync(chunkPath);
          }
        }),
      );

      // Merge results — first occurrence wins per item
      const seen = new Set<number>();
      allAlignments = [];
      for (const chunk of chunkResults) {
        for (const alignment of chunk) {
          if (!seen.has(alignment.itemIndex)) {
            seen.add(alignment.itemIndex);
            allAlignments.push(alignment);
          }
        }
      }
    }

    // Map flat alignment results back to turn/paragraph structure
    // Build a map: itemIndex → alignment
    const alignmentMap = new Map(
      allAlignments.map((a) => [a.itemIndex, a]),
    );

    // Build a reverse lookup: (turnIndex, paraIndex) → flat item index
    const itemIndexByTurnPara = new Map<string, number>();
    for (let idx = 0; idx < allItems.length; idx++) {
      itemIndexByTurnPara.set(`${allItems[idx].turnIndex}:${allItems[idx].paraIndex}`, idx);
    }

    const alignedTurns: AlignedTurn[] = pvDoc.turns.map((turn, ti) => {
      const paraTimestamps: number[] = [];
      let turnStart = -1;
      let turnEnd = -1;

      for (let pi = 0; pi < turn.paragraphs.length; pi++) {
        const itemIdx = itemIndexByTurnPara.get(`${ti}:${pi}`);
        const alignment = itemIdx !== undefined ? alignmentMap.get(itemIdx) : undefined;

        if (alignment) {
          const startMs = parseHHMMSS(alignment.startTime) * 1000;
          const endMs = parseHHMMSS(alignment.endTime) * 1000;
          paraTimestamps.push(startMs);
          if (turnStart < 0 || startMs < turnStart) turnStart = startMs;
          if (endMs > turnEnd) turnEnd = endMs;
        } else {
          paraTimestamps.push(-1);
        }
      }

      return {
        ...turn,
        startTime: turnStart,
        endTime: turnEnd,
        paragraphTimestamps: paraTimestamps,
      };
    });

    const alignedCount = allAlignments.length;
    console.log(
      `  [PV Align] Aligned ${alignedCount}/${totalParas} paragraphs across ${pvDoc.turns.length} turns`,
    );

    return {
      ...pvDoc,
      turns: alignedTurns,
      aligned: true,
    };
  } finally {
    fs.unlinkSync(tmpPath);
  }
}
