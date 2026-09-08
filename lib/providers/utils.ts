/**
 * Provider utilities — re-exports shared audio helpers from gemini-utils
 * and adds provider-specific helpers.
 */
export { downloadAudioToTemp } from "../gemini-utils";

import fs from "fs";
import { execSync, execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { UnusableAudioError } from "../pipeline-errors";

// Below this many bytes an "audio" file cannot be real meeting audio — it is an
// empty/truncated download or an HTML/JSON error body saved with an audio name.
const MIN_PLAUSIBLE_AUDIO_BYTES = 1024;

/**
 * Normalize a pipeline language code into an ISO code an STT API will accept.
 * "floor" is the UN original mixed-language channel, not an ISO code, so it
 * maps to `undefined` (let the provider auto-detect). Providers that have their
 * own meaning for "floor" (e.g. Gemini's special prompt) should not use this.
 */
export function apiLanguage(language?: string): string | undefined {
  return language && language !== "floor" ? language : undefined;
}

/** Format milliseconds as HH:MM:SS */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Split an audio file into fixed-duration chunks using ffmpeg (mono 16kHz MP3) */
export function splitAudio(
  inputPath: string,
  chunkDurationSecs: number,
  tmpPrefix: string = "chunks-",
): { path: string; offsetMs: number }[] {
  validateAudioInput(inputPath);
  const inputSize = fs.statSync(inputPath).size;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  const pattern = path.join(tmpDir, "chunk_%03d.mp3");

  // Capture ffmpeg's stderr (don't discard it with `2>/dev/null`) so a decode
  // failure carries a diagnostic tail instead of an opaque "Command failed".
  // `-loglevel error` keeps stderr to just the error lines.
  try {
    execSync(
      `ffmpeg -hide_banner -loglevel error -i "${inputPath}" -f segment -segment_time ${chunkDurationSecs} -ac 1 -ar 16000 -b:a 48k -reset_timestamps 1 "${pattern}" -y`,
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr;
    const tail = (stderr ? stderr.toString() : "")
      .trim()
      .split("\n")
      .slice(-8)
      .join("\n");
    throw new UnusableAudioError(
      `ffmpeg failed to split audio (input ${inputSize} bytes at ${inputPath}); ` +
        `the file is likely undecodable — truncated, not-yet-available, or a ` +
        `non-audio body${tail ? `. ffmpeg stderr:\n${tail}` : ""}`,
      { cause: err },
    );
  }

  const chunks = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("chunk_"))
    .sort()
    .map((f, i) => ({
      path: path.join(tmpDir, f),
      offsetMs: i * chunkDurationSecs * 1000,
    }));

  if (chunks.length === 0) {
    throw new UnusableAudioError(
      `ffmpeg produced no chunks from ${inputPath} (${inputSize} bytes); ` +
        `the input is likely empty or undecodable`,
    );
  }

  return chunks;
}

function validateAudioInput(inputPath: string): void {
  // Validate the input before handing it to ffmpeg. A missing / empty /
  // truncated file (or an HTML error body saved with a .mp4 name) means the
  // download didn't actually produce usable audio — retryable, not a permanent
  // failure. Throwing UnusableAudioError routes it to `interrupted`.
  if (!fs.existsSync(inputPath)) {
    throw new UnusableAudioError(
      `Audio input file does not exist: ${inputPath} (download likely failed)`,
    );
  }
  const inputSize = fs.statSync(inputPath).size;
  if (inputSize < MIN_PLAUSIBLE_AUDIO_BYTES) {
    throw new UnusableAudioError(
      `Audio input file is empty or too small to be valid audio ` +
        `(${inputSize} bytes): ${inputPath} ` +
        `(download likely failed or returned an error body)`,
    );
  }
}

/** Asynchronous counterpart to splitAudio, so long splits do not starve heartbeats. */
export async function splitAudioAsync(
  inputPath: string,
  chunkDurationSecs: number,
  tmpPrefix = "chunks-",
): Promise<{ path: string; offsetMs: number }[]> {
  validateAudioInput(inputPath);
  if (!Number.isFinite(chunkDurationSecs) || chunkDurationSecs <= 0) {
    throw new Error("Chunk duration must be positive");
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  try {
    await promisify(execFile)("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkDurationSecs),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "48k",
      "-reset_timestamps",
      "1",
      "-segment_list",
      path.join(tmpDir, "segments.csv"),
      "-segment_list_type",
      "csv",
      path.join(tmpDir, "chunk_%03d.mp3"),
      "-y",
    ]);
    // MP3 segments end on packet boundaries, which need not be exact multiples
    // of the requested interval. Use the muxer's actual start times for seeking.
    // Filenames are generated here and contain no CSV-special characters.
    const chunks = fs
      .readFileSync(path.join(tmpDir, "segments.csv"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, start] = line.split(",");
        const seconds = Number(start);
        if (
          !/^chunk_\d+\.mp3$/.test(name) ||
          !start?.trim() ||
          !Number.isFinite(seconds) ||
          seconds < 0
        ) {
          throw new Error("Invalid ffmpeg segment manifest");
        }
        return {
          path: path.join(tmpDir, name),
          offsetMs: Math.round(seconds * 1000),
        };
      });
    if (!chunks.length) throw new Error("ffmpeg produced no audio chunks");
    return chunks;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const stderr = (error as { stderr?: string }).stderr;
    throw new UnusableAudioError(
      `ffmpeg failed to split audio at ${inputPath}${stderr ? `: ${stderr.trim().split("\n").slice(-8).join("\n")}` : ""}`,
      { cause: error },
    );
  }
}

/** Run an async function over items with a concurrency limit */
export async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}
