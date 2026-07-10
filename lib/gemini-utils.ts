/**
 * Shared Gemini API and audio utilities.
 *
 * Used by both gemini-transcription.ts (transcription pipeline) and
 * pv-alignment.ts (PV document alignment). Consolidated to avoid
 * duplicating upload/download/chunking logic across files.
 */
import fs from "fs";
import https from "https";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { UnusableAudioError } from "./pipeline-errors";

const execFileAsync = promisify(execFile);

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
export const GEMINI_MODEL = "gemini-3-flash-preview";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com";

// Audio longer than this is processed in chunks (10 minutes — empirically the
// reliable limit before Gemini timestamp hallucination becomes common).
export const CHUNK_THRESHOLD_SECONDS = 10 * 60;
export const CHUNK_DURATION_SECONDS = 10 * 60;

// ── HTTP helper ──────────────────────────────────────────────────────

export function httpsPostJson(
  url: string,
  body: object,
  timeoutMs = 600_000,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Gemini request timeout"));
    });
    req.write(data);
    req.end();
  });
}

// ── Gemini Files API ─────────────────────────────────────────────────

export async function uploadFileToGemini(
  filePath: string,
  displayPrefix = "un-audio",
): Promise<{ name: string; uri: string }> {
  const fileSize = fs.statSync(filePath).size;
  const fileData = fs.readFileSync(filePath);

  const startRes = await fetch(
    `${GEMINI_BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": "audio/mp4",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: { displayName: `${displayPrefix}-${Date.now()}` },
      }),
    },
  );
  if (!startRes.ok)
    throw new Error(
      `Gemini upload start failed ${startRes.status}: ${await startRes.text()}`,
    );
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No Gemini upload URL returned");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileData,
  });
  if (!uploadRes.ok)
    throw new Error(
      `Gemini file upload failed ${uploadRes.status}: ${await uploadRes.text()}`,
    );
  const result = (await uploadRes.json()) as {
    file: { name: string; uri: string };
  };
  return result.file;
}

export async function waitForGeminiFile(
  name: string,
  verbose = false,
): Promise<void> {
  for (let i = 0; ; i++) {
    const res = await fetch(
      `${GEMINI_BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`,
    );
    const file = (await res.json()) as { state: string };
    if (file.state === "ACTIVE") return;
    if (file.state === "FAILED")
      throw new Error("Gemini file processing failed");
    if (verbose && i % 6 === 5)
      console.log(`  [Gemini] File still processing... (${(i + 1) * 5}s)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export async function deleteGeminiFile(name: string): Promise<void> {
  await fetch(`${GEMINI_BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`, {
    method: "DELETE",
  }).catch(() => {});
}

// ── Timestamp utilities ──────────────────────────────────────────────

/** Format total seconds as HH:MM:SS */
export function fmtHHMMSS(totalSec: number): string {
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(totalSec % 60)).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Parse HH:MM:SS (or MM:SS) to seconds. Handles fractional seconds. */
export function parseHHMMSSToSeconds(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/** Parse HH:MM:SS (or MM:SS) to milliseconds. Handles fractional seconds. */
export function parseHHMMSSToMs(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(":");
  if (parts.length === 3) {
    return (
      (Number(parts[0]) * 3600 + Number(parts[1]) * 60 + parseFloat(parts[2])) *
      1000
    );
  }
  if (parts.length === 2) {
    return (Number(parts[0]) * 60 + Number(parts[1])) * 1000;
  }
  return 0;
}

// ── JSON extraction ──────────────────────────────────────────────────

/** Extract the first top-level {...} JSON object from a free-text response. */
export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("Unterminated JSON object in response");
}

// ── Audio utilities ──────────────────────────────────────────────────

/** Download audio from a URL to a temp file. Returns the temp file path. */
export async function downloadAudioToTemp(
  audioUrl: string,
  label = "",
): Promise<string> {
  const tag = label ? `[${label}] ` : "";
  console.log(`  ${tag}Downloading audio...`);
  const res = await fetch(audioUrl, { redirect: "follow" });
  // A non-OK status (Kaltura still converting → 404, a 5xx, etc.), an
  // error/HTML body, or an empty/truncated payload all mean the audio isn't
  // usable *yet* — a retryable condition, not a permanent failure. Surface it
  // as UnusableAudioError so the pipeline flips the row to `interrupted`
  // (auto-retried) instead of hard `error`.
  if (!res.ok)
    throw new UnusableAudioError(
      `Download failed: ${res.status} ${res.statusText} for ${audioUrl}`,
    );
  const contentType = res.headers.get("content-type") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1024)
    throw new UnusableAudioError(
      `Downloaded audio is empty or too small (${buffer.length} bytes, ` +
        `content-type "${contentType}") from ${audioUrl} — ` +
        `not yet available or an error body`,
    );
  if (/^\s*(text\/|application\/(json|xml|xhtml))/i.test(contentType))
    throw new UnusableAudioError(
      `Downloaded a non-audio body (content-type "${contentType}", ` +
        `${buffer.length} bytes) from ${audioUrl} — likely an error page, ` +
        `not audio`,
    );
  // Integrity: a connection reset mid-body can hand back fewer bytes than the
  // server promised without fetch() throwing. A truncated MP4 loses its moov
  // atom (stored at the end of the file), so ffmpeg would later fail on it
  // with an opaque decode error — catch the shortfall here, where we can
  // still name the cause.
  // (Skipped if the response was content-encoded: fetch() decompresses the
  // body, so byte counts would legitimately differ from Content-Length.)
  const contentLength = Number(res.headers.get("content-length"));
  if (
    !res.headers.get("content-encoding") &&
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    buffer.length !== contentLength
  )
    throw new UnusableAudioError(
      `Downloaded audio is truncated: got ${buffer.length} of ` +
        `${contentLength} bytes from ${audioUrl}`,
    );
  const tmpPath = path.join(os.tmpdir(), `un-audio-${Date.now()}.mp4`);
  fs.writeFileSync(tmpPath, buffer);
  console.log(
    `  ${tag}Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
  );
  return tmpPath;
}

/**
 * Duration of an audio file in seconds, via ffprobe. Fails CLOSED: throws
 * instead of returning a fallback. Both callers use the result to decide
 * whether the audio needs chunking, so a silent fallback of 0 reads as
 * "short file" and disables chunking entirely — sending arbitrarily long
 * audio to Gemini in one call, which degrades timestamps past ~10 minutes
 * and can truncate at the output-token cap while still parsing as valid
 * JSON (a transcript marked completed with its tail missing). That is
 * exactly what the ffprobe binary being absent from the production image
 * caused. The "Audio duration probe failed" prefix is matched by
 * isTransientPipelineError, so the row retries as `interrupted` (a
 * truncated download that ffprobe rejects is genuinely transient) instead
 * of hard-failing.
 */
export async function getAudioDurationSeconds(
  filePath: string,
): Promise<number> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]));
  } catch (err) {
    throw new Error(
      `Audio duration probe failed: ffprobe error on ${path.basename(filePath)}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `Audio duration probe failed: ffprobe reported ${JSON.stringify(
        stdout.trim(),
      )} for ${path.basename(filePath)}`,
    );
  }
  return seconds;
}

/** Extract a time slice of audio using ffmpeg. Returns path to chunk file. */
export async function extractAudioChunk(
  filePath: string,
  startSeconds: number,
  durationSeconds: number,
  prefix = "chunk",
): Promise<string> {
  const chunkPath = path.join(
    os.tmpdir(),
    `un-${prefix}-${Date.now()}-${startSeconds}.mp4`,
  );
  await execFileAsync("ffmpeg", [
    "-i",
    filePath,
    "-ss",
    String(startSeconds),
    "-t",
    String(durationSeconds),
    "-c",
    "copy",
    "-y",
    chunkPath,
  ]);
  return chunkPath;
}
