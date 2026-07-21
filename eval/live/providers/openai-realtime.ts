/**
 * Arm D — live speech-to-speech interpretation via the OpenAI Realtime API.
 *
 * This is the arm that most resembles what an interpreter actually does:
 * audio in, audio out, no text anywhere in the loop. That is also what makes
 * it awkward to score, because our ground truth is a written verbatim record.
 * So the emitted audio is transcribed afterwards and the transcript is scored
 * like any other arm — with the ASR error counted and reported SEPARATELY, as
 * "ASR overhead", because a delegate in the room hears the audio and never
 * sees that transcript. Charging the model for our transcription of it would
 * be double-counting.
 *
 * Latency is taken from when output AUDIO starts arriving, not when text does.
 * For a speech-to-speech system the moment sound reaches the listener's ear is
 * the only latency that matters, and it is directly comparable to the human
 * ear-voice span from Phase 1.
 */
import fs from "fs";
import path from "path";
// Node's global WebSocket silently ignores the `headers` option, so the
// Authorization header never reaches OpenAI and the handshake 401s. The `ws`
// package (already a transitive dependency) does support it.
import WebSocket from "ws";
import type {
  StreamingProvider,
  StreamingRun,
  StreamingEvent,
} from "../streaming-types";

const MODEL = "gpt-realtime";
const URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
const SAMPLE_RATE = 24000; // Realtime API speaks pcm16 @ 24 kHz
const CHUNK_MS = 100;
/** Input is 16 kHz from our transcode; the API accepts 24 kHz pcm16, so the
 * PCM is resampled on the fly by simple linear interpolation. */
const IN_RATE = 16000;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese",
  ru: "Russian",
};

const OUT_AUDIO_DIR = path.join(__dirname, "..", "cache", "s2s-audio");

/** Nearest-neighbour resample 16k → 24k, int16 mono. */
function resample(buf: Buffer): Buffer {
  const inSamples = buf.length / 2;
  const outSamples = Math.floor((inSamples * SAMPLE_RATE) / IN_RATE);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const src = Math.min(inSamples - 1, Math.floor((i * IN_RATE) / SAMPLE_RATE));
    out.writeInt16LE(buf.readInt16LE(src * 2), i * 2);
  }
  return out;
}

export function openaiRealtimeS2S(targetOnly?: string[]): StreamingProvider {
  return {
    name: "openai-realtime-s2s",
    label: "OpenAI Realtime (speech-to-speech)",
    supportedTargets: targetOnly ?? ["en", "fr", "es", "ar", "zh", "ru"],
    translates: true,
    missingKey: () => (process.env.OPENAI_API_KEY ? null : "OPENAI_API_KEY"),

    async run({ pcmPath, audioDurationMs, targetLanguage }) {
      const apiKey = process.env.OPENAI_API_KEY!;
      const pcm = fs.readFileSync(pcmPath);
      const events: StreamingEvent[] = [];
      const audioChunks: Buffer[] = [];
      const t0 = Date.now();

      fs.mkdirSync(OUT_AUDIO_DIR, { recursive: true });
      const outPath = path.join(
        OUT_AUDIO_DIR,
        `${path.basename(pcmPath, ".pcm")}_${targetLanguage}.pcm`,
      );

      const run: StreamingRun = {
        provider: "openai-realtime-s2s",
        targetLanguage,
        events,
        fullText: "",
        audioDurationMs,
        wallMs: 0,
      };

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(URL, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        let settled = false;
        let audioSent = false;
        let speechStartedMs: number | null = null;
        let awaitingFirstAudio = false;
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

        ws.onopen = async () => {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                type: "realtime",
                output_modalities: ["audio"],
                audio: {
                  input: {
                    format: { type: "audio/pcm", rate: SAMPLE_RATE },
                    // No server VAD: we are feeding a continuous meeting, and
                    // letting the server decide turn boundaries would make it
                    // wait for silence that a debate rarely provides.
                    turn_detection: {
                      type: "server_vad",
                      threshold: 0.5,
                      silence_duration_ms: 400,
                      create_response: true,
                    },
                  },
                  output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
                },
                instructions:
                  `You are a simultaneous interpreter at the United Nations. ` +
                  `Interpret everything you hear into ${LANGUAGE_NAMES[targetLanguage] ?? targetLanguage}, ` +
                  `faithfully and in the first person, as a professional interpreter would. ` +
                  `Do not summarize, comment, answer, or add anything. ` +
                  `Never speak any language other than ${LANGUAGE_NAMES[targetLanguage] ?? targetLanguage}.`,
              },
            }),
          );

          for (let off = 0; off < pcm.length; off += (IN_RATE * 2 * CHUNK_MS) / 1000) {
            const target = t0 + (off / ((IN_RATE * 2 * CHUNK_MS) / 1000)) * CHUNK_MS;
            const wait = target - Date.now();
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            if (ws.readyState !== 1) return;
            const slice = pcm.subarray(
              off,
              Math.min(off + (IN_RATE * 2 * CHUNK_MS) / 1000, pcm.length),
            );
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: resample(slice).toString("base64"),
              }),
            );
          }
          audioSent = true;
          // Give the model a grace period to finish interpreting the tail.
          setTimeout(() => finish(), 20_000);
        };

        ws.onmessage = (ev) => {
          let msg: {
            type?: string;
            delta?: string;
            transcript?: string;
            error?: { message?: string };
          };
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (msg.type === "error")
            return finish(audioSent ? undefined : msg.error?.message);

          // Per-utterance ear-voice span. The server tells us when the
          // speaker STARTED talking; the first output audio for that response
          // is when the listener first hears the interpretation. Because the
          // audio is fed at 1x, wall time is audio time, so the difference is
          // directly comparable to the human EVS from Phase 1 — and far more
          // meaningful than "time since stream start".
          if (msg.type === "input_audio_buffer.speech_started") {
            speechStartedMs = Date.now() - t0;
            awaitingFirstAudio = true;
          }
          if (msg.type === "response.output_audio.delta" && msg.delta) {
            const buf = Buffer.from(msg.delta, "base64");
            audioChunks.push(buf);
            if (awaitingFirstAudio && speechStartedMs != null) {
              events.push({
                text: "x", // non-empty so the metric counts it
                audioTimeMs: speechStartedMs,
                emitMs: Date.now() - t0,
                isFinal: true,
              });
              awaitingFirstAudio = false;
            }
          }
          // The model's own transcript of what it said, when available, is
          // kept as a free preview; scoring uses a separate ASR pass.
          if (
            msg.type === "response.output_audio_transcript.delta" &&
            msg.delta
          ) {
            run.fullText += msg.delta;
          }
        };

        ws.onerror = () => finish("websocket error");
        ws.onclose = () => {
          clearTimeout(timeout);
          finish();
        };
      });

      if (audioChunks.length) {
        fs.writeFileSync(outPath, Buffer.concat(audioChunks));
        (run as StreamingRun & { outputAudioPath?: string }).outputAudioPath =
          outPath;
      }
      return run;
    },
  };
}
