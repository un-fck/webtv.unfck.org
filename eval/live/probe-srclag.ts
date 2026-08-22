#!/usr/bin/env tsx
/**
 * Measure the component missing from the Soniox translation-lag figure.
 *
 * Translation tokens carry no timestamps, so they are anchored to the audio
 * position of the most recently finalized SOURCE token. That measures only the
 * gap from "the ASR has finalized this word" to "the translation of it is
 * out" — it silently omits how long the ASR itself took to finalize the word
 * after it was spoken. Total lag against the AUDIO is the sum of the two.
 *
 * This probe measures the ASR half directly: emit wall-clock minus the token's
 * own end_ms, which is exact because source tokens do carry timestamps.
 */
import "../../lib/load-env";
import fs from "fs";

const pcmPath = process.argv[2] ?? "eval/live/cache/audio/1_0fnw1w4w_floor.pcm";
const pcm = fs.readFileSync(pcmPath);
const CHUNK = 3200; // 100 ms of 16 kHz mono s16le

const srcLags: number[] = [];
const transGaps: number[] = [];
let lastSrcEnd = 0;
const t0 = Date.now();

const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
ws.onopen = async () => {
  ws.send(
    JSON.stringify({
      api_key: process.env.SONIOX_API_KEY,
      model: "stt-rt-v5",
      audio_format: "pcm_s16le",
      sample_rate: 16000,
      num_channels: 1,
      language_hints: ["en", "fr", "es", "ar", "zh", "ru"],
      translation: { type: "one_way", target_language: "fr" },
    }),
  );
  for (let o = 0; o < pcm.length; o += CHUNK) {
    const target = t0 + (o / CHUNK) * 100;
    const wait = target - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (ws.readyState !== 1) return;
    ws.send(pcm.subarray(o, Math.min(o + CHUNK, pcm.length)));
  }
  ws.send("");
};

ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data)) as {
    tokens?: Array<{
      text: string;
      end_ms?: number;
      is_final?: boolean;
      translation_status?: string;
    }>;
  };
  const now = Date.now() - t0;
  for (const tk of m.tokens ?? []) {
    if (!tk.is_final || !tk.text) continue;
    if (tk.translation_status === "translation") {
      transGaps.push(now - lastSrcEnd);
    } else if (tk.end_ms != null) {
      srcLags.push(now - tk.end_ms);
      lastSrcEnd = Math.max(lastSrcEnd, tk.end_ms);
    }
  }
};

const pct = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)))] / 1000;
};

ws.onclose = () => {
  console.log(`source (ASR finalization) lag: n=${srcLags.length} median ${pct(srcLags, 50).toFixed(2)}s p90 ${pct(srcLags, 90).toFixed(2)}s`);
  console.log(`translation increment:        n=${transGaps.length} median ${pct(transGaps, 50).toFixed(2)}s p90 ${pct(transGaps, 90).toFixed(2)}s`);
  console.log(`TOTAL end-to-end lag vs audio ≈ ${(pct(srcLags, 50) + pct(transGaps, 50)).toFixed(2)}s median`);
  process.exit(0);
};
