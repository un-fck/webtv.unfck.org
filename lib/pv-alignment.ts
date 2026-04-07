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
import type { PVDocument, PVTurn } from "./pv-parser";
import {
  GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE,
  CHUNK_THRESHOLD_SECONDS, CHUNK_DURATION_SECONDS,
  httpsPostJson, uploadFileToGemini, waitForGeminiFile, deleteGeminiFile,
  fmtHHMMSS, parseHHMMSSToSeconds as parseHHMMSS, extractJsonObject,
  downloadAudioToTemp, getAudioDurationSeconds, extractAudioChunk,
} from "./gemini-utils";
import {
  trackGeminiTranscription,
  UsageOperations,
  UsageStages,
} from "./usage-tracking";
import type { GeminiUsageMetadata } from "./gemini-transcription";

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

interface AlignChunkResult {
  alignments: AlignmentResult[];
  usageMetadata: GeminiUsageMetadata;
}

async function alignChunk(
  filePath: string,
  items: AlignmentItem[],
  chunkDurationSec?: number,
  opts?: AlignmentOptions,
): Promise<AlignChunkResult> {
  console.log("  [PV Align] Uploading audio chunk...");
  const file = await uploadFileToGemini(filePath, "pv-align");
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

  const apiUrl = `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
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
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const responseText = (raw.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!responseText) throw new Error("Gemini returned empty response");

  const parsed = JSON.parse(extractJsonObject(responseText)) as {
    alignments: Array<{ itemIndex: number; startTime: string; endTime: string; firstWords?: string }>;
  };

  const usageMetadata: GeminiUsageMetadata = {
    promptTokenCount: raw.usageMetadata?.promptTokenCount ?? 0,
    candidatesTokenCount: raw.usageMetadata?.candidatesTokenCount ?? 0,
    thoughtsTokenCount: raw.usageMetadata?.thoughtsTokenCount ?? 0,
    totalTokenCount: raw.usageMetadata?.totalTokenCount ?? 0,
  };

  return { alignments: parsed.alignments, usageMetadata };
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
    const combinedUsage: GeminiUsageMetadata = {
      promptTokenCount: 0, candidatesTokenCount: 0,
      thoughtsTokenCount: 0, totalTokenCount: 0,
    };
    const startTime = Date.now();

    if (totalSeconds <= CHUNK_THRESHOLD_SECONDS) {
      // Short audio — single call
      const result = await alignChunk(tmpPath, allItems, undefined, opts);
      allAlignments = result.alignments;
      combinedUsage.promptTokenCount += result.usageMetadata.promptTokenCount;
      combinedUsage.candidatesTokenCount += result.usageMetadata.candidatesTokenCount;
      combinedUsage.thoughtsTokenCount += result.usageMetadata.thoughtsTokenCount;
      combinedUsage.totalTokenCount += result.usageMetadata.totalTokenCount;
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
            const result = await alignChunk(
              chunkPath,
              chunkItems,
              chunkDurationSec,
              opts,
            );
            combinedUsage.promptTokenCount += result.usageMetadata.promptTokenCount;
            combinedUsage.candidatesTokenCount += result.usageMetadata.candidatesTokenCount;
            combinedUsage.thoughtsTokenCount += result.usageMetadata.thoughtsTokenCount;
            combinedUsage.totalTokenCount += result.usageMetadata.totalTokenCount;
            // Adjust timestamps by chunk offset and item indices.
            const maxTimeSec = chunkDurationSec + 60;
            return result.alignments
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

    // Track usage
    const durationMs = Date.now() - startTime;
    await trackGeminiTranscription({
      transcriptId: pvDoc.symbol,
      stage: UsageStages.aligningPv,
      operation: UsageOperations.geminiPvAlignment,
      model: GEMINI_MODEL,
      usageMetadata: combinedUsage,
      audioSeconds: totalSeconds,
      durationMs,
      requestMeta: {
        symbol: pvDoc.symbol,
        turns: pvDoc.turns.length,
        paragraphs: totalParas,
        aligned: allAlignments.length,
      },
    });

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
