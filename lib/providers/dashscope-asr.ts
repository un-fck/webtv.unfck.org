import type { NormalizedTranscript, TranscriptWord } from "./types";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY!;
const BASE = "https://dashscope-intl.aliyuncs.com";

// DashScope async "recording file recognition" (file transcription). Shared by
// the fun-asr and qwen3-asr-flash-filetrans providers — same task-based API
// (submit → poll → fetch transcription_url), different model + capabilities.
//   fun-asr / paraformer-v2: diarization + timestamps
//   qwen3-asr-flash-filetrans: timestamps only (no speaker_id)

interface FiletransWord {
  begin_time: number;
  end_time: number;
  text: string;
}
interface FiletransSentence {
  begin_time: number;
  end_time: number;
  text: string;
  speaker_id?: number | string;
  words?: FiletransWord[];
}

function isCJK(ch: string): boolean {
  return !!ch && /[　-〿㐀-鿿＀-￯]/.test(ch);
}

/**
 * Rebuild a sentence string from word tokens. Mandarin-first models (fun-asr)
 * concatenate Latin words without spaces in their sentence.text; the word-level
 * tokens carry the real boundaries, so we re-join them: a space between two
 * tokens unless either side is CJK or the next token is closing punctuation.
 */
export function joinWords(words: FiletransWord[]): string {
  let out = "";
  for (const w of words) {
    const t = (w.text || "").trim();
    if (!t) continue;
    if (out) {
      const prev = out[out.length - 1];
      const next = t[0];
      const closingPunct = /^[,.!?;:)\]}%»、。，！？；：…”’]/.test(t);
      const openBefore = /[(\[{«“‘]$/.test(out);
      if (!isCJK(prev) && !isCJK(next) && !closingPunct && !openBefore)
        out += " ";
    }
    out += t;
  }
  return out;
}

export async function transcribeViaFiletrans(
  providerName: string,
  model: string,
  input: Record<string, unknown>,
  parameters: Record<string, unknown>,
  lang: string,
): Promise<NormalizedTranscript> {
  // Request shapes differ by model: fun-asr/paraformer use input.file_urls (array)
  // + diarization_enabled/timestamp_alignment_enabled; qwen3-asr-flash-filetrans
  // uses input.file_url (string) + enable_words (no diarization). Caller supplies both.

  // 1) submit async task
  const submitRes = await fetch(
    `${BASE}/api/v1/services/audio/asr/transcription`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({ model, input, parameters }),
    },
  );
  if (!submitRes.ok)
    throw new Error(`${providerName} submit failed: ${await submitRes.text()}`);
  const taskId = ((await submitRes.json()) as any).output?.task_id;
  if (!taskId) throw new Error(`${providerName}: no task_id returned`);

  // 2) poll
  let task: any;
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${BASE}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
    });
    task = await pollRes.json();
    const status = task.output?.task_status;
    if (status === "SUCCEEDED") break;
    if (status === "FAILED")
      throw new Error(
        `${providerName} failed: ${JSON.stringify(task.output).slice(0, 400)}`,
      );
    if (i % 6 === 5)
      console.log(`  [${providerName}] Still processing... (${(i + 1) * 5}s)`);
  }

  // 3) fetch result doc(s) and rebuild from word-level tokens
  const utterances: NormalizedTranscript["utterances"] = [];
  const textParts: string[] = [];
  // fun-asr returns output.results (array, one per file_url); qwen3-asr-flash-filetrans
  // returns output.result (singular object). Normalize to an array.
  const out = task.output || {};
  const results = out.results || (out.result ? [out.result] : []);
  for (const r of results) {
    if (r.subtask_status && r.subtask_status !== "SUCCEEDED") continue;
    if (!r.transcription_url) continue;
    const doc = (await (await fetch(r.transcription_url)).json()) as any;
    for (const tr of doc.transcripts || []) {
      for (const s of (tr.sentences || []) as FiletransSentence[]) {
        // Prefer the model's sentence.text (correct for most languages). Only
        // rebuild from word tokens when sentence.text shows the run-together
        // defect (a long Latin token with no spaces) — rebuilding everything
        // inserts spurious spaces between non-Latin sub-tokens (e.g. fun-asr
        // ar/ru), which wrecks those languages.
        let text = (s.text || "").trim();
        if (s.words && s.words.length && /[A-Za-zÀ-ÿ]{18,}/.test(text)) {
          text = joinWords(s.words);
        }
        if (!text) continue;
        const words: TranscriptWord[] | undefined = s.words?.map((w) => ({
          text: w.text,
          start: w.begin_time,
          end: w.end_time,
        }));
        utterances.push({
          speaker: s.speaker_id != null ? String(s.speaker_id) : "0",
          start: s.begin_time,
          end: s.end_time,
          text,
          ...(words ? { words } : {}),
        });
        textParts.push(text);
      }
    }
  }

  const durationMs = utterances.length
    ? utterances[utterances.length - 1].end
    : 0;
  console.log(`  [${providerName}] Done — ${utterances.length} sentences`);

  const audioSeconds = durationMs > 0 ? durationMs / 1000 : undefined;
  // Filetrans responses may carry a top-level `usage` object on token-priced
  // models (e.g. qwen3-asr-flash). fun-asr is per-second and typically omits it.
  const taskUsage = (task as { usage?: { input_tokens?: number; output_tokens?: number } })
    .usage;
  const inputTokens = taskUsage?.input_tokens;
  const outputTokens = taskUsage?.output_tokens;
  const hasTokens = (inputTokens ?? 0) > 0 || (outputTokens ?? 0) > 0;
  return {
    provider: providerName,
    language: lang,
    fullText: textParts.join(" "),
    utterances,
    durationMs,
    usage:
      hasTokens || audioSeconds
        ? {
            ...(hasTokens
              ? { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 }
              : {}),
            ...(audioSeconds ? { audioSeconds } : {}),
          }
        : undefined,
    raw: task,
  } satisfies NormalizedTranscript;
}
