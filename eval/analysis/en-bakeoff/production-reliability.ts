/**
 * Reliability from PRODUCTION, not from the eval run.
 *
 * The eval can only attempt ~50 transcriptions per arm. With 0 observed failures
 * that bounds the failure rate at ~6.6% (Wilson upper, n=54) — which cannot
 * distinguish "fine" from "as bad as the 2-in-26 we saw during the §15 sweep".
 * Bounding below 1% needs ~300 attempts.
 *
 * `webtv.processing_usage_events` already holds every real production call:
 * provider, stage, status, timing. AssemblyAI has carried ~96% of production
 * English for months and azure-llm-speech has carried fr/es/ar/ru since
 * 2026-07-14. That is a denominator that comes from the source rather than from
 * this experiment.
 *
 * READ-ONLY. No writes, no DDL.
 */
import "../../../lib/load-env";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Wilson score interval — correct at small n and at p near 0, unlike normal approx. */
function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

async function q(sql: string, params: unknown[] = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

(async () => {
  console.log("=== columns of webtv.processing_usage_events ===");
  const cols = await q(
    `select column_name, data_type from information_schema.columns
     where table_schema='webtv' and table_name='processing_usage_events' order by ordinal_position`,
  );
  console.log(cols.map((c: any) => c.column_name).join(", "));

  console.log("\n=== distinct provider / stage / status ===");
  const combos = await q(
    `select provider, stage, status, count(*) n,
            min(created_at)::date first_seen, max(created_at)::date last_seen
     from webtv.processing_usage_events
     group by 1,2,3 order by n desc limit 40`,
  );
  for (const r of combos as any[])
    console.log(
      `  ${String(r.provider).padEnd(22)} ${String(r.stage).padEnd(22)} ${String(r.status).padEnd(10)} n=${String(r.n).padStart(7)}  ${r.first_seen} → ${r.last_seen}`,
    );

  console.log("\n=== TRANSCRIPTION reliability by provider (all time) ===");
  const rel = await q(
    `select provider,
            count(*) attempts,
            count(*) filter (where status <> 'success') failures,
            count(*) filter (where status = 'success') successes
     from webtv.processing_usage_events
     where stage = 'transcribing' and operation = 'transcribe'
     group by 1 order by attempts desc`,
  );
  console.log(
    `  ${"provider".padEnd(30)} ${"attempts".padStart(9)} ${"fail".padStart(6)} ${"rate".padStart(8)}   95% Wilson CI`,
  );
  for (const r of rel as any[]) {
    const n = Number(r.attempts);
    const k = Number(r.failures);
    const [lo, hi] = wilson(k, n);
    console.log(
      `  ${String(r.provider).padEnd(30)} ${String(n).padStart(9)} ${String(k).padStart(6)} ${((100 * k) / n).toFixed(3).padStart(7)}%   [${(100 * lo).toFixed(3)}%, ${(100 * hi).toFixed(3)}%]`,
    );
  }

  console.log("\n=== same, restricted to the last 90 days ===");
  const rel90 = await q(
    `select provider,
            count(*) attempts,
            count(*) filter (where status <> 'success') failures
     from webtv.processing_usage_events
     where stage = 'transcribing' and operation = 'transcribe'
       and created_at > now() - interval '90 days'
     group by 1 order by attempts desc`,
  );
  for (const r of rel90 as any[]) {
    const n = Number(r.attempts);
    const k = Number(r.failures);
    const [lo, hi] = wilson(k, n);
    console.log(
      `  ${String(r.provider).padEnd(30)} ${String(n).padStart(9)} ${String(k).padStart(6)} ${((100 * k) / n).toFixed(3).padStart(7)}%   [${(100 * lo).toFixed(3)}%, ${(100 * hi).toFixed(3)}%]`,
    );
  }

  console.log("\n=== azure-speech (= azure-llm-speech) day by day ===");
  const byday = await q(
    `select created_at::date d, status, count(*) n
     from webtv.processing_usage_events
     where stage='transcribing' and operation='transcribe' and provider='azure-speech'
     group by 1,2 order by 1`,
  );
  for (const r of byday as any[])
    console.log(`  ${String(r.d).slice(0, 15)}  ${String(r.status).padEnd(8)} n=${r.n}`);

  console.log("\n=== error messages, transcription stage ===");
  const msgs = await q(
    `select provider, coalesce(error_message,'(null)') msg, count(*) n, max(created_at)::date last_seen
     from webtv.processing_usage_events
     where stage='transcribing' and operation='transcribe' and status='error'
     group by 1,2 order by n desc limit 25`,
  );
  for (const r of msgs as any[])
    console.log(`  ${String(r.provider).padEnd(14)} n=${String(r.n).padStart(4)} last=${String(r.last_seen).slice(0,15)}  ${String(r.msg).replace(/\s+/g,' ').slice(0, 150)}`);

  console.log("\n=== failure detail (non-success rows, transcription stage) ===");
  const fails = await q(
    `select provider, status, count(*) n, max(created_at)::date last_seen
     from webtv.processing_usage_events
     where stage = 'transcribing' and operation = 'transcribe' and status <> 'success'
     group by 1,2 order by n desc limit 30`,
  );
  if (!fails.length) console.log("  (none)");
  for (const r of fails as any[])
    console.log(`  ${String(r.provider).padEnd(30)} ${String(r.status).padEnd(14)} n=${String(r.n).padStart(6)}  last ${r.last_seen}`);

  console.log("\n=== production English volume + audio hours by provider ===");
  const vol = await q(
    `select provider,
            count(*) n,
            round(sum(coalesce(usage_hours,0))::numeric, 1) audio_hours
     from webtv.processing_usage_events
     where stage = 'transcribing' and operation = 'transcribe'
     group by 1 order by audio_hours desc nulls last`,
  );
  for (const r of vol as any[])
    console.log(`  ${String(r.provider).padEnd(30)} n=${String(r.n).padStart(7)}  audio_hours=${r.audio_hours}`);

  await pool.end();
})().catch(async (e) => {
  console.error("ERROR:", e.message);
  await pool.end();
  process.exit(1);
});
