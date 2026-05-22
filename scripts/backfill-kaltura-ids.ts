#!/usr/bin/env tsx
/**
 * Normalize the three-ID system on legacy transcript/video rows so that
 * transcript lookups hit the cheap path and never need a Kaltura round trip.
 * See docs/webtv-kaltura.md ("Legacy-data gotchas").
 *
 * Two problems this fixes:
 *   1. `transcripts.kaltura_id IS NULL` on older rows → `getActiveTranscriptByKalturaId`
 *      always misses → every page load is forced onto the slow Kaltura fallback.
 *   2. `videos.entry_id` holding a stale *pre-redirect* player ID instead of the
 *      true canonical entry → the cached entry can't be trusted, and a transcript
 *      can't be found by the video's entry_id.
 *
 * Phase 1 (no network): for null-kaltura_id transcripts whose `entry_id` already
 *   matches a `videos.entry_id` (the non-redirect case), stamp `kaltura_id` from
 *   `extractKalturaId(asset_id)`.
 *
 * Phase 2 (Kaltura): the remaining null-kaltura_id transcripts are "orphans" —
 *   their `entry_id` is a canonical entry that matches no `videos.entry_id`
 *   (the redirect case). Resolve candidate videos (player ID → canonical) until
 *   each orphan canonical is matched, then fix `videos.entry_id` to the canonical
 *   value and stamp `transcripts.kaltura_id` with the player ID. Bounded by
 *   concurrency and early-exits once every orphan is matched.
 *
 * Idempotent: re-running skips rows already populated. Writes nothing unless
 * `--apply` is passed.
 *
 * Usage:
 *   tsx scripts/backfill-kaltura-ids.ts            # dry run (default)
 *   tsx scripts/backfill-kaltura-ids.ts --apply    # write changes
 *   tsx scripts/backfill-kaltura-ids.ts --apply --skip-resolve   # phase 1 only
 *   tsx scripts/backfill-kaltura-ids.ts --apply --concurrency=8 --limit=2000
 */
import "../lib/load-env";
import { pool } from "../lib/db";
import { extractKalturaId } from "../lib/kaltura";
import { resolveEntryIdFromKaltura } from "../lib/kaltura-helpers";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SKIP_RESOLVE = args.includes("--skip-resolve");
const CONCURRENCY = Number(
  args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "6",
);
const LIMIT = Number(
  args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0", // 0 = no cap
);

const tag = APPLY ? "" : " [dry run — no writes]";

async function phase1(): Promise<number> {
  // Null-kaltura_id transcripts whose entry_id already matches a video row.
  const { rows } = await pool.query<{
    transcript_id: string;
    entry_id: string;
    asset_id: string;
  }>(
    `SELECT t.transcript_id, t.entry_id, v.asset_id
     FROM webtv.transcripts t
     JOIN webtv.videos v ON v.entry_id = t.entry_id
     WHERE t.kaltura_id IS NULL`,
  );

  let updated = 0;
  let unparseable = 0;
  for (const row of rows) {
    const playerId = extractKalturaId(row.asset_id);
    if (!playerId) {
      unparseable++;
      continue;
    }
    if (APPLY) {
      await pool.query(
        `UPDATE webtv.transcripts SET kaltura_id = $1, updated_at = NOW()
         WHERE transcript_id = $2 AND kaltura_id IS NULL`,
        [playerId, row.transcript_id],
      );
    }
    updated++;
  }
  console.log(
    `Phase 1${tag}: ${updated} transcript rows stamped from a direct video join` +
      (unparseable ? ` (${unparseable} had no parseable player ID)` : ""),
  );
  return updated;
}

async function phase2(): Promise<void> {
  // Orphan canonical entries: null-kaltura_id transcripts with no matching video.
  const orphanRows = await pool.query<{ entry_id: string }>(
    `SELECT DISTINCT t.entry_id
     FROM webtv.transcripts t
     LEFT JOIN webtv.videos v ON v.entry_id = t.entry_id
     WHERE t.kaltura_id IS NULL AND v.entry_id IS NULL`,
  );
  const orphans = new Set(orphanRows.rows.map((r) => r.entry_id));
  console.log(`Phase 2${tag}: ${orphans.size} orphan canonical entries to match`);
  if (orphans.size === 0) return;

  // Candidate videos: those whose entry_id matches no transcript (so plausibly a
  // stale/redirected row). Recent first — recent meetings are likelier transcribed.
  const candRes = await pool.query<{ asset_id: string; entry_id: string }>(
    `SELECT v.asset_id, v.entry_id
     FROM webtv.videos v
     WHERE NOT EXISTS (
       SELECT 1 FROM webtv.transcripts t WHERE t.entry_id = v.entry_id
     )
     ORDER BY v.date DESC NULLS LAST
     ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ""}`,
  );
  const candidates = candRes.rows;
  console.log(`  resolving up to ${candidates.length} candidate videos (concurrency ${CONCURRENCY})`);

  let resolved = 0;
  let matched = 0;
  let errors = 0;
  let stop = false;
  let next = 0;

  async function worker() {
    while (!stop) {
      const i = next++;
      if (i >= candidates.length) return;
      const video = candidates[i];
      const playerId = extractKalturaId(video.asset_id);
      if (!playerId) continue;

      let canonical: string | null = null;
      try {
        canonical = await resolveEntryIdFromKaltura(playerId);
      } catch {
        errors++;
        continue;
      }
      resolved++;
      if (resolved % 250 === 0) {
        console.log(`  …resolved ${resolved}, matched ${matched}, ${orphans.size} orphans left`);
      }
      if (!canonical || !orphans.has(canonical)) continue;

      // Found a stale-redirected video for one of the orphan canonicals.
      if (APPLY) {
        await pool.query(
          `UPDATE webtv.videos SET entry_id = $1, updated_at = NOW() WHERE asset_id = $2`,
          [canonical, video.asset_id],
        );
        await pool.query(
          `UPDATE webtv.transcripts SET kaltura_id = $1, updated_at = NOW()
           WHERE entry_id = $2 AND kaltura_id IS NULL`,
          [playerId, canonical],
        );
      }
      matched++;
      orphans.delete(canonical);
      console.log(
        `  ✓ ${video.asset_id}: player ${playerId} → canonical ${canonical}` +
          ` (was videos.entry_id=${video.entry_id})`,
      );
      if (orphans.size === 0) {
        stop = true;
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker()),
  );

  console.log(
    `Phase 2${tag} done: resolved ${resolved} videos, matched ${matched} orphans, ${errors} resolution errors`,
  );
  if (orphans.size > 0) {
    console.log(
      `  ${orphans.size} orphans still unmatched (their video may be absent from the DB):`,
      [...orphans].slice(0, 20),
    );
  }
}

async function main() {
  console.log(
    APPLY
      ? "Applying Kaltura-ID backfill…"
      : "Dry run — pass --apply to write. Counts below reflect what WOULD change.",
  );
  await phase1();
  if (!SKIP_RESOLVE) await phase2();

  const remaining = await pool.query(
    `SELECT COUNT(*) FROM webtv.transcripts WHERE kaltura_id IS NULL`,
  );
  console.log(`\nTranscripts still missing kaltura_id: ${remaining.rows[0].count}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
