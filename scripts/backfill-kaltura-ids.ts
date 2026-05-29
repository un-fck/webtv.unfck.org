#!/usr/bin/env tsx
/**
 * Normalize the three-ID system on legacy transcript/video rows so that
 * transcript lookups hit the cheap path and never need a Kaltura round trip.
 * See docs/webtv-kaltura.md ("Legacy-data gotchas").
 *
 * Three problems this fixes:
 *   0. `videos.kaltura_id IS NULL` on older rows → can't be the canonical FK
 *      target for the transcripts↔videos join.
 *   1. `transcripts.kaltura_id IS NULL` on older rows → `getActiveTranscriptByKalturaId`
 *      always misses → every page load is forced onto the slow Kaltura fallback.
 *   2. `videos.entry_id` holding a stale *pre-redirect* player ID instead of the
 *      true canonical entry → the cached entry can't be trusted, and a transcript
 *      can't be found by the video's entry_id.
 *
 * Phase 0 (no network): populate `videos.kaltura_id` from
 *   `extractKalturaId(asset_id)` for every video row missing it. Aborts on
 *   collisions with the `UNIQUE(videos.kaltura_id)` constraint.
 *
 * Phase 1 (no network): for null-kaltura_id transcripts whose `entry_id`
 *   matches a `videos.entry_id` OR a `videos.kaltura_id` (the non-redirect
 *   case, plus the case where transcripts.entry_id was set to the player ID),
 *   stamp `kaltura_id` from the video's kaltura_id.
 *
 * Phase 2 (Kaltura): the remaining null-kaltura_id transcripts are "orphans" —
 *   their `entry_id` is a canonical entry that matches no `videos.entry_id`
 *   (the redirect case). Resolve candidate videos (player ID → canonical) until
 *   each orphan canonical is matched, then fix `videos.entry_id` to the canonical
 *   value and stamp `transcripts.kaltura_id` with the player ID. Bounded by
 *   concurrency and early-exits once every orphan is matched.
 *
 *   NOTE: as of migration 015, `transcripts.kaltura_id IS NOT NULL` is enforced
 *   and (since migration 016) FK'd to `videos(kaltura_id)`. New rows can't be
 *   in the Phase-2 state, so this phase is now expected to be a no-op. Kept as
 *   a safety net in case those invariants are ever loosened or a future load
 *   produces orphans before constraints are re-enforced.
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

async function phase0(): Promise<number> {
  // Populate videos.kaltura_id wherever it's null. UNIQUE-safe: we pre-check
  // collisions (both within the null set and against already-populated rows)
  // and abort instead of letting a half-applied batch leave the DB inconsistent.
  const { rows } = await pool.query<{ asset_id: string }>(
    `SELECT asset_id FROM webtv.videos WHERE kaltura_id IS NULL`,
  );
  if (rows.length === 0) {
    console.log(`Phase 0${tag}: no videos missing kaltura_id`);
    return 0;
  }

  const proposed = new Map<string, string[]>(); // playerId -> asset_ids
  const unparseable: string[] = [];
  for (const r of rows) {
    const k = extractKalturaId(r.asset_id);
    if (!k) {
      unparseable.push(r.asset_id);
      continue;
    }
    const arr = proposed.get(k) ?? [];
    arr.push(r.asset_id);
    proposed.set(k, arr);
  }
  if (unparseable.length) {
    throw new Error(
      `Phase 0: ${unparseable.length} asset_ids could not be parsed: ${unparseable
        .slice(0, 5)
        .join(", ")}…`,
    );
  }
  const intraDupes = [...proposed.entries()].filter(([, v]) => v.length > 1);
  if (intraDupes.length) {
    throw new Error(
      `Phase 0: ${intraDupes.length} player IDs would be assigned to multiple videos: ${JSON.stringify(intraDupes.slice(0, 3))}…`,
    );
  }
  const { rows: collide } = await pool.query<{
    kaltura_id: string;
    asset_id: string;
  }>(
    `SELECT kaltura_id, asset_id FROM webtv.videos WHERE kaltura_id = ANY($1)`,
    [[...proposed.keys()]],
  );
  if (collide.length) {
    throw new Error(
      `Phase 0: ${collide.length} would collide with already-populated rows: ${JSON.stringify(collide.slice(0, 3))}`,
    );
  }

  let updated = 0;
  if (APPLY) {
    for (const [playerId, [assetId]] of proposed) {
      await pool.query(
        `UPDATE webtv.videos SET kaltura_id = $1, updated_at = NOW()
         WHERE asset_id = $2 AND kaltura_id IS NULL`,
        [playerId, assetId],
      );
      updated++;
    }
  } else {
    updated = proposed.size;
  }
  console.log(`Phase 0${tag}: ${updated} video rows populated`);
  return updated;
}

async function phase1(): Promise<number> {
  // Null-kaltura_id transcripts whose entry_id matches a video by either
  // v.entry_id (canonical-on-both-sides) or v.kaltura_id (player-ID-as-key).
  const { rows } = await pool.query<{
    transcript_id: string;
    kaltura_id: string;
  }>(
    `SELECT t.transcript_id, v.kaltura_id
     FROM webtv.transcripts t
     JOIN webtv.videos v
       ON v.entry_id = t.entry_id OR v.kaltura_id = t.entry_id
     WHERE t.kaltura_id IS NULL AND v.kaltura_id IS NOT NULL`,
  );

  let updated = 0;
  for (const row of rows) {
    if (APPLY) {
      await pool.query(
        `UPDATE webtv.transcripts SET kaltura_id = $1, updated_at = NOW()
         WHERE transcript_id = $2 AND kaltura_id IS NULL`,
        [row.kaltura_id, row.transcript_id],
      );
    }
    updated++;
  }
  console.log(
    `Phase 1${tag}: ${updated} transcript rows stamped from a direct video join`,
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
  console.log(
    `Phase 2${tag}: ${orphans.size} orphan canonical entries to match`,
  );
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
  console.log(
    `  resolving up to ${candidates.length} candidate videos (concurrency ${CONCURRENCY})`,
  );

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
        console.log(
          `  …resolved ${resolved}, matched ${matched}, ${orphans.size} orphans left`,
        );
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
  await phase0();
  await phase1();
  if (!SKIP_RESOLVE) await phase2();

  const remainingT = await pool.query(
    `SELECT COUNT(*) FROM webtv.transcripts WHERE kaltura_id IS NULL`,
  );
  const remainingV = await pool.query(
    `SELECT COUNT(*) FROM webtv.videos WHERE kaltura_id IS NULL`,
  );
  console.log(
    `\nTranscripts still missing kaltura_id: ${remainingT.rows[0].count}` +
      `\nVideos still missing kaltura_id:      ${remainingV.rows[0].count}`,
  );
  await pool.end();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
