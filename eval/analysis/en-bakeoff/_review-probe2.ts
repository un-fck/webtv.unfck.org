import "../../../lib/load-env";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s: string) => (await pool.query(s)).rows;
(async () => {
  console.log("=== assemblyai transcribing events by operation ===");
  for (const r of await q(`select operation, count(*) n, count(usage_hours) with_hours,
      round(sum(usage_hours)::numeric,1) hours, min(created_at)::date f, max(created_at)::date l
    from webtv.processing_usage_events where stage='transcribing' and provider='assemblyai'
    group by 1 order by n desc`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== assemblyai: events per transcript, by month (logging-regime change?) ===");
  for (const r of await q(`select date_trunc('month',created_at)::date m, count(*) ev,
      count(distinct transcript_id) tr, round(count(*)::numeric/count(distinct transcript_id),2) per_tr,
      count(usage_hours) with_hours, count(*) filter (where status='error') err
    from webtv.processing_usage_events where stage='transcribing' and provider='assemblyai'
    group by 1 order by 1`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== azure-speech events by operation ===");
  for (const r of await q(`select operation, count(*) n, count(usage_hours) with_hours from webtv.processing_usage_events
    where stage='transcribing' and provider='azure-speech' group by 1`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== per-TRANSCRIPT failure rate (comparable unit) ===");
  for (const r of await q(`select provider, count(distinct transcript_id) transcripts,
      count(distinct transcript_id) filter (where status='error') tr_with_error
    from webtv.processing_usage_events where stage='transcribing' group by 1 order by 2 desc`))
    console.log(" ", JSON.stringify(r));

  console.log("\n=== assemblyai since 2026-06-01 only (matched regime) ===");
  for (const r of await q(`select count(*) ev, count(distinct transcript_id) tr,
      count(*) filter (where status='error') err,
      count(*) filter (where status='error' and (error_message ilike '%terminated%' or error_message ilike '%fetch failed%')) vendor_err
    from webtv.processing_usage_events where stage='transcribing' and provider='assemblyai' and created_at>='2026-06-01'`))
    console.log(" ", JSON.stringify(r));
  await pool.end();
})().catch(async e => { console.error("ERR", e.message); await pool.end(); process.exit(1); });
