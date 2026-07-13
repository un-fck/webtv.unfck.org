import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "./utils";

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY!;
const AZURE_SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT!;

/**
 * Azure "LLM Speech" enhanced-mode fast transcription (api-version 2025-10-15)
 * on the existing Speech resource (same creds as azure-speech-batch). Multi-
 * lingual by default — the docs' own sample shows an en→zh→fr file returned as
 * one mixed-script transcript with per-phrase `locale` labels — with
 * diarization (`maxSpeakers`) and word timestamps. Synchronous multipart call,
 * ≤5 h / ≤500 MB per file. LLM-family model → hallucination risk is the thing
 * this arm is being evaluated FOR; `confidence` is documented as always 0.
 * Audio is converted to mono MP3 first (m4a/mp4 containers are not in the
 * documented format list).
 *
 * IMPORTANT: enhanced mode only works on the `<resource>.services.ai.azure.com`
 * hostname. The same request against the `<resource>.cognitiveservices.azure.com`
 * hostname of the SAME resource returns `400 "Enhanced mode is currently not
 * supported yet"` (which reads like a region problem but isn't). Plain fast
 * transcription works on either hostname. Set AZURE_SPEECH_ENDPOINT accordingly.
 */
export const azureLlmSpeech: TranscriptionProvider = {
  name: "azure-llm-speech",
  label: "Azure LLM Speech (enhanced)",
  model: "llm-speech-enhanced",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: true,
  },

  async transcribe(audioUrl, opts) {
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath ||
      (await downloadAudioToTemp(audioUrl, "AzureLLMSpeech"));
    const mp3Path = path.join(
      os.tmpdir(),
      `azure-llm-speech-${Date.now()}.mp3`,
    );

    try {
      execSync(`ffmpeg -y -i "${filePath}" -ac 1 -b:a 64k "${mp3Path}"`, {
        stdio: "pipe",
      });

      const definition: Record<string, unknown> = {
        enhancedMode: { enabled: true, task: "transcribe" },
        diarization: { enabled: true, maxSpeakers: 20 },
      };

      const form = new FormData();
      form.append(
        "audio",
        new Blob([fs.readFileSync(mp3Path)], { type: "audio/mpeg" }),
        path.basename(mp3Path),
      );
      form.append("definition", JSON.stringify(definition));

      const endpoint = AZURE_SPEECH_ENDPOINT.replace(/\/$/, "");
      const t0 = Date.now();
      const res = await fetch(
        `${endpoint}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
        {
          method: "POST",
          headers: { "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY },
          body: form,
        },
      );
      if (!res.ok)
        throw new Error(
          `Azure LLM Speech failed ${res.status}: ${await res.text()}`,
        );
      console.log(
        `  [azure-llm-speech] transcribed in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
      );
      const raw = (await res.json()) as {
        durationMilliseconds?: number;
        combinedPhrases?: Array<{ text: string }>;
        phrases?: Array<{
          offsetMilliseconds: number;
          durationMilliseconds: number;
          text: string;
          locale?: string;
          speaker?: number | string;
          words?: Array<{
            text: string;
            offsetMilliseconds: number;
            durationMilliseconds: number;
          }>;
        }>;
      };

      // One utterance per phrase; merge consecutive same-speaker phrases.
      const utterances: NormalizedTranscript["utterances"] = [];
      for (const p of raw.phrases || []) {
        const speaker = String(p.speaker ?? "1");
        const start = p.offsetMilliseconds;
        const end = p.offsetMilliseconds + p.durationMilliseconds;
        const words = (p.words || []).map((w) => ({
          text: w.text,
          start: w.offsetMilliseconds,
          end: w.offsetMilliseconds + w.durationMilliseconds,
          speaker,
        }));
        const last = utterances[utterances.length - 1];
        if (last && last.speaker === speaker) {
          last.end = end;
          last.text += " " + p.text;
          if (last.words && words.length) last.words.push(...words);
        } else {
          utterances.push({ speaker, start, end, text: p.text, words });
        }
      }

      const durationMs =
        raw.durationMilliseconds ||
        (utterances.length ? utterances[utterances.length - 1].end : 0);
      return {
        provider: "azure-llm-speech",
        language: opts?.language || "multi",
        fullText:
          raw.combinedPhrases?.map((c) => c.text).join("\n") ||
          utterances.map((u) => u.text).join("\n"),
        utterances,
        durationMs,
        usage: durationMs ? { audioSeconds: durationMs / 1000 } : undefined,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      try {
        fs.unlinkSync(mp3Path);
      } catch {}
      if (ownedPath) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  },
};
