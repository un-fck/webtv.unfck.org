#!/usr/bin/env tsx
/**
 * Build a small, diverse fixture of REAL UN video rows for un-api tests.
 *
 * Samples rows from analysis/video-metadata.json covering every UN body plus
 * event-code / part-number / session-number variants, keeping only rows where
 * the CURRENT title-parsing logic still reproduces the values stored in the
 * dump (so the fixture is real ground truth, not tautological). Writes
 * lib/__fixtures__/videos.sample.json.
 *
 * Re-run after intentional parser changes to refresh expectations:
 *   pnpm tsx scripts/dev/build-video-fixtures.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  extractMetadataFromTitle,
  cleanTitle,
  calculateStatus,
} from "../../lib/un-api";
import { parseMeetingSymbol } from "../../lib/pv-documents";

interface DumpRow {
  id: string;
  title: string;
  category: string;
  date: string;
  duration: string;
  scheduledTime: string | null;
  eventCode: string | null;
  eventType: string | null;
  body: string | null;
  sessionNumber: string | null;
  cleanTitle: string;
}

const ROOT = join(__dirname, "..", "..");
const dump: DumpRow[] = JSON.parse(
  readFileSync(join(ROOT, "analysis/video-metadata.json"), "utf8"),
);

/** True when current code reproduces the stored derived fields exactly. */
function agrees(row: DumpRow): boolean {
  const meta = extractMetadataFromTitle(row.title, row.category);
  return (
    meta.eventCode === row.eventCode &&
    meta.eventType === row.eventType &&
    meta.body === row.body &&
    meta.sessionNumber === row.sessionNumber &&
    cleanTitle(row.title, meta) === row.cleanTitle
  );
}

// Diversity buckets: a predicate per dimension we want covered.
const buckets: Array<{ name: string; pred: (r: DumpRow) => boolean }> = [
  { name: "sc", pred: (r) => r.body === "Security Council" },
  { name: "ga-plenary", pred: (r) => r.body === "General Assembly" },
  { name: "first-cmte", pred: (r) => r.body === "First Committee" },
  { name: "second-cmte", pred: (r) => r.body === "Second Committee" },
  { name: "third-cmte", pred: (r) => r.body === "Third Committee" },
  { name: "fourth-cmte", pred: (r) => r.body === "Fourth Committee" },
  { name: "fifth-cmte", pred: (r) => r.body === "Fifth Committee" },
  { name: "sixth-cmte", pred: (r) => r.body === "Sixth Committee" },
  {
    name: "ecosoc",
    pred: (r) => r.body === "Economic and Social Council",
  },
  { name: "trusteeship", pred: (r) => r.body === "Trusteeship Council" },
  { name: "event-code", pred: (r) => r.eventCode !== null },
  { name: "session-number", pred: (r) => r.sessionNumber !== null },
  { name: "no-body", pred: (r) => r.body === null },
];

const TARGET_PER_BUCKET = 2;
const picked = new Map<string, DumpRow>();

for (const { pred } of buckets) {
  let taken = 0;
  for (const row of dump) {
    if (taken >= TARGET_PER_BUCKET) break;
    if (picked.has(row.id)) continue;
    if (!pred(row)) continue;
    if (!agrees(row)) continue;
    picked.set(row.id, row);
    taken++;
  }
}

const fixtures = [...picked.values()].map((row) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  date: row.date,
  duration: row.duration,
  scheduledTime: row.scheduledTime,
  // Expected = what current production code derives (golden / characterization).
  expected: {
    ...extractMetadataFromTitle(row.title, row.category),
    cleanTitle: row.cleanTitle,
    pvSymbol: parseMeetingSymbol(row.title, row.category, row.date),
    // status is time-relative; only assert the deterministic "finished" case
    // (no scheduledTime). For others we just record the input.
    statusWhenFinished: calculateStatus(null, row.duration),
  },
}));

const outDir = join(ROOT, "lib/__fixtures__");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "videos.sample.json");
writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + "\n");

console.log(
  `Wrote ${fixtures.length} video fixtures to ${outPath}\n` +
    `Bodies: ${[...new Set(fixtures.map((f) => f.expected.body))].join(", ")}`,
);
