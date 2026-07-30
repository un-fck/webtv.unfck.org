#!/usr/bin/env tsx
/**
 * Verify the English provider switch on PRODUCTION data: for each video, score
 * omission on the pre-switch (AssemblyAI) transcript and on the post-switch
 * (Azure) one, against the same audio.
 *
 * Doubles as an integration test of `eval/metrics/omission.ts` on real audio and
 * real provider output — the unit controls run on synthetic envelopes, so this
 * is the first time the ffmpeg half and the DB word shapes meet the metric.
 *
 * Read-only against the database. Throwaway dev tool; delete when done.
 */
import "../../lib/load-env";
import { pool } from "../../lib/db";
import { getKalturaAudioUrl } from "../../lib/transcription";
import {
  speechEnvelope,
  scoreOmission,
  type OmissionWord,
} from "../../eval/metrics/omission";

interface Row {
  transcript_id: string;
  kaltura_id: string;
  created_at: string;
  time_offset_ms: number | null;
  content: { raw_paragraphs?: Array<{ words?: OmissionWord[] }> };
}

const SWITCH_AT = "2026-07-30T00:00:00Z";

/** Pre-switch English ran on AssemblyAI; post-switch rows carry the provider in
 *  their id. `scheduled-*` rows predate the id-prefix convention. */
const arm = (r: Row) =>
  r.transcript_id.startsWith("azure-llm-speech") ||
  new Date(r.created_at) >= new Date(SWITCH_AT)
    ? "azure"
    : "assemblyai";

const words = (r: Row): OmissionWord[] => {
  const off = r.time_offset_ms ?? 0;
  const out: OmissionWord[] = [];
  for (const p of r.content.raw_paragraphs ?? [])
    for (const w of p.words ?? [])
      out.push({ text: w.text, start: w.start + off, end: w.end + off });
  return out;
};

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("usage: tsx scripts/dev/verify-omission.ts <kalturaId>...");
    process.exit(1);
  }

  const { rows } = await pool.query<Row>(
    `SELECT transcript_id, kaltura_id, created_at, time_offset_ms, content
       FROM webtv.transcripts
      WHERE language_code = 'en'
        AND transcription_status = 'completed'
        AND kaltura_id = ANY($1)
      ORDER BY kaltura_id, created_at`,
    [ids],
  );

  const byVideo = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byVideo.get(r.kaltura_id) ?? [];
    list.push(r);
    byVideo.set(r.kaltura_id, list);
  }

  console.log(
    "video".padEnd(15) +
      "audio_h".padStart(8) +
      "  AssemblyAI dropped".padStart(21) +
      "  Azure dropped".padStart(17) +
      "  verdict",
  );
  const totals = { aai: 0, az: 0, audio: 0, better: 0, worse: 0, same: 0 };

  for (const kid of ids) {
    const list = byVideo.get(kid) ?? [];
    // Newest row per arm.
    const pick = (a: string) =>
      list.filter((r) => arm(r) === a).slice(-1)[0] ?? null;
    const oldRow = pick("assemblyai");
    const newRow = pick("azure");
    if (!oldRow || !newRow) {
      console.log(
        `${kid.padEnd(15)}${"".padStart(8)}  ` +
          `(skipped: ${!oldRow ? "no pre-switch row" : "no post-switch row"})`,
      );
      continue;
    }

    let envelope: number[];
    try {
      const { audioUrl } = await getKalturaAudioUrl(kid, "english");
      envelope = await speechEnvelope(audioUrl);
    } catch (err) {
      console.log(
        `${kid.padEnd(15)}${"".padStart(8)}  (audio unavailable: ${
          err instanceof Error ? err.message.slice(0, 60) : err
        })`,
      );
      continue;
    }

    const a = scoreOmission(envelope, words(oldRow));
    const b = scoreOmission(envelope, words(newRow));
    totals.aai += a.droppedSpeechSeconds;
    totals.az += b.droppedSpeechSeconds;
    totals.audio += a.audioSeconds;
    const delta = b.droppedSpeechSeconds - a.droppedSpeechSeconds;
    if (delta < -1) totals.better++;
    else if (delta > 1) totals.worse++;
    else totals.same++;

    console.log(
      kid.padEnd(15) +
        (a.audioSeconds / 3600).toFixed(2).padStart(8) +
        `${a.droppedSpeechSeconds.toFixed(1)}s (${(a.droppedSpeechRatio * 100).toFixed(3)}%)`.padStart(
          21,
        ) +
        `${b.droppedSpeechSeconds.toFixed(1)}s (${(b.droppedSpeechRatio * 100).toFixed(3)}%)`.padStart(
          17,
        ) +
        "  " +
        (delta < -1
          ? `better by ${(-delta).toFixed(1)}s`
          : delta > 1
            ? `WORSE by ${delta.toFixed(1)}s`
            : "no change") +
        (oldRow.time_offset_ms
          ? `  [old offset ${oldRow.time_offset_ms}ms applied]`
          : ""),
    );
  }

  console.log("\n" + "-".repeat(78));
  console.log(
    `TOTAL over ${(totals.audio / 3600).toFixed(2)} h: ` +
      `AssemblyAI ${totals.aai.toFixed(1)}s (${((100 * totals.aai) / Math.max(1, totals.audio)).toFixed(3)}%)  ` +
      `Azure ${totals.az.toFixed(1)}s (${((100 * totals.az) / Math.max(1, totals.audio)).toFixed(3)}%)`,
  );
  console.log(
    `Videos improved: ${totals.better}   unchanged: ${totals.same}   regressed: ${totals.worse}`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
