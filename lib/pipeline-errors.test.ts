import { describe, it, expect } from "vitest";
import {
  isTransientPipelineError,
  UnusableAudioError,
} from "@/lib/pipeline-errors";

describe("isTransientPipelineError", () => {
  // Verbatim error messages observed in production (webtv.transcripts
  // error_message / processing_usage_events) — the retry behaviour is pinned
  // to these exact provider wordings, so a reword shows up as a test failure.
  const transient = [
    "AssemblyAI error: Download error, unable to download https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/1_xyz/format/download/protocol/https/flavorParamIds/100",
    "Download failed: 404 Not Found",
    "Request timed out.",
    "timeout exceeded when trying to connect",
    "Connection terminated due to connection timeout",
    "Connection terminated unexpectedly",
    "connect ECONNREFUSED 135.119.130.82:6432",
    "fetch failed",
  ];
  it.each(transient)("retryable: %s", (msg) => {
    expect(isTransientPipelineError(new Error(msg))).toBe(true);
  });

  it("classifies node network error codes as retryable", () => {
    expect(isTransientPipelineError(new Error("read ECONNRESET"))).toBe(true);
    expect(isTransientPipelineError(new Error("socket hang up"))).toBe(true);
    expect(
      isTransientPipelineError(new Error("getaddrinfo ENOTFOUND example.com")),
    ).toBe(true);
  });

  // Intrinsic failures must stay terminal `error` — auto-retrying them would
  // burn paid provider attempts on something a retry cannot fix.
  const intrinsic = [
    'AssemblyAI submit failed: {"error": "Your current account balance is negative"}',
    'Command failed: ffmpeg -i "/tmp/un-audio-123.mp4" -f segment -segment_time 600',
    "No entry found",
    "Pipeline stalled (no progress for >2 hours); auto-marked as error.",
  ];
  it.each(intrinsic)("terminal: %s", (msg) => {
    expect(isTransientPipelineError(new Error(msg))).toBe(false);
  });

  // Unusable/empty/undecodable audio downloads (missing file, HTML error body,
  // ffmpeg decode failure) are retryable by construction — splitAudio and
  // downloadAudioToTemp raise UnusableAudioError instead of an opaque
  // "Command failed: ffmpeg …" (which stays terminal, see above).
  it("classifies UnusableAudioError as retryable", () => {
    expect(
      isTransientPipelineError(
        new UnusableAudioError("ffmpeg failed to split audio"),
      ),
    ).toBe(true);
    expect(
      isTransientPipelineError(
        new UnusableAudioError("Audio input file is empty or too small"),
      ),
    ).toBe(true);
  });

  it("handles non-Error throwables", () => {
    expect(isTransientPipelineError("fetch failed")).toBe(true);
    expect(isTransientPipelineError({ weird: true })).toBe(false);
  });
});
