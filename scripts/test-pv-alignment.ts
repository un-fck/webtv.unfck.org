/**
 * Validate PV alignment timestamps against existing transcripts.
 *
 * Usage:
 *   npx tsx scripts/test-pv-alignment.ts                    # baseline, EN only
 *   npx tsx scripts/test-pv-alignment.ts --lang=en,fr,es    # multilingual
 *   npx tsx scripts/test-pv-alignment.ts --thinking          # experiment A: enable thinking
 *   npx tsx scripts/test-pv-alignment.ts --preview=300       # experiment B: longer previews
 *   npx tsx scripts/test-pv-alignment.ts --first-words       # experiment C: request firstWords
 *   npx tsx scripts/test-pv-alignment.ts --overlap=0         # experiment D: no overlap buffer
 *   npx tsx scripts/test-pv-alignment.ts --fresh             # clear cached alignments first
 *   npx tsx scripts/test-pv-alignment.ts --symbol=S/PV.10122 # single meeting
 *   npx tsx scripts/test-pv-alignment.ts --dry-run           # parse only, no alignment
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { parsePVDocument } from "../lib/pv-parser";
import { fetchPVDocument } from "../lib/pv-documents";
import { alignPVWithAudio } from "../lib/pv-alignment";
import { getKalturaAudioUrl } from "../lib/transcription";
import type { AlignedPVDocument, AlignmentOptions } from "../lib/pv-alignment";

const client = createClient({
  url: process.env.TURSO_DB!,
  authToken: process.env.TURSO_TOKEN,
});

interface TestCase {
  pvSymbol: string;
  entryId: string;
  title: string;
  duration: number; // seconds
}

const TEST_CASES: TestCase[] = [
  {
    pvSymbol: "S/PV.10121",
    entryId: "1_r1zgp8is",
    title: "Afghanistan (short, ~40min)",
    duration: 2376,
  },
  {
    pvSymbol: "S/PV.10122",
    entryId: "1_pvoh3xic",
    title: "Non-proliferation (medium, ~67min)",
    duration: 3993,
  },
  {
    pvSymbol: "S/PV.10124",
    entryId: "1_9lbwiaz9",
    title: "Ukraine (long, ~2h)",
    duration: 7636,
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const langs = args.find(a => a.startsWith("--lang="))?.split("=")[1]?.split(",") || ["en"];
  const symbolFilter = args.find(a => a.startsWith("--symbol="))?.split("=")[1];
  const dryRun = args.includes("--dry-run");
  const fresh = args.includes("--fresh");

  const opts: AlignmentOptions = {};
  if (args.includes("--thinking")) opts.enableThinking = true;
  const previewArg = args.find(a => a.startsWith("--preview="));
  if (previewArg) opts.contentPreviewLength = parseInt(previewArg.split("=")[1]);
  if (args.includes("--first-words")) opts.requestFirstWords = true;
  const overlapArg = args.find(a => a.startsWith("--overlap="));
  if (overlapArg) opts.overlapBuffer = parseInt(overlapArg.split("=")[1]);

  // Build experiment label
  const parts: string[] = [];
  if (opts.enableThinking) parts.push("thinking");
  if (opts.contentPreviewLength) parts.push(`preview=${opts.contentPreviewLength}`);
  if (opts.requestFirstWords) parts.push("firstWords");
  if (opts.overlapBuffer !== undefined) parts.push(`overlap=${opts.overlapBuffer}`);
  const experiment = parts.length > 0 ? parts.join("+") : "baseline";

  return { langs, symbolFilter, dryRun, fresh, opts, experiment };
}

interface TranscriptSegment {
  speaker: string;
  startMs: number;
  statementIndex: number;
}

async function extractTranscriptSegments(entryId: string): Promise<TranscriptSegment[]> {
  const r = await client.execute({
    sql: `SELECT t.content, sm.mapping
          FROM transcripts t
          LEFT JOIN speaker_mappings sm ON sm.transcript_id = t.transcript_id
          WHERE t.entry_id = ? AND t.status = 'completed' AND t.language_code = 'en'
          LIMIT 1`,
    args: [entryId],
  });

  if (r.rows.length === 0) return [];

  const content = JSON.parse(r.rows[0].content as string);
  const mapping = r.rows[0].mapping ? JSON.parse(r.rows[0].mapping as string) : {};

  const segments: TranscriptSegment[] = [];
  if (content.statements) {
    for (let i = 0; i < content.statements.length; i++) {
      const stmt = content.statements[i];
      const info = mapping[i.toString()];
      const label = info
        ? [info.function, info.affiliation].filter(Boolean).join(" / ")
        : `Speaker ${i}`;
      segments.push({ speaker: label, startMs: stmt.start, statementIndex: i });
    }
  }
  return segments;
}

function findClosestTranscriptSegment(
  pvStartMs: number,
  segments: TranscriptSegment[],
): TranscriptSegment & { delta: number } {
  let best = { ...segments[0], delta: Math.abs(segments[0].startMs - pvStartMs) };
  for (const seg of segments) {
    const delta = Math.abs(seg.startMs - pvStartMs);
    if (delta < best.delta) best = { ...seg, delta };
  }
  return best;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function validateAlignment(
  testCase: TestCase,
  lang: string,
  opts: AlignmentOptions,
  fresh: boolean,
  dryRun: boolean,
): Promise<{ deltas: number[]; unmatched: number; total: number } | null> {
  console.log(`\n  --- ${testCase.pvSymbol} [${lang}] — ${testCase.title} ---`);

  if (dryRun) {
    console.log("  [DRY RUN] Fetching PV...");
    const pdfBuffer = await fetchPVDocument(testCase.pvSymbol, lang);
    if (!pdfBuffer) { console.log("  ✗ PV not available"); return null; }
    const pvDoc = await parsePVDocument(pdfBuffer, lang);
    console.log(`  PV turns: ${pvDoc.turns.length}, first: ${pvDoc.turns[0]?.speaker}, last: ${pvDoc.turns[pvDoc.turns.length - 1]?.speaker}`);
    return null;
  }

  let aligned: AlignedPVDocument;

  if (fresh) {
    // Delete cached alignment
    await client.execute({
      sql: `DELETE FROM pv_contents WHERE pv_symbol = ? AND language = ?`,
      args: [testCase.pvSymbol, lang],
    });
  }

  const cachedRes = await client.execute({
    sql: `SELECT content FROM pv_contents WHERE pv_symbol = ? AND language = ?`,
    args: [testCase.pvSymbol, lang],
  });

  if (cachedRes.rows.length > 0) {
    const doc = JSON.parse(cachedRes.rows[0].content as string);
    if (doc.aligned) {
      console.log("  Using cached alignment");
      aligned = doc as AlignedPVDocument;
    } else {
      console.log("  Cached PV not aligned, running alignment...");
      const { audioUrl } = await getKalturaAudioUrl(testCase.entryId);
      aligned = await alignPVWithAudio(doc, audioUrl, opts);
      await client.execute({
        sql: `UPDATE pv_contents SET content = ? WHERE pv_symbol = ? AND language = ?`,
        args: [JSON.stringify(aligned), testCase.pvSymbol, lang],
      });
    }
  } else {
    console.log("  Fetching PV and running alignment...");
    const pdfBuffer = await fetchPVDocument(testCase.pvSymbol, lang);
    if (!pdfBuffer) { console.log("  ✗ PV not available in " + lang); return null; }
    const pvDoc = await parsePVDocument(pdfBuffer, lang);
    console.log(`  Parsed ${pvDoc.turns.length} turns`);

    const { audioUrl } = await getKalturaAudioUrl(testCase.entryId);
    aligned = await alignPVWithAudio(pvDoc, audioUrl, opts);

    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT OR REPLACE INTO pv_contents (pv_symbol, language, content, fetched_at, parsed_at) VALUES (?, ?, ?, ?, ?)`,
      args: [testCase.pvSymbol, lang, JSON.stringify(aligned), now, now],
    });
  }

  // Compare against EN transcript (same audio regardless of PV language)
  const segments = await extractTranscriptSegments(testCase.entryId);
  if (segments.length === 0) {
    console.log("  ✗ No EN transcript for comparison");
    return null;
  }

  const deltas: number[] = [];
  let unmatched = 0;

  for (const turn of aligned.turns) {
    if (turn.startTime < 0) {
      unmatched++;
      continue;
    }

    const match = findClosestTranscriptSegment(turn.startTime, segments);
    const deltaSec = match.delta / 1000;
    deltas.push(deltaSec);

    const status = deltaSec <= 30 ? "✓" : deltaSec <= 60 ? "~" : "✗";
    console.log(
      `  ${status} ${turn.speaker} @ ${formatTime(turn.startTime)} → stmt#${match.statementIndex} (${match.speaker}) @ ${formatTime(match.startMs)} (Δ${Math.round(deltaSec)}s)`,
    );
  }

  // Summary for this run
  if (deltas.length > 0) {
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const within30 = deltas.filter(d => d <= 30).length;
    console.log(`  → Mean: ${mean.toFixed(1)}s, ±30s: ${within30}/${deltas.length} (${((within30 / deltas.length) * 100).toFixed(0)}%), Unmatched: ${unmatched}`);
  }

  return { deltas, unmatched, total: aligned.turns.length };
}

async function main() {
  const { langs, symbolFilter, dryRun, fresh, opts, experiment } = parseArgs();

  const cases = symbolFilter
    ? TEST_CASES.filter(c => c.pvSymbol === symbolFilter)
    : TEST_CASES;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`PV Alignment Test — Experiment: ${experiment}`);
  console.log(`Languages: ${langs.join(", ")} | Meetings: ${cases.length}`);
  if (fresh) console.log(`⚠ Fresh mode: cached alignments will be cleared`);
  console.log(`${"=".repeat(70)}`);

  const allDeltas: number[] = [];
  let totalUnmatched = 0;
  let totalTurns = 0;

  for (const testCase of cases) {
    for (const lang of langs) {
      try {
        const result = await validateAlignment(testCase, lang, opts, fresh, dryRun);
        if (result) {
          allDeltas.push(...result.deltas);
          totalUnmatched += result.unmatched;
          totalTurns += result.total;
        }
      } catch (err) {
        console.error(`  ✗ Error: ${(err as Error).message}`);
      }
    }
  }

  if (dryRun || allDeltas.length === 0) return;

  // Global summary
  console.log(`\n${"=".repeat(70)}`);
  console.log(`GLOBAL SUMMARY — ${experiment}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Total turns: ${totalTurns}`);
  console.log(`Aligned: ${allDeltas.length}, Unmatched: ${totalUnmatched}`);

  const mean = allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length;
  const max = Math.max(...allDeltas);
  const within30 = allDeltas.filter(d => d <= 30).length;
  const within60 = allDeltas.filter(d => d <= 60).length;

  console.log(`Mean delta: ${mean.toFixed(1)}s`);
  console.log(`Max delta: ${max.toFixed(1)}s`);
  console.log(`Within ±30s: ${within30}/${allDeltas.length} (${((within30 / allDeltas.length) * 100).toFixed(0)}%)`);
  console.log(`Within ±60s: ${within60}/${allDeltas.length} (${((within60 / allDeltas.length) * 100).toFixed(0)}%)`);

  const passed = mean < 15 && (within30 / allDeltas.length) >= 0.9;
  console.log(`\nResult: ${passed ? "✅ PASS" : "❌ FAIL"} (target: mean <15s, ≥90% ±30s)`);
}

main();
