/**
 * Arm B: translate a floor (original-audio) transcript into each UN language
 * with Azure OpenAI, producing the "transcribe the floor, then translate"
 * pipeline that is the cheap production alternative to transcribing what the
 * human interpreters said.
 *
 * Translation is done segment-wise rather than as one blob, for two reasons:
 * the timestamps have to survive so the result can be scored and timed like
 * any other track, and a real deployment would translate incrementally anyway.
 * Segments are batched so the model still sees enough neighbouring context to
 * resolve pronouns and terminology across segment boundaries.
 */
import fs from "fs";
import path from "path";
import { AzureOpenAI } from "openai";
import { getAnalysisModel } from "../../lib/providers/models";

const CACHE = path.join(__dirname, "cache", "pivot");

export interface FloorSegment {
  start: number;
  end: number;
  text: string;
}

export interface PivotResult {
  language: string;
  segments: Array<{ start: number; end: number; text: string }>;
  fullText: string;
  usage: { inputTokens: number; outputTokens: number };
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese (Simplified)",
  ru: "Russian",
};

/** Segments per request. Large enough for context, small enough that a
 * mis-numbered response costs little to redo. */
const BATCH = 40;

function client(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!endpoint || !apiKey)
    throw new Error("AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY not set");
  return new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-03-01-preview",
  });
}

const SYSTEM = (target: string) =>
  `You are a United Nations translator. You will be given numbered segments of a verbatim floor transcript from a UN meeting. The floor audio is multilingual — segments may be in any language.

Translate every segment into ${target}.

RULES:
- Output exactly one line per input segment, in the same order, formatted as "<number>|<translation>".
- Never merge, split, reorder, drop or add segments. The output line count MUST equal the input line count.
- If a segment is already in ${target}, reproduce it as-is.
- If a segment is empty or unintelligible, output the number and an empty translation.
- Use official UN terminology and the official ${target} names of countries and organs.
- Translate only. Do not summarize, explain, or add commentary.`;

async function translateBatch(
  c: AzureOpenAI,
  segments: FloorSegment[],
  target: string,
  offset: number,
): Promise<{ texts: string[]; inputTokens: number; outputTokens: number }> {
  const numbered = segments
    .map((s, i) => `${offset + i}|${s.text.replace(/\n/g, " ")}`)
    .join("\n");

  const res = await c.chat.completions.create({
    model: getAnalysisModel(),
    messages: [
      { role: "system", content: SYSTEM(LANGUAGE_NAMES[target] ?? target) },
      { role: "user", content: numbered },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "";
  // Map by the emitted index rather than by position, so a single dropped or
  // duplicated line degrades one segment instead of shifting all of them.
  const byIndex = new Map<number, string>();
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*\|(.*)$/);
    if (m) byIndex.set(Number(m[1]), m[2].trim());
  }
  const texts = segments.map((_, i) => byIndex.get(offset + i) ?? "");

  return {
    texts,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

/** Translate a floor transcript into `target`, caching by session + language. */
export async function pivotTranslate(
  sessionKey: string,
  segments: FloorSegment[],
  target: string,
): Promise<PivotResult> {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, `${sessionKey}_${target}.json`);
  if (fs.existsSync(cached))
    return JSON.parse(fs.readFileSync(cached, "utf8")) as PivotResult;

  const c = client();
  const out: PivotResult["segments"] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH);
    const r = await translateBatch(c, batch, target, i);
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    batch.forEach((s, k) =>
      out.push({ start: s.start, end: s.end, text: r.texts[k] }),
    );
    process.stdout.write(
      `\r    ${target}: ${Math.min(i + BATCH, segments.length)}/${segments.length} segments`,
    );
  }
  process.stdout.write("\n");

  const result: PivotResult = {
    language: target,
    segments: out,
    fullText: out
      .map((s) => s.text)
      .filter(Boolean)
      .join(" "),
    usage: { inputTokens, outputTokens },
  };
  fs.writeFileSync(cached, JSON.stringify(result, null, 1));
  return result;
}
