/**
 * The YouTube architecture: streaming ASR → machine translation.
 *
 * YouTube does not run a single speech-to-translated-text model. It captions
 * the video in its own language and then auto-translates those captions. Every
 * platform captioning stack works this way — Google Meet, Teams, Zoom, and the
 * broadcast vendors all sit on ASR plus an MT layer — so it deserves to be
 * measured as its own architecture rather than assumed equivalent to a
 * single-model live translator.
 *
 * The architecture has one large advantage for measurement: **every latency
 * component is separately observable**. Deepgram returns word-level timestamps
 * on final results, so the ASR half is exact (emit wall-clock minus the word's
 * own end time), and the MT half is a request we time ourselves. Nothing has
 * to be inferred, which is the opposite of the single-model translators whose
 * translated tokens carry no timestamps at all.
 *
 * It also has a real weakness worth surfacing rather than engineering around:
 * the ASR must commit to a language. On a multilingual UN floor, whatever it
 * picks is wrong for part of the meeting — exactly the failure a viewer of
 * auto-captioned multilingual video sees.
 */
import fs from "fs";
import WebSocket from "ws";
import { GoogleAuth } from "google-auth-library";
import type {
  StreamingProvider,
  StreamingRun,
  StreamingEvent,
} from "../streaming-types";

const SAMPLE_RATE = 16000;
const CHUNK_MS = 100;
const CHUNK_BYTES = (SAMPLE_RATE * 2 * CHUNK_MS) / 1000;

/** Deepgram streaming, ~$0.29/hr; Google Translate ~$20/M chars. */
const ASR_USD_PER_HOUR = 0.29;
const MT_USD_PER_M_CHARS = 20;

let authClient: Awaited<ReturnType<GoogleAuth["getClient"]>> | null = null;
async function gcpToken(): Promise<string> {
  if (!authClient) {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    authClient = await auth.getClient();
  }
  const t = await authClient.getAccessToken();
  if (!t.token) throw new Error("could not obtain GCP access token");
  return t.token;
}

function projectId(): string {
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!p) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");
  return JSON.parse(fs.readFileSync(p, "utf8")).project_id as string;
}

interface Caption {
  text: string;
  /** End time in the AUDIO of the last word in this caption, ms. */
  audioEndMs: number;
  /** Wall-clock ms when the ASR finalized it. */
  asrEmitMs: number;
}

/**
 * Translate captions in small batches. Captions are translated as they are
 * produced rather than at the end, because batching the whole meeting would
 * make the MT latency meaningless — a caption pipeline translates each caption
 * as it lands.
 */
