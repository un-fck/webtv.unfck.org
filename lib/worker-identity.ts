import { hostname } from "os";
import { randomUUID } from "crypto";

// Lazily generated once per process. Used as the `worker_id` written to
// `webtv.transcripts` rows this process claims, so the SIGTERM handler and
// heartbeat tick can scope their UPDATEs to "rows I own" — multi-replica
// safe even if Azure scales out (single-replica today).
let cached: string | undefined;

export function currentWorkerId(): string {
  if (cached) return cached;
  cached = `${hostname()}-${randomUUID().slice(0, 8)}`;
  return cached;
}
