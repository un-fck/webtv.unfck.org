import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { apiLanguage } from "./utils";

const SONIOX_API_KEY = process.env.SONIOX_API_KEY!;
const BASE = "https://api.soniox.com/v1";

/**
 * Soniox stt-async-v5 (2026-06). Language-agnostic by default with documented
 * mid-sentence code-switching across 60+ languages; per-token `language` and
 * `speaker` fields (`enable_language_identification` / `enable_speaker_diarization`).
 * `language_hints` bias detection but do not restrict it — for the floor track
 * we hint the six UN languages, for single-language tracks the one language.
 * Audio is submitted by URL (Kaltura download URLs are public), no upload step.
 */
const UN_FLOOR_HINTS = ["en", "fr", "es", "ar", "zh", "ru"];

async function sonioxFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SONIOX_API_KEY}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok)
    throw new Error(`Soniox ${path} failed ${res.status}: ${await res.text()}`);
  return res.json();
}

export const sonioxV5: TranscriptionProvider = {
  name: "soniox-stt-async-v5",
  label: "Soniox v5 (async)",
  model: "stt-async-v5",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: true,
  },

  async transcribe(audioUrl, opts) {
    const lang = apiLanguage(opts?.language);
    const { id } = (await sonioxFetch("/transcriptions", {
      method: "POST",
      body: JSON.stringify({
        model: "stt-async-v5",
        audio_url: audioUrl,
        enable_speaker_diarization: true,
        enable_language_identification: true,
        language_hints: lang ? [lang] : UN_FLOOR_HINTS,
      }),
    })) as { id: string };

    for (let i = 0; ; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const status = (await sonioxFetch(`/transcriptions/${id}`)) as {
        status: string;
        error_message?: string;
      };
      if (status.status === "completed") break;
      if (status.status === "error")
        throw new Error(`Soniox error: ${status.error_message}`);
      if (i % 6 === 5)
        console.log(`  [soniox] Still processing... (${(i + 1) * 5}s)`);
    }

    const transcript = (await sonioxFetch(
      `/transcriptions/${id}/transcript`,
    )) as {
      tokens: Array<{
        text: string;
        start_ms: number;
        end_ms: number;
        confidence?: number;
        speaker?: number | string;
        language?: string;
      }>;
    };

    // Group consecutive tokens by speaker into utterances. Tokens are
    // subword pieces whose `text` carries its own leading whitespace, so
    // utterance text is a plain concatenation.
    const utterances: NormalizedTranscript["utterances"] = [];
    for (const t of transcript.tokens) {
      const speaker = String(t.speaker ?? "1");
      const last = utterances[utterances.length - 1];
      if (last && last.speaker === speaker) {
        last.end = t.end_ms;
        last.text += t.text;
      } else {
        utterances.push({
          speaker,
          start: t.start_ms,
          end: t.end_ms,
          text: t.text.trimStart(),
        });
      }
    }

    const durationMs =
      utterances.length > 0 ? utterances[utterances.length - 1].end : 0;
    return {
      provider: "soniox-stt-async-v5",
      language: opts?.language || "multi",
      fullText: utterances.map((u) => u.text).join("\n"),
      utterances,
      durationMs,
      usage: durationMs ? { audioSeconds: durationMs / 1000 } : undefined,
      // tokens carry per-token language — keep them for script/language QA
      raw: transcript,
    } satisfies NormalizedTranscript;
  },
};
