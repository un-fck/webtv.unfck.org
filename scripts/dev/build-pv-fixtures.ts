#!/usr/bin/env tsx
/**
 * Capture REAL PV/SR document text as offline test fixtures.
 *
 * Fetches a small curated set of documents from documents.un.org, runs the
 * production PDF text extraction (extractPdfText), and writes the raw text to
 * lib/__fixtures__/pv/{symbol}_{lang}.txt. The pv-parser test then runs
 * parsePVText() against these — exercising all 6-language regex + artifact
 * stripping offline, with no network.
 *
 * Network + ~minute runtime; run by hand to (re)build fixtures:
 *   pnpm tsx scripts/dev/build-pv-fixtures.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fetchPVDocument } from "../../lib/pv-documents";
import { extractPdfText, parsePVText } from "../../lib/pv-parser";

// Curated to exercise every language regex path + PV vs SR + procedural/short.
const DOCS: Array<{ symbol: string; lang: string }> = [
  { symbol: "S/PV.10100", lang: "en" }, // short procedural (EN)
  { symbol: "S/PV.10124", lang: "en" }, // long debate (EN)
  { symbol: "S/PV.10124", lang: "fr" }, // same, French regex
  { symbol: "S/PV.10124", lang: "es" }, // Spanish regex
  { symbol: "S/PV.10124", lang: "ru" }, // Russian regex
  { symbol: "S/PV.10124", lang: "zh" }, // Chinese regex
  { symbol: "S/PV.10124", lang: "ar" }, // Arabic line-by-line handler
  { symbol: "A/C.3/78/SR.5", lang: "en" }, // SR numbered paragraphs
  { symbol: "E/2024/SR.5", lang: "en" }, // ECOSOC SR
];

const ROOT = join(__dirname, "..", "..");
const outDir = join(ROOT, "lib/__fixtures__/pv");
mkdirSync(outDir, { recursive: true });

function fileName(symbol: string, lang: string): string {
  return symbol.replace(/\//g, "_") + `_${lang}.txt`;
}

async function main() {
  for (const { symbol, lang } of DOCS) {
    process.stdout.write(`${symbol} (${lang}) … `);
    const buf = await fetchPVDocument(symbol, lang);
    if (!buf) {
      console.log("FAILED to fetch — skipping");
      continue;
    }
    const rawText = await extractPdfText(buf);
    writeFileSync(join(outDir, fileName(symbol, lang)), rawText);

    // Sanity: confirm the captured text parses to the expected symbol.
    const parsed = parsePVText(rawText, lang);
    console.log(
      `${(rawText.length / 1024).toFixed(0)} KB → symbol=${parsed.symbol} ` +
        `turns=${parsed.turns.length}`,
    );
  }
  console.log(`\nFixtures written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
