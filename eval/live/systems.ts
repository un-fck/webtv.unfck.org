/**
 * Every pipeline under test, behind one interface, so the runner can treat
 * "a human interpreter plus our ASR" and "a streaming translation model" as
 * the same kind of thing: something that turns a meeting into target-language
 * text, optionally with a latency profile.
 *
 * Quality and latency are deliberately independent here. A system may produce
 * excellent text slowly, or poor text instantly, and collapsing those into one
 * score would hide the trade-off that the whole exercise is about. Systems
 * that have no meaningful latency (the offline arms) return none, rather than
 * a fabricated zero.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { getProvider } from "../../lib/providers/registry";
import { Pool } from "pg";
import type { Cell } from "./matrix";
import type { LatencyMetrics } from "./streaming-types";
import { computeLatency, type StreamingProvider } from "./streaming-types";
import { captionQuality, type CaptionQuality } from "./caption-quality";
import { pivotTranslate, type FloorSegment } from "./translate-pivot";

const FLOOR_CACHE = path.join(__dirname, "..", "interp-lag", "cache", "floor");

export type Arm = "A-human" | "B-pivot" | "C-live-text" | "D-live-audio";

export interface SystemOutput {
  text: string;
  latency?: LatencyMetrics;
  /** Readability of the emitted caption units; absent for offline arms. */
  caption?: CaptionQuality;
  costUsd?: number;
  error?: string;
}

export interface System {
  id: string;
  label: string;
  arm: Arm;
  /** Rough $/audio-hour, for the pre-run budget estimate. */
  usdPerHour: number;
  /** Null if runnable; otherwise the name of the missing env var. */
  missingKey?: () => string | null;
  supports(cell: Cell): boolean;
  produce(cell: Cell, ctx: RunContext): Promise<SystemOutput>;
}

export interface RunContext {
  pool: Pool;
  /** 16 kHz mono PCM of the FLOOR track for this cell's session. */
  floorPcmPath: string;
  floorDurationMs: number;
}

export function loadFloorSegments(kalturaId: string): FloorSegment[] | null {
  const p = path.join(FLOOR_CACHE, `${kalturaId}.json`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8")) as {
    utterances: Array<{ start: number; end: number; text: string }>;
  };
  return d.utterances.map((u) => ({ start: u.start, end: u.end, text: u.text }));
}

// ── Arm A: the incumbent — human interpreter, then our production ASR ───────
export const humanInterpreter: System = {
  id: "A-human",
  label: "Human interpreter → our ASR (incumbent)",
  arm: "A-human",
  usdPerHour: 0,
  supports: () => true,
  async produce(cell, ctx) {
    const r = await ctx.pool.query(
      `SELECT content FROM webtv.transcripts
        WHERE kaltura_id = $1 AND language_code = $2
          AND transcription_status = 'completed'
        ORDER BY updated_at DESC LIMIT 1`,
      [cell.kalturaId, cell.language],
    );
    if (!r.rows.length) return { text: "", error: "no transcript in DB" };
    const c = r.rows[0].content as {
      statements?: Array<{
        paragraphs?: Array<{ sentences?: Array<{ text: string }> }>;
      }>;
    };
    const parts: string[] = [];
    for (const st of c.statements ?? [])
      for (const p of st.paragraphs ?? [])
        for (const s of p.sentences ?? []) parts.push(s.text);
    return { text: parts.join(" ").trim() };
  },
};

// ── Arm B: transcribe the floor, then translate the text ────────────────────
export const pivotSystem: System = {
  id: "B-pivot",
  label: "Floor ASR (Melia) → Azure OpenAI translation",
  arm: "B-pivot",
  // Token-priced, not audio-priced; measured empirically at well under a
  // cent per audio-minute, so it never drives the budget check.
  usdPerHour: 0.15,
  missingKey: () =>
    process.env.AZURE_OPENAI_API_KEY ? null : "AZURE_OPENAI_API_KEY",
  supports: (cell) => loadFloorSegments(cell.kalturaId) !== null,
  async produce(cell) {
    const floor = loadFloorSegments(cell.kalturaId);
    if (!floor) return { text: "", error: "no cached floor transcript" };
    const r = await pivotTranslate(cell.kalturaId, floor, cell.language);
    return { text: r.fullText };
  },
};

/** Wrap a streaming provider (arm C) as a System. */
export function liveTextSystem(
  provider: StreamingProvider,
  usdPerHour: number,
): System {
  return {
    id: `C-${provider.name}`,
    label: `${provider.label} (live)`,
    arm: "C-live-text",
    usdPerHour,
    missingKey: provider.missingKey,
    supports: (cell) => provider.supportedTargets.includes(cell.language),
    async produce(cell, ctx) {
      const run = await provider.run({
        pcmPath: ctx.floorPcmPath,
        audioDurationMs: ctx.floorDurationMs,
        targetLanguage: cell.language,
      });
      if (run.error) return { text: run.fullText, error: run.error };
      return {
        text: run.fullText,
        latency: computeLatency(run),
        caption: captionQuality(run.events, run.audioDurationMs),
        costUsd: run.costUsd,
      };
    },
  };
}

/**
 * Arm D — live speech-to-speech, made scorable.
 *
 * The model emits audio, our ground truth is text, so the output is
 * transcribed afterwards. That ASR pass introduces errors the model is not
 * responsible for: a delegate in the room hears the audio and never sees this
 * transcript. So the ASR is deliberately a STRONG monolingual one (Speechmatics
 * standard, on clean synthetic speech, which is far easier than a noisy
 * conference floor) to keep that overhead as small as possible, and the
 * caveat is carried in the report rather than silently charged to the model.
 */
export function liveAudioSystem(
  provider: StreamingProvider,
  usdPerHour: number,
): System {
  return {
    id: `D-${provider.name}`,
    label: `${provider.label} → post-hoc ASR`,
    arm: "D-live-audio",
    usdPerHour,
    missingKey: provider.missingKey,
    supports: (cell) => provider.supportedTargets.includes(cell.language),
    async produce(cell, ctx) {
      const run = await provider.run({
        pcmPath: ctx.floorPcmPath,
        audioDurationMs: ctx.floorDurationMs,
        targetLanguage: cell.language,
      });
      const audioPath = (run as { outputAudioPath?: string }).outputAudioPath;
      if (!audioPath || !fs.existsSync(audioPath))
        return { text: "", error: run.error ?? "no output audio" };

      // Raw PCM → wav so the ASR vendor can read it.
      const wav = audioPath.replace(/\.pcm$/, ".wav");
      if (!fs.existsSync(wav)) {
        execFileSync(
          "ffmpeg",
          ["-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", audioPath, wav],
          { stdio: "ignore" },
        );
      }
      const asr = getProvider("speechmatics-standard");
      const t = await asr.transcribe("", {
        audioFilePath: wav,
        language: cell.language,
      });
      return {
        text: t.fullText,
        latency: run.events.length ? computeLatency(run) : undefined,
        costUsd: run.costUsd,
      };
    },
  };
}
