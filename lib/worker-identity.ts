import { hostname } from "os";
import { randomUUID } from "crypto";

// Used as the `worker_id` written to `webtv.transcripts` rows this process
// claims, so the SIGTERM handler and heartbeat tick can scope their UPDATEs
// to "rows I own" — multi-replica safe even if Azure scales out
// (single-replica today).
//
// Cached on `globalThis` rather than module scope on purpose. Next.js can
// load a given module twice as separate instances when a dynamic import
// (instrumentation.ts → server-init) ends up in a different chunk than the
// static imports used by route handlers (lib/transcription.ts). Each module
// copy would otherwise have its own `cached` variable and generate a
// different UUID — leading to a worker that can't recognise the rows its
// own pipeline created. globalThis is the one thing both copies share.
declare global {
  // eslint-disable-next-line no-var
  var __unTranscriptsWorkerId: string | undefined;
}

export function currentWorkerId(): string {
  if (!globalThis.__unTranscriptsWorkerId) {
    globalThis.__unTranscriptsWorkerId = `${hostname()}-${randomUUID().slice(0, 8)}`;
  }
  return globalThis.__unTranscriptsWorkerId;
}
