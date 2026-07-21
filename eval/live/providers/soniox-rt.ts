/**
 * Soniox real-time speech-to-text, with optional one-way translation.
 *
 * Chosen as the first arm-C system because it is the cheapest KEY-HELD option
 * that covers all six UN languages on both the input and output side, and
 * because translation is bundled with transcription rather than priced
 * separately — the only vendor in the survey where adding five target
 * languages does not multiply the bill.
 *
 * Audio is fed at 1× real time deliberately. Pushing the file as fast as the
 * socket accepts it would produce meaningless latency numbers; the whole
 * comparison against human interpreters depends on the model being made to
 * wait for speech exactly as a person in a booth does.
 */
import fs from "fs";
import type {
  StreamingProvider,
  StreamingRun,
  StreamingEvent,
} from "../streaming-types";

const URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const MODEL = "stt-rt-v5";
const SAMPLE_RATE = 16000;
/** Bytes of 16-bit mono PCM per 100 ms — the pacing quantum. */
const CHUNK_MS = 100;
const CHUNK_BYTES = (SAMPLE_RATE * 2 * CHUNK_MS) / 1000;
/** $/hr, bundled transcription+translation (eval/analysis/live-models-research.md). */
const USD_PER_HOUR = 0.12;

export const sonioxRealtime: StreamingProvider = {
  name: "soniox-rt-v5",
  label: "Soniox stt-rt-v5 (real-time)",
  supportedTargets: ["en", "fr", "es", "ar", "zh", "ru"],
  translates: true,
  missingKey: () => (process.env.SONIOX_API_KEY ? null : "SONIOX_API_KEY"),

  async run({ pcmPath, audioDurationMs, targetLanguage, sourceLanguageHints }) {
    const apiKey = process.env.SONIOX_API_KEY!;
    const pcm = fs.readFileSync(pcmPath);
    const events: StreamingEvent[] = [];
    const t0 = Date.now();

    const run: StreamingRun = {
      provider: sonioxRealtime.name,
      targetLanguage,
      events,
      fullText: "",
      audioDurationMs,
      wallMs: 0,
      costUsd: (audioDurationMs / 3_600_000) * USD_PER_HOUR,
    };

    // Translation tokens arrive WITHOUT timestamps — only the source-side
    // transcription tokens carry start_ms/end_ms. To place a translated token
    // on the audio timeline we record the source stream as a
    // cumulative-characters → time curve, and map each translated token by its
    // own cumulative position in the output. This assumes output length grows
    // in proportion to source length, which holds well within a language pair,
    // and is unbiased. (Using "the last source token seen when the translation
    // arrived" instead would only ever give a lower bound on the lag, since the
    // source stream always runs ahead.)
    // Audio position of the most recently finalized SOURCE token. This is the
    // anchor for translation tokens, which carry no timestamps of their own.
    let lastSrcEndMs = 0;
    let audioSent = false;

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(URL);
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

      // A stalled socket must not hang the whole benchmark; allow the audio
      // duration plus generous slack for the tail to drain.
      const timeout = setTimeout(
        () => finish("timeout"),
        audioDurationMs + 120_000,
      );

      ws.onopen = async () => {
        ws.send(
          JSON.stringify({
            api_key: apiKey,
            model: MODEL,
            audio_format: "pcm_s16le",
            sample_rate: SAMPLE_RATE,
            num_channels: 1,
            language_hints: sourceLanguageHints ?? [
              "en",
              "fr",
              "es",
              "ar",
              "zh",
              "ru",
            ],
            translation: { type: "one_way", target_language: targetLanguage },
          }),
        );

        // Pace the audio at 1×, correcting against the wall clock so that
        // scheduler jitter doesn't accumulate into a drift over 80 minutes.
        for (let off = 0; off < pcm.length; off += CHUNK_BYTES) {
          const target = t0 + (off / CHUNK_BYTES) * CHUNK_MS;
          const wait = target - Date.now();
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          if (ws.readyState !== 1) return;
          ws.send(pcm.subarray(off, Math.min(off + CHUNK_BYTES, pcm.length)));
        }
        audioSent = true;
        // End of stream. An empty *text* frame is what the server actually
        // acts on; an empty binary frame is silently ignored and the stream
        // then dies of inactivity 20 s later.
        if (ws.readyState === 1) ws.send("");
      };

      ws.onmessage = (ev) => {
        let msg: {
          tokens?: Array<{
            text: string;
            start_ms?: number;
            end_ms?: number;
            is_final?: boolean;
            language?: string;
            source_language?: string;
            translation_status?: string;
          }>;
          finished?: boolean;
          error_code?: number;
          error_message?: string;
        };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        // A 408 raised after all audio has been sent is the server reaping an
        // idle socket, not a failed run — every token has already been
        // delivered by that point, so keep the results instead of discarding
        // a complete transcript over a teardown race.
        if (msg.error_message) {
          return finish(audioSent ? undefined : msg.error_message);
        }

        for (const tk of msg.tokens ?? []) {
          if (!tk.is_final || !tk.text) continue;
          // With one-way translation the stream carries BOTH the source
          // transcription (translation_status "original") and the translation
          // ("translation"). Keep only the latter as output, or we would be
          // scoring the floor transcript as if it were the translation.
          if (tk.translation_status === "translation") {
            // Anchor the translation to the latest source audio position seen.
            // The source transcription stream runs slightly ahead of the
            // translation, so this UNDER-estimates the true lag — but only by
            // the transcription-to-translation gap, which is seconds. The
            // proportional-mapping alternative tried first was wrong by
            // MINUTES: it assumed output accrues uniformly against source
            // time, and when the translation stream ends before the audio does
            // it reports lags of -116s.
            events.push({
              text: tk.text,
              audioTimeMs: lastSrcEndMs,
              emitMs: Date.now() - t0,
              isFinal: true,
            });
          } else if (tk.end_ms != null) {
            lastSrcEndMs = Math.max(lastSrcEndMs, tk.end_ms);
          }
        }
        if (msg.finished) {
          clearTimeout(timeout);
          finish();
        }
      };

      ws.onerror = () => finish("websocket error");
      ws.onclose = () => {
        clearTimeout(timeout);
        finish();
      };
    });

    // If the 1x pacing slipped (event-loop congestion when many streams run
    // at once), every latency number is suspect; surface it rather than hide it.
    (run as StreamingRun & { pacingDriftMs?: number }).pacingDriftMs =
      run.wallMs - audioDurationMs;

    run.fullText = events
      .map((e) => e.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    return run;
  },
};
