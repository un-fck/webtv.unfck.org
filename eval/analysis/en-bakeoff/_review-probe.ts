import "/Users/david/UN/transcripts/.claude/worktrees/en-bakeoff/lib/load-env";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s: string) => (await pool.query(s)).rows;
(async () => {
  console.log("=== attempts per transcript_id (unit-of-attempt check) ===");
  for (const r of await q(`select provider, count(*) events, count(distinct transcript_id) transcripts,
      round(count(*)::numeric/nullif(count(distinct transcript_id),0),2) events_per_transcript,
      round(avg(usage_hours)::numeric,3) avg_hours_per_event
    from webtv.processing_usage_events where stage='transcribing' group by 1 order by events desc`))
    console.log(" ", JSON.stringify(r));

  console.log("\n=== assemblyai monthly volume (backfill test) ===");
  for (const r of await q(`select date_trunc('month',created_at)::date m, count(*) n,
      round(sum(usage_hours)::numeric,1) hours,
      count(*) filter (where status='error') err
    from webtv.processing_usage_events where stage='transcribing' and provider='assemblyai'
    group by 1 order by 1`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== assemblyai JULY: audio hours by MEETING DATE (backfill vs organic) ===");
  for (const r of await q(`select date_trunc('month', v.date)::date meeting_month,
      round(sum(e.usage_hours)::numeric,1) hours, count(*) n
    from webtv.processing_usage_events e
    join webtv.transcripts t on t.transcript_id=e.transcript_id
    join webtv.videos v on v.kaltura_id=t.kaltura_id
    where e.stage='transcribing' and e.provider='assemblyai' and e.status='success'
      and e.created_at >= '2026-07-01'
    group by 1 order by 1`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== assemblyai JUNE: audio hours by MEETING DATE ===");
  for (const r of await q(`select date_trunc('month', v.date)::date meeting_month,
      round(sum(e.usage_hours)::numeric,1) hours, count(*) n
    from webtv.processing_usage_events e
    join webtv.transcripts t on t.transcript_id=e.transcript_id
    join webtv.videos v on v.kaltura_id=t.kaltura_id
    where e.stage='transcribing' and e.provider='assemblyai' and e.status='success'
      and e.created_at >= '2026-06-01' and e.created_at < '2026-07-01'
    group by 1 order by 1`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== last-90d matched-window reliability, by cause ===");
  for (const r of await q(`select provider,
      case when error_message ilike '%balance is negative%' then 'FUNDING'
           when error_message ilike '%duration is too long%' then 'LIMIT'
           when error_message ilike '%download%' or error_message ilike '%404%' then 'UPSTREAM'
           when error_message ilike '%401%' then 'AUTH'
           when error_message ilike '%terminated%' or error_message ilike '%fetch failed%' then 'VENDOR-TRANSPORT'
           else 'OTHER' end cause, count(*) n
    from webtv.processing_usage_events
    where stage='transcribing' and status='error' and created_at > now()-interval '90 days'
    group by 1,2 order by 1,3 desc`)) console.log(" ", JSON.stringify(r));

  console.log("\n=== azure-speech by language ===");
  for (const r of await q(`select t.language_code, e.status, count(*) n, round(sum(e.usage_hours)::numeric,1) hours
    from webtv.processing_usage_events e left join webtv.transcripts t on t.transcript_id=e.transcript_id
    where e.stage='transcribing' and e.provider='azure-speech' group by 1,2 order by 1,2`))
    console.log(" ", JSON.stringify(r));

  console.log("\n=== assemblyai by language ===");
  for (const r of await q(`select t.language_code, count(*) n, round(sum(e.usage_hours)::numeric,1) hours
    from webtv.processing_usage_events e left join webtv.transcripts t on t.transcript_id=e.transcript_id
    where e.stage='transcribing' and e.provider='assemblyai' group by 1 order by 3 desc nulls last`))
    console.log(" ", JSON.stringify(r));
  await pool.end();
})().catch(async e => { console.error("ERR", e.message); await pool.end(); process.exit(1); });
