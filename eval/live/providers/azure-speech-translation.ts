/**
 * Azure AI Speech — live speech translation. The engine behind Microsoft
 * Teams' live translated captions, and the stack our own production pipeline
 * already uses for fr/es/ar/ru transcription.
 *
 * Implemented against the raw WebSocket protocol rather than the Speech SDK,
 * to avoid adding a dependency to the repo for an eval-only provider. The
 * protocol is Microsoft's own framing and is the fiddly part:
 *
 *   - text frames are `Path: <name>\r\nX-RequestId: ...\r\n\r\n<json>`
 *   - binary frames are [2-byte big-endian header length][ascii headers][audio]
 *   - all frames of one utterance share a single 32-hex X-RequestId
 *   - the audio stream is WAV, so a streaming RIFF header with unknown length
 *     is sent first and raw PCM chunks follow
 *   - an empty audio frame ends the turn
 *
 * Unlike the token-streaming translators, Azure emits whole *phrases* with an
 * Offset and Duration in 100-ns ticks, so caption latency is exactly
 * measurable: emission wall-clock minus the phrase's own end position.
 *
 * The architectural catch is the same one every captioning stack has: `from`
 * is a single fixed source language. On a multilingual UN floor whatever it is
 * set to is wrong for part of the meeting — which is precisely the limitation
 * platform auto-captioning has, so it is left in rather than engineered around.
 */
import fs from "fs";
import crypto from "crypto";
import WebSocket from "ws";
import type {
  StreamingProvider,
  StreamingRun,
  StreamingEvent,
} from "../streaming-types";

const REGION = "northeurope";
const SAMPLE_RATE = 16000;
const CHUNK_MS = 100;
const CHUNK_BYTES = (SAMPLE_RATE * 2 * CHUNK_MS) / 1000;
/** Azure Speech translation, per audio hour (verified via retail pricing). */
const USD_PER_HOUR = 2.5;

/** BCP-47 source tags Azure expects for `from`. */
const FROM_TAG: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  ar: "ar-EG",
  zh: "zh-CN",
  ru: "ru-RU",
};

/** A streaming RIFF header: lengths are 0xFFFFFFFF because they are unknown. */
function wavHeader(): Buffer {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0);
  b.writeUInt32LE(0xffffffff, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(SAMPLE_RATE, 24);
  b.writeUInt32LE(SAMPLE_RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(0xffffffff, 40);
  return b;
}

export function azureSpeechTranslation(opts: {
  /** Fixed source language. See the note above about multilingual floors. */
  sourceLanguage: string;
}): StreamingProvider {
  return {
    name: `azure-speech-translation-${opts.sourceLanguage}`,
    label: `Azure AI Speech translation (from ${opts.sourceLanguage})`,
    supportedTargets: ["en", "fr", "es", "ar", "zh", "ru"],
    translates: true,
    missingKey: () =>
      process.env.AZURE_SPEECH_KEY ? null : "AZURE_SPEECH_KEY",

    async run({ pcmPath, audioDurationMs, targetLanguage }) {
      const from = FROM_TAG[opts.sourceLanguage] ?? opts.sourceLanguage;
      // Azure rejects a translation request whose target equals its source.
      if (targetLanguage === opts.sourceLanguage) {
        return {
          provider: `azure-speech-translation-${opts.sourceLanguage}`,
          targetLanguage,
          events: [],
          fullText: "",
          audioDurationMs,
          wallMs: 0,
          error: "target equals source language",
        };
      }

      const pcm = fs.readFileSync(pcmPath);
      const events: StreamingEvent[] = [];
      const t0 = Date.now();
      const rid = crypto.randomBytes(16).toString("hex");
      const stamp = () => new Date().toISOString();

      const textFrame = (path: string, body: string) =>
        `Path: ${path}\r\nX-RequestId: ${rid}\r\nX-Timestamp: ${stamp()}\r\n` +
        `Content-Type: application/json\r\n\r\n${body}`;

      const audioFrame = (chunk: Buffer) => {
        const h =
          `Path: audio\r\nX-RequestId: ${rid}\r\nX-Timestamp: ${stamp()}\r\n` +
          `Content-Type: audio/x-wav\r\n\r\n`;
        const hb = Buffer.from(h, "ascii");
        const len = Buffer.alloc(2);
        len.writeUInt16BE(hb.length, 0);
        return Buffer.concat([len, hb, chunk]);
      };

      const run: StreamingRun = {
        provider: `azure-speech-translation-${opts.sourceLanguage}`,
        targetLanguage,
        events,
        fullText: "",
        audioDurationMs,
        wallMs: 0,
        costUsd: (audioDurationMs / 3_600_000) * USD_PER_HOUR,
      };

      await new Promise<void>((resolve) => {
        const url =
          `wss://${REGION}.s2s.speech.microsoft.com/speech/translation/` +
          `cognitiveservices/v1?from=${encodeURIComponent(from)}` +
          `&to=${encodeURIComponent(targetLanguage)}`;
        const ws = new WebSocket(url, {
          headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY! },
        });
        let settled = false;
        const finish = (err?: string) => {
          if (settled) return;
          settled = true;
          if (err) run.error = err;
          run.wallMs = Date.now() - t0;
          try {
            ws.close();
          } catch {}
          resolve();
        };
        const timeout = setTimeout(
          () => finish("timeout"),
          audioDurationMs + 180_000,
        );

        ws.on("open", async () => {
          ws.send(
            textFrame(
              "speech.config",
              JSON.stringify({
                context: {
                  system: { version: "1.0" },
                  os: { platform: "Node", name: "un-eval", version: "1.0" },
                  device: { manufacturer: "x", model: "x", version: "1.0" },
                },
              }),
            ),
          );
          ws.send(audioFrame(wavHeader()));
          for (let off = 0; off < pcm.length; off += CHUNK_BYTES) {
            const target = t0 + (off / CHUNK_BYTES) * CHUNK_MS;
            const wait = target - Date.now();
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            if (ws.readyState !== 1) return;
            ws.send(
              audioFrame(pcm.subarray(off, Math.min(off + CHUNK_BYTES, pcm.length))),
            );
          }
          if (ws.readyState === 1) ws.send(audioFrame(Buffer.alloc(0)));
        });

        ws.on("message", (data) => {
          const s = String(data);
          const i = s.indexOf("\r\n\r\n");
          if (i < 0) return;
          const path = (s.slice(0, i).match(/Path:\s*(\S+)/) ?? [])[1];
          const body = s.slice(i + 4);

          if (path === "translation.phrase") {
            try {
              const j = JSON.parse(body) as {
                Offset?: number;
                Duration?: number;
                Translation?: { Translations?: Array<{ Text?: string }> };
              };
              const text = j.Translation?.Translations?.[0]?.Text;
              if (!text) return;
              // Offset/Duration are 100-nanosecond ticks.
              const endMs = ((j.Offset ?? 0) + (j.Duration ?? 0)) / 10_000;
              events.push({
                text,
                audioTimeMs: endMs,
                emitMs: Date.now() - t0,
                isFinal: true,
              });
            } catch {
              /* malformed frame — skip rather than abort the run */
            }
          }
          if (path === "turn.end") {
            clearTimeout(timeout);
            finish();
          }
        });

        ws.on("error", (e) => finish(String((e as Error).message)));
        ws.on("close", () => {
          clearTimeout(timeout);
          finish();
        });
      });

      run.fullText = events
        .map((e) => e.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return run;
    },
  };
}
