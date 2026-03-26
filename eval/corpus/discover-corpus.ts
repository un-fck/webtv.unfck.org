#!/usr/bin/env tsx
/**
 * Discover sessions for split 2 corpus (whole sessions).
 *
 * Scans UN Web TV schedule for 2024, collects SC + GA plenary + First Committee meetings,
 * verifies PV documents exist, and outputs a stratified sample for sessions.json.
 *
 * Usage:
 *   tsx eval/corpus/discover-corpus.ts
 *   tsx eval/corpus/discover-corpus.ts --year=2024 --target=30
 */
import "../../lib/load-env";
import { pvDocumentExists } from "../ground-truth/documents-api";

const YEAR = parseInt(
  process.argv.find((a) => a.startsWith("--year="))?.replace("--year=", "") ??
    "2024",
);
const TARGET = parseInt(
  process.argv
    .find((a) => a.startsWith("--target="))
    ?.replace("--target=", "") ?? "30",
);

interface WeekEntry {
  assetId: string;
  title: string;
  category: string;
  duration: string;
  durationSeconds: number;
}

async function scrapeDate(date: string): Promise<WeekEntry[]> {
  const res = await fetch(`https://webtv.un.org/en/schedule/${date}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  const results: WeekEntry[] = [];

  // Each entry is delimited by data-nid="..." attributes
  const blocks = html.split(/(?=data-nid=)/);
  for (const block of blocks.slice(1)) {
    const assetM = block.match(/\/en\/asset\/([a-z0-9/]+)/);
    if (!assetM) continue;

    // Extract all text nodes from this block
    const texts = (block.match(/>([^<]{3,300})</g) || [])
      .map((t) =>
        t
          .replace(/^>|<$/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .trim(),
      )
      .filter((t) => t.length > 2);

    // Duration is first match of HH:MM:SS pattern (second timestamp)
    const durs = texts.filter((t) => /^\d{2}:\d{2}:\d{2}$/.test(t));
    const dur = durs[1] || durs[0] || "00:00:00";

    // Category and title: look for known category strings
    const catPatterns = [
      "Security Council",
      "General Assembly",
      "Economic and Social Council",
    ];
    const category =
      texts.find((t) => catPatterns.some((p) => t.includes(p))) || "";
    if (!category) continue;

    // Title: longest text that contains "meeting" or "Committee" or "plenary"
    const title =
      texts.find(
        (t) => /meeting|committee|plenary/i.test(t) && t !== category,
      ) ||
      texts.filter((t) => t.length > 20 && t !== category)[0] ||
      "";

    const [h, m, s] = dur.split(":").map(Number);

    results.push({
      assetId: assetM[1],
      title: title.trim(),
      category: category.trim(),
      duration: dur,
      durationSeconds: h * 3600 + m * 60 + s,
    });
  }

  return results;
}

function parseMeetingSymbol(title: string, category: string): string | null {
  // Security Council: "9748th meeting" → S/PV.9748
  const scMatch = title.match(/(\d{4,5})(?:st|nd|rd|th)\s+meeting/);
  if (scMatch && /security council/i.test(category)) {
    return `S/PV.${scMatch[1]}`;
  }

  // First Committee: "First Committee, 7th plenary meeting - General Assembly, 79th session"
  // → A/C.1/79/PV.7
  const firstCommM = title.match(
    /First Committee.*?(\d+)(?:st|nd|rd|th)\s+(?:plenary\s+)?meeting.*?(\d+)(?:st|nd|rd|th)\s+session/i,
  );
  if (firstCommM && /general assembly/i.test(category)) {
    return `A/C.1/${firstCommM[2]}/PV.${firstCommM[1]}`;
  }

  // General Assembly plenary: "General Assembly: 21st plenary meeting, 79th session"
  // → A/79/PV.21
  const sessionM = title.match(/(\d+)(?:st|nd|rd|th)\s+session/);
  const plenaryM = title.match(/(\d+)(?:st|nd|rd|th)\s+plenary\s+meeting/);
  if (
    sessionM &&
    plenaryM &&
    /general assembly/i.test(category) &&
    !/committee/i.test(title)
  ) {
    return `A/${sessionM[1]}/PV.${plenaryM[1]}`;
  }

  return null;
}

/** Generate dates to scan: every 3 days across the year for good coverage. */
function getDatesToScan(year: number): string[] {
  const dates: string[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 3)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/** Run async tasks with bounded concurrency. */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  console.log(`Discovering corpus sessions for ${YEAR} (target: ${TARGET})\n`);

  const dates = getDatesToScan(YEAR);
  console.log(`Scanning ${dates.length} dates (8 concurrent)...`);

  // Collect all SC/GA/committee meetings — parallel scrape
  const all: Array<WeekEntry & { symbol: string; date: string }> = [];
  let scanned = 0;

  await pMap(
    dates,
    async (date) => {
      const entries = await scrapeDate(date);
      for (const e of entries) {
        const symbol = parseMeetingSymbol(e.title, e.category);
        if (symbol) all.push({ ...e, symbol, date });
      }
      scanned++;
      if (scanned % 20 === 0)
        process.stdout.write(
          `\r  ${scanned}/${dates.length} dates scanned, ${all.length} found`,
        );
    },
    8,
  );
  console.log(
    `\r  Scanned ${scanned} dates, found ${all.length} meetings        `,
  );

  // Deduplicate by symbol
  const bySymbol = new Map<string, (typeof all)[0]>();
  for (const e of all) {
    if (!bySymbol.has(e.symbol)) bySymbol.set(e.symbol, e);
  }
  const unique = [...bySymbol.values()];
  console.log(`  ${unique.length} unique sessions`);

  // Categorize
  const sc = unique.filter((e) => e.symbol.startsWith("S/PV."));
  const ga = unique.filter((e) => /^A\/\d+\/PV\./.test(e.symbol));
  const c1 = unique.filter((e) => e.symbol.startsWith("A/C.1/"));

  console.log(
    `\n  SC: ${sc.length}, GA plenary: ${ga.length}, First Committee: ${c1.length}`,
  );

  // Stratified sample — verify each category separately to hit quotas
  const shuffle = <T>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
  const targetSC = Math.round(TARGET * 0.6);
  const targetGA = Math.round(TARGET * 0.3);
  const targetC1 = TARGET - targetSC - targetGA;

  async function verifyCategory(
    candidates: typeof unique,
    target: number,
    label: string,
  ): Promise<Array<{ symbol: string; assetId: string; notes: string }>> {
    const result: Array<{ symbol: string; assetId: string; notes: string }> =
      [];
    const shuffled = shuffle(candidates);

    // Verify up to 2×target candidates in parallel (stop early once target is hit)
    const toCheck = shuffled.slice(0, Math.min(target * 2, shuffled.length));
    await pMap(
      toCheck,
      async (c) => {
        if (result.length >= target) return;
        const exists = await pvDocumentExists(c.symbol, "en");
        if (exists && result.length < target) {
          result.push({
            symbol: c.symbol,
            assetId: c.assetId,
            notes: `${c.title} (${c.duration})`,
          });
          console.log(`  ✓ ${c.symbol} [${label}]`);
        }
      },
      8,
    );

    // If still short, check remaining candidates serially
    for (const c of shuffled.slice(toCheck.length)) {
      if (result.length >= target) break;
      const exists = await pvDocumentExists(c.symbol, "en");
      if (exists) {
        result.push({
          symbol: c.symbol,
          assetId: c.assetId,
          notes: `${c.title} (${c.duration})`,
        });
        console.log(`  ✓ ${c.symbol} [${label}]`);
      }
    }
    return result;
  }

  console.log(
    `\nVerifying candidates (targets: ${targetSC} SC, ${targetGA} GA, ${targetC1} C1)...`,
  );
  const [finalSC, finalGA, finalC1] = await Promise.all([
    verifyCategory(sc, targetSC, "SC"),
    verifyCategory(ga, targetGA, "GA"),
    verifyCategory(c1, targetC1, "C1"),
  ]);
  const final = [...finalSC, ...finalGA, ...finalC1];

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `CORPUS SESSIONS (${final.length}): ${finalSC.length} SC, ${finalGA.length} GA, ${finalC1.length} First Comm`,
  );
  console.log("=".repeat(60));

  const output = JSON.stringify(final, null, 2);
  console.log("\nsessions.json:");
  console.log(output);

  // Write to sessions.json
  const sessionsPath = `${__dirname}/sessions.json`;
  // Read existing sessions to merge
  let existing: typeof final = [];
  try {
    existing = JSON.parse(require("fs").readFileSync(sessionsPath, "utf-8"));
  } catch {}

  const merged = [...existing];
  for (const s of final) {
    if (!merged.find((e) => e.symbol === s.symbol)) merged.push(s);
  }

  require("fs").writeFileSync(sessionsPath, JSON.stringify(merged, null, 2));
  console.log(
    `\nMerged ${final.length} new sessions into ${sessionsPath} (total: ${merged.length})`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
