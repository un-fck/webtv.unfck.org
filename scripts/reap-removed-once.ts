#!/usr/bin/env tsx
/**
 * One-time backfill: reconcile the whole archive against both removal sources
 * (Kaltura DELETED + WebTV asset-page 404) and soft-disable the backlog.
 *
 * The periodic reaper only looks back 30 days (it rides the 6h sync sweep), so
 * videos that WebTV unpublished before this feature shipped stay visible until
 * someone opens their page. This walks a wide window once to clean them all.
 *
 * Safe and idempotent: it only toggles the per-source removal columns via the
 * same applyRemoval path as the live reaper — never deletes a row or a
 * transcript, never acts on ambiguous (403/5xx/network) responses, and trips
 * the same circuit breaker if WebTV returns 404s en masse.
 *
 * Usage:
 *   tsx scripts/reap-removed-once.ts [--days=N] [--dry-run] [--concurrency=N]
 *     --days         lookback window in days (default 4000 — effectively all)
 *     --dry-run      report what would change without writing
 *     --concurrency  concurrent WebTV GETs (default 8)
 *
 * Note: a full-archive run issues one WebTV GET per candidate (thousands) — it
 * takes several minutes. Re-running is harmless.
 */
import "../lib/load-env";
import { reapRemovedVideos } from "../lib/removed-videos";

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const days = parseInt(flag("days") ?? "4000", 10);
const concurrency = parseInt(flag("concurrency") ?? "8", 10);
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(
    `${dryRun ? "[dry-run] " : ""}Reaping removed videos over the last ${days} days ` +
      `(concurrency ${concurrency})...`,
  );

  const result = await reapRemovedVideos({
    apply: !dryRun,
    lookbackDays: days,
    concurrency,
    onChange: (assetId, removed) =>
      console.log(`  ${removed ? "−" : "+"} ${assetId}`),
  });

  console.log(
    `\nDone: ${result.candidates} candidates, ` +
      `${result.removed} ${dryRun ? "would be " : ""}removed, ` +
      `${result.restored} ${dryRun ? "would be " : ""}restored, ` +
      `${result.errors} errors` +
      (result.webtvAborted
        ? " — WebTV circuit breaker TRIPPED (WebTV verdicts skipped)"
        : ""),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
