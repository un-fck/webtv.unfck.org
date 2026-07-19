/**
 * ONE-OFF backfill: realign legacy transcripts that were produced BEFORE we
 * started recording `source_duration_ms` (migration 008). For these rows we
 * have no stored original length, so we detect re-cuts with a heuristic — the
 * last statement's timestamp as a lower bound on the original audio length —
 * and confirm against the current Kaltura duration.
 *
 * ⚠️  This script is temporary. Every transcript created after migration 008
 *     carries `source_duration_ms`, and the recurring app/api/cron/realign job
 *     handles those precisely. Once the legacy backlog is cleared this script
 *     has no rows to act on and can be deleted.
 *
 * Start small, then widen:
 *   tsx scripts/realign-backfill.ts k1k/k1k...            # one asset/entry/kaltura id
 *   tsx scripts/realign-backfill.ts k1k/... k1m/...       # a few ids
 *   tsx scripts/realign-backfill.ts --limit=5           # first 5 detected candidates
 *   tsx scripts/realign-backfill.ts                     # dry-run ALL candidates
 *   tsx scripts/realign-backfill.ts --apply --limit=5   # write offsets for 5
 *   tsx scripts/realign-backfill.ts --apply             # write offsets for all
 *
 * Dry-run by default; --apply writes time_offset_ms. Explicit ids bypass the
 * cheap pre-filter (the precise Kaltura check still runs).
 */
import "../lib/load-env";
import { pool } from "../lib/db";
import {
  realignTranscript,
  fetchCurrentDurations,
  type RealignInput,
  type RealignResult,
} from "../lib/realignment";
import { getKalturaAudioUrl } from "../lib/transcription";
import { bcp47ToKalturaName } from "../lib/languages";
import { fmtHHMMSS } from "../lib/gemini-utils";

const IN_RATE = 0.3 / 1_000_000;
const OUT_RATE = 2.5 / 1_000_000;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const targets = args.filter((a) => !a.startsWith("--"));

interface Row {
  transcript_id: string;
  entry_id: string;
  kaltura_id: string;
  language_code: string | null;
  asset_id: string | null;
  vid_s: number | null;
  aligned_duration_ms: number | null;
  source_duration_ms: number | null;
  last_end_ms: number | null;
  statements: RealignInput["statements"];
}

async function selectCandidates(): Promise<Row[]> {
  // Explicit targets: match any identifier the user might paste (asset_id
  // from a /asset/... URL, entry_id, kaltura_id) and bypass the "legacy only"
  // filter so a row transcribed after migration 008 can still be tested here.
  const where = targets.length
    ? `AND (v.asset_id = ANY($1) OR t.entry_id = ANY($1) OR t.kaltura_id = ANY($1))`
    : "AND t.source_duration_ms IS NULL"; // bulk run: legacy rows only
  const { rows } = await pool.query(
    `WITH x AS (
       SELECT t.transcript_id, t.entry_id, t.kaltura_id, t.language_code,
              v.asset_id, v.duration AS vid_s,
              t.aligned_duration_ms, t.source_duration_ms,
              t.content->'statements' AS statements,
              (SELECT max((s->>'end')::numeric)
                 FROM jsonb_array_elements(t.content->'statements') s) AS last_end_ms,
              -- Keep only the row the app actually serves: latest completed
              -- transcript per video+language (a meeting can be transcribed more
              -- than once). Mirrors getActiveTranscriptByKalturaId.
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(t.kaltura_id, t.entry_id), t.language_code
                ORDER BY t.created_at DESC
              ) AS rn
         FROM webtv.transcripts t
         JOIN webtv.videos v ON v.kaltura_id = t.kaltura_id
        WHERE t.transcription_status = 'completed'
          AND t.start_time IS NULL
          AND t.content ? 'statements'
          AND jsonb_array_length(t.content->'statements') > 0
          ${where}
     )
     SELECT * FROM x WHERE rn = 1 AND last_end_ms IS NOT NULL`,
    targets.length ? [targets] : [],
  );
  const out: Row[] = [];
  for (const r of rows) {
    // Cheap DIRECTIONAL pre-filter: only when stored content overshoots the
    // (possibly stale) scraped duration. Skipped for explicit targets.
    if (!targets.length && r.vid_s != null) {
      const overshootS = Number(r.last_end_ms) / 1000 - Number(r.vid_s);
      if (overshootS < 60) continue;
    }
    out.push(r as Row);
  }
  return out;
}

