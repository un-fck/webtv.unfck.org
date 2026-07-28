import "../../../lib/load-env";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s: string) => (await pool.query(s)).rows;
(async () => {
  console.log("=== English audio hours by MEETING month (organic volume, all processing dates) ===");
  for (const r of await q(`select date_trunc('month', v.date)::date meeting_month,
      round(sum(e.usage_hours)::numeric,1) hours, count(*) n
    from webtv.processing_usage_events e
    join webtv.transcripts t on t.transcript_id=e.transcript_id
    join webtv.videos v on v.kaltura_id=t.kaltura_id
    where e.stage='transcribing' and e.provider='assemblyai' and e.status='success'
      and e.operation='transcribe' and v.date >= '2026-01-01'
    group by 1 order by 1`)) console.log(" ", JSON.stringify(r));
  console.log("\n=== how much WebTV English audio exists per month (ceiling) ===");
  for (const r of await q(`select date_trunc('month', date)::date m, count(*) videos,
      round(sum(duration)::numeric/3600,1) hours
    from webtv.videos where date >= '2026-01-01' group by 1 order by 1`)) console.log(" ", JSON.stringify(r));
  await pool.end();
})().catch(async e => { console.error("ERR", e.message); await pool.end(); process.exit(1); });
