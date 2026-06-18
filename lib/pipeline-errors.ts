// Transient = the input wasn't fetchable or the network flaked — retrying
// later can succeed (Kaltura still converting audio after the live→VOD flip,
// provider unable to download the file, request timeouts). The pipeline
// releases these as `interrupted` so the process-scheduled picker retries
// them under the MAX_INTERRUPTED_RETRIES cap; intrinsic failures stay
// `error` and need a human.
export function isTransientPipelineError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return [
    "download error",
    "unable to download",
    "download failed",
    "404",
    "timed out",
    "timeout",
    "fetch failed",
    "econnreset",
    "econnrefused",
    "etimedout",
    "enotfound",
    "socket hang up",
    // pg / pg-pool: socket killed by PgBouncer/Azure LB/NAT idle reap.
    // The "timeout" patterns above already cover "Connection terminated due
    // to connection timeout", but the bare "unexpectedly" wording does not.
    "connection terminated unexpectedly",
  ].some((pattern) => msg.includes(pattern));
}