async function main() {
  const candidates = await selectCandidates();
  const selected = candidates.slice(0, LIMIT);
  console.log(
    `${candidates.length} candidate(s); processing ${selected.length}` +
      `${APPLY ? " (APPLY)" : " (dry-run)"}`,
  );

  // Batch current durations: resolve each candidate's canonical entry, then one
  // Kaltura call per 400. (getKalturaAudioUrl is still called per-row in the
  // core for the audio URL, but the duration is taken from this batch.)
  const entryByTranscript = new Map<string, string>();
  for (const r of selected) {
    try {
      const { entryId } = await getKalturaAudioUrl(
        r.kaltura_id,
        bcp47ToKalturaName(r.language_code || "en"),
      );
      entryByTranscript.set(r.transcript_id, entryId);
    } catch {
      /* leave unresolved; core will fall back */
    }
  }
  const durations = await fetchCurrentDurations([
    ...new Set(entryByTranscript.values()),
  ]);

  const summary: Record<string, number> = {};
  let cumIn = 0;
  let cumOut = 0;
  const flagged: RealignResult[] = [];

  for (const r of selected) {
    const label = r.asset_id || r.entry_id;
    const canonical = entryByTranscript.get(r.transcript_id);
    const currentSec = canonical ? durations.get(canonical) : undefined;
    try {
      const result = await realignTranscript(
        {
          transcriptId: r.transcript_id,
          entryId: r.entry_id,
          kalturaId: r.kaltura_id,
          languageCode: r.language_code,
          statements: r.statements,
          sourceDurationMs: r.source_duration_ms,
          // Prefer what we last reconciled to, then the true source length, then
          // the last-statement-end proxy (legacy rows have only the proxy).
          baselineDurationMs:
            r.aligned_duration_ms ??
            r.source_duration_ms ??
            (Number(r.last_end_ms ?? 0) || null),
        },
        { apply: APPLY, currentSec },
      );
      cumIn += result.tokensIn;
      cumOut += result.tokensOut;
      summary[result.status] = (summary[result.status] ?? 0) + 1;
      const ov =
        result.reductionS != null
          ? `reduction ${result.reductionS.toFixed(0)}s`
          : "";
      const off =
        result.offsetMs != null
          ? `offset ${(result.offsetMs / 1000).toFixed(0)}s`
          : "";
      console.log(
        `[${label}] ${result.status} ${ov} ${off}` +
          `${result.confidence ? ` conf=${result.confidence}` : ""}` +
          `${result.message ? ` — ${result.message}` : ""}`,
      );
      if (result.status === "invalid") flagged.push(result);
    } catch (e) {
      summary["error"] = (summary["error"] ?? 0) + 1;
      console.log(`[${label}] ERROR: ${(e as Error).message}`);
    }
  }

  console.log(`\n==== summary: ${JSON.stringify(summary)} ====`);
  if (flagged.length) {
    console.log(
      `flagged for manual review / full re-transcription (not constant shifts):`,
    );
    for (const f of flagged)
      console.log(
        `  ${f.label}: last ${fmtHHMMSS(f.lastEndSec ?? 0)} vs audio ${fmtHHMMSS(f.currentSec ?? 0)} — ${f.message}`,
      );
  }
  const cost = cumIn * IN_RATE + cumOut * OUT_RATE;
  console.log(
    `==== Gemini tokens: in=${cumIn} out=${cumOut} | est $${cost.toFixed(4)} ====`,
  );
  await pool.end();
  process.exit(0);
}
main();