async function translateBatch(
  texts: string[],
  target: string,
  proj: string,
): Promise<{ translations: string[]; ms: number }> {
  const t0 = Date.now();
  const token = await gcpToken();
  const res = await fetch(
    `https://translation.googleapis.com/v3/projects/${proj}/locations/global:translateText`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: texts,
        targetLanguageCode: target,
        mimeType: "text/plain",
      }),
    },
  );
  if (!res.ok) throw new Error(`translate ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as {
    translations: Array<{ translatedText: string }>;
  };
  return {
    translations: j.translations.map((t) => t.translatedText),
    ms: Date.now() - t0,
  };
}

export function captionPipeline(opts: {
  /** Deepgram language setting. "multi" is honest for a multilingual floor. */
  asrLanguage: string;
}): StreamingProvider {
  return {
    name: `caption-deepgram-${opts.asrLanguage}-gtranslate`,
    label: `Deepgram nova-3 (${opts.asrLanguage}) → Google Translate [YouTube-style]`,
    supportedTargets: ["en", "fr", "es", "ar", "zh", "ru"],
    translates: true,
    missingKey: () =>
      !process.env.DEEPGRAM_API_KEY
        ? "DEEPGRAM_API_KEY"
        : !process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? "GOOGLE_APPLICATION_CREDENTIALS"
          : null,

    async run({ pcmPath, audioDurationMs, targetLanguage }) {
      const pcm = fs.readFileSync(pcmPath);
      const captions: Caption[] = [];
      const events: StreamingEvent[] = [];
      const t0 = Date.now();
      const proj = projectId();

      const run: StreamingRun = {
        provider: `caption-deepgram-${opts.asrLanguage}-gtranslate`,
        targetLanguage,
        events,
        fullText: "",
        audioDurationMs,
        wallMs: 0,
      };

      // ── Stage 1: stream the audio through the ASR at 1x ──────────────────
      await new Promise<void>((resolve) => {
        const url =
          `wss://api.deepgram.com/v1/listen?model=nova-3` +
          `&language=${encodeURIComponent(opts.asrLanguage)}` +
          `&punctuate=true&smart_format=true` +
          `&encoding=linear16&sample_rate=${SAMPLE_RATE}&channels=1`;
        const ws = new WebSocket(url, {
          headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
        });
        let settled = false;
        const finish = (err?: string) => {
          if (settled) return;
          settled = true;
          if (err) run.error = err;
          try {
            ws.close();
          } catch {}
          resolve();
        };
        const timeout = setTimeout(
          () => finish("asr timeout"),
          audioDurationMs + 120_000,
        );

        ws.on("open", async () => {
          for (let off = 0; off < pcm.length; off += CHUNK_BYTES) {
            const target = t0 + (off / CHUNK_BYTES) * CHUNK_MS;
            const wait = target - Date.now();
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            if (ws.readyState !== 1) return;
            ws.send(pcm.subarray(off, Math.min(off + CHUNK_BYTES, pcm.length)));
          }
          if (ws.readyState === 1)
            ws.send(JSON.stringify({ type: "CloseStream" }));
        });

        ws.on("message", (data) => {
          let m: {
            type?: string;
            is_final?: boolean;
            channel?: {
              alternatives?: Array<{
                transcript?: string;
                words?: Array<{ end?: number }>;
              }>;
            };
          };
          try {
            m = JSON.parse(String(data));
          } catch {
            return;
          }
          if (m.type !== "Results" || !m.is_final) return;
          const alt = m.channel?.alternatives?.[0];
          if (!alt?.transcript?.trim()) return;
          const words = alt.words ?? [];
          const last = words[words.length - 1];
          captions.push({
            text: alt.transcript.trim(),
            audioEndMs: last?.end != null ? last.end * 1000 : Date.now() - t0,
            asrEmitMs: Date.now() - t0,
          });
        });

        ws.on("error", (e) => finish(String((e as Error).message)));
        ws.on("close", () => {
          clearTimeout(timeout);
          finish();
        });
      });

      run.wallMs = Date.now() - t0;
      if (!captions.length) {
        run.error = run.error ?? "no captions produced";
        return run;
      }

      // ── Stage 2: translate captions, timing the MT leg ───────────────────
      // Batched in small groups: a live captioner translates each caption as it
      // lands, so a whole-meeting batch would understate per-caption latency.
      const BATCH = 16;
      const mtLatencies: number[] = [];
      const outputs: string[] = [];
      let chars = 0;
      for (let i = 0; i < captions.length; i += BATCH) {
        const group = captions.slice(i, i + BATCH);
        try {
          const r = await translateBatch(
            group.map((c) => c.text),
            targetLanguage,
            proj,
          );
          // Per-caption MT latency: the batch round trip divided across it,
          // which is what a caption in that batch actually waited.
          const per = r.ms / group.length;
          mtLatencies.push(...group.map(() => per));
          outputs.push(...r.translations);
          chars += group.reduce((a, c) => a + c.text.length, 0);
        } catch (e) {
          run.error = `translate failed: ${(e as Error).message}`;
          break;
        }
      }

      // ── End-to-end caption latency ───────────────────────────────────────
      // Fully observable: (ASR finalization after the word was spoken) plus
      // (the MT round trip). No inference, unlike single-model translators
      // whose output tokens carry no timestamps.
      for (let i = 0; i < outputs.length; i++) {
        const c = captions[i];
        const mt = mtLatencies[i] ?? 0;
        events.push({
          text: outputs[i],
          audioTimeMs: c.audioEndMs,
          emitMs: c.asrEmitMs + mt,
          isFinal: true,
        });
      }

      run.fullText = outputs.join(" ").replace(/\s+/g, " ").trim();
      run.costUsd =
        (audioDurationMs / 3_600_000) * ASR_USD_PER_HOUR +
        (chars / 1_000_000) * MT_USD_PER_M_CHARS;
      return run;
    },
  };
}
