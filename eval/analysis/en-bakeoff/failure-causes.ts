/**
 * Classify every production transcription failure by ROOT CAUSE.
 *
 * A raw failure rate is not the number that decides anything: "AssemblyAI failed
 * 53 times" includes Kaltura 404s (upstream, would have failed on any vendor),
 * our own too-long-audio submissions, and — the interesting one — requests
 * rejected because the personal card funding the account ran out of credit.
 * Only the vendor-attributable subset speaks to vendor reliability; the funding
 * subset speaks directly to the out-of-pocket arrangement this whole comparison
 * exists to resolve.
 *
 * READ-ONLY.
 */
import "../../../lib/load-env";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
select provider,
  case
    when error_message ilike '%balance is negative%'          then 'FUNDING — prepaid account ran out of credit'
    when error_message ilike '%duration is too long%'         then 'OUR LIMIT — audio longer than the plan allows'
    when error_message ilike '%download%' or error_message ilike '%404%'
                                                              then 'UPSTREAM — Kaltura download failed (vendor-agnostic)'
    when error_message ilike '%401%'                          then 'AUTH — credentials'
    when error_message ilike '%timeout%'                      then 'VENDOR — timeout'
    when error_message ilike '%terminated%' or error_message ilike '%fetch failed%'
                                                              then 'VENDOR/TRANSPORT — connection terminated'
    when error_message ilike '%parse%' or error_message ilike '%JSON%'
                                                              then 'VENDOR — malformed response'
    else 'OTHER'
  end as cause,
  count(*)::int n,
  min(created_at)::date first_seen,
  max(created_at)::date last_seen
from webtv.processing_usage_events
where stage = 'transcribing' and operation = 'transcribe' and status = 'error'
group by 1,2
order by 1, n desc`;

const TOTALS = `
select provider, count(*)::int attempts,
       count(*) filter (where status='error')::int failures
from webtv.processing_usage_events
where stage='transcribing' and operation='transcribe' group by 1`;

function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

(async () => {
  const causes = (await pool.query(SQL)).rows as any[];
  const totals = (await pool.query(TOTALS)).rows as any[];
  const attemptsBy = Object.fromEntries(totals.map((t) => [t.provider, t.attempts]));

  let cur = "";
  for (const r of causes) {
    if (r.provider !== cur) {
      cur = r.provider;
      console.log(`\n${cur}  (attempts: ${attemptsBy[cur]})`);
    }
    console.log(
      `   ${String(r.n).padStart(4)}  ${String(r.cause).padEnd(52)} ${String(r.first_seen).slice(4, 15)} → ${String(r.last_seen).slice(4, 15)}`,
    );
  }

  console.log("\n\n=== VENDOR-ATTRIBUTABLE failure rate (upstream / our-limit / funding excluded) ===");
  console.log(`${"provider".padEnd(16)} ${"attempts".padStart(9)} ${"all fail".padStart(9)} ${"vendor fail".padStart(12)} ${"vendor rate".padStart(12)}   95% Wilson CI`);
  const byProv: Record<string, { all: number; vendor: number }> = {};
  for (const r of causes) {
    byProv[r.provider] ??= { all: 0, vendor: 0 };
    byProv[r.provider].all += r.n;
    if (r.cause.startsWith("VENDOR") || r.cause.startsWith("OTHER")) byProv[r.provider].vendor += r.n;
  }
  for (const [prov, v] of Object.entries(byProv)) {
    const n = attemptsBy[prov];
    // Denominator excludes the attempts that failed for reasons the vendor could
    // not have prevented, so the rate answers "how often does the vendor break".
    const excluded = v.all - v.vendor;
    const denom = n - excluded;
    const [lo, hi] = wilson(v.vendor, denom);
    console.log(
      `${prov.padEnd(16)} ${String(n).padStart(9)} ${String(v.all).padStart(9)} ${String(v.vendor).padStart(12)} ${((100 * v.vendor) / denom).toFixed(3).padStart(11)}%   [${(100 * lo).toFixed(3)}%, ${(100 * hi).toFixed(3)}%]  (denom ${denom})`,
    );
  }
  await pool.end();
})().catch(async (e) => {
  console.error("ERROR:", e.message);
  await pool.end();
  process.exit(1);
});
