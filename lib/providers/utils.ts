/**
 * Provider utilities — re-exports shared audio helpers from gemini-utils
 * and adds provider-specific helpers.
 */
export { downloadAudioToTemp } from "../gemini-utils";

import fs from "fs";
import { execSync } from "child_process";
import os from "os";
import path from "path";

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  const pattern = path.join(tmpDir, "chunk_%03d.mp3");

  execSync(
    `ffmpeg -i "${inputPath}" -f segment -segment_time ${chunkDurationSecs} -ac 1 -ar 16000 -b:a 48k -reset_timestamps 1 "${pattern}" -y 2>/dev/null`,
  );

  return fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("chunk_"))
    .sort()
    .map((f, i) => ({
      path: path.join(tmpDir, f),
      offsetMs: i * chunkDurationSecs * 1000,
    }));
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
