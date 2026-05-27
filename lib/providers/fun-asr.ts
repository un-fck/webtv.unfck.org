import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { apiLanguage } from "./utils";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY!;
const BASE = "https://dashscope-intl.aliyuncs.com";

// DashScope Fun-ASR "recording file recognition": an async, task-based batch API
// that takes a public audio URL and returns sentence + word timestamps with
// optional speaker diarization. Distinct from the synchronous qwen3-asr-flash
// path in alibaba.ts. Result is delivered as a downloadable transcription_url
// per input file.
interface FunAsrSentence {
  begin_time: number;
  end_time: number;
  text: string;
  speaker_id?: number | string;
}

export const funAsr: TranscriptionProvider = {
  name: "fun-asr",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: true,
  },

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const apiLang = apiLanguage(opts?.language);

    // 1) Submit async task (X-DashScope-Async required)
    const submitRes = await fetch(
      `${BASE}/api/v1/services/audio/asr/transcription`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify({
          model: "fun-asr",
          input: { file_urls: [audioUrl] },
          parameters: {
            diarization_enabled: true,
            timestamp_alignment_enabled: true,
            ...(apiLang ? { language_hints: [apiLang] } : {}),
          },
        }),
      },
    );
    if (!submitRes.ok)
      throw new Error(`Fun-ASR submit failed: ${await submitRes.text()}`);
    const submit = (await submitRes.json()) as any;
    const taskId = submit.output?.task_id;
    if (!taskId)
      throw new Error(`Fun-ASR: no task_id (${JSON.stringify(submit).slice(0, 300)})`);

    // 2) Poll task
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
        throw new Error(`Fun-ASR failed: ${JSON.stringify(task.output).slice(0, 400)}`);
      if (i % 6 === 5)
        console.log(`  [fun-asr] Still processing... (${(i + 1) * 5}s)`);
    }

    // 3) Fetch result JSON(s) — delivered as transcription_url per input file
    const results = task.output?.results || [];
    const utterances: NormalizedTranscript["utterances"] = [];
    const textParts: string[] = [];

    for (const r of results) {
      if (r.subtask_status && r.subtask_status !== "SUCCEEDED") continue;
      const url = r.transcription_url;
      if (!url) continue;
      const docRes = await fetch(url);
      const doc = (await docRes.json()) as any;
      for (const tr of doc.transcripts || []) {
        for (const s of (tr.sentences || []) as FunAsrSentence[]) {
          const text = (s.text || "").trim();
          if (!text) continue;
          utterances.push({
            speaker: s.speaker_id != null ? String(s.speaker_id) : "0",
            start: s.begin_time,
            end: s.end_time,
            text,
          });
          textParts.push(text);
        }
      }
    }

    const durationMs =
      utterances.length > 0 ? utterances[utterances.length - 1].end : 0;
    console.log(`  [fun-asr] Done — ${utterances.length} sentences`);

    return {
      provider: "fun-asr",
      language: lang,
      fullText: textParts.join(" "),
      utterances,
      durationMs,
      raw: task,
    } satisfies NormalizedTranscript;
  },
};
