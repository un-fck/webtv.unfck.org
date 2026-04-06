/**
 * Test PV parser across 9 documents × 6 UN languages = 54 runs.
 *
 * Downloads PDFs from documents.un.org (cached in /tmp/pv-samples/) and
 * validates parsing: metadata, speaker counts, artifact removal.
 *
 * Usage:
 *   npx tsx scripts/test-pv-parser.ts              # run all
 *   npx tsx scripts/test-pv-parser.ts --symbol=S/PV.10124  # filter by symbol
 *   npx tsx scripts/test-pv-parser.ts --lang=en,fr         # filter by language
 *   npx tsx scripts/test-pv-parser.ts --quick              # one lang per doc
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { parsePVDocument } from "../lib/pv-parser";
import { fetchPVDocument } from "../lib/pv-documents";

const CACHE_DIR = "/tmp/pv-samples";
const ALL_LANGS = ["en", "fr", "es", "ru", "zh", "ar"] as const;

interface TestDoc {
  symbol: string;
  body: string;
  label: string;
  minTurns: number;
}

const TEST_DOCS: TestDoc[] = [
  // Security Council
  { symbol: "S/PV.10124", body: "Security Council", label: "SC long debate (Ukraine)", minTurns: 10 },
  { symbol: "S/PV.10100", body: "Security Council", label: "SC procedural (short)", minTurns: 1 },
  { symbol: "S/PV.10121", body: "Security Council", label: "SC medium (Afghanistan)", minTurns: 5 },
  // General Assembly
  { symbol: "A/79/PV.21", body: "General Assembly", label: "GA plenary", minTurns: 5 },
  { symbol: "A/ES-10/PV.40", body: "General Assembly", label: "GA emergency special", minTurns: 3 },
  { symbol: "A/C.1/78/PV.7", body: "General Assembly", label: "GA 1st Committee (PV)", minTurns: 3 },
  { symbol: "A/C.3/78/SR.5", body: "General Assembly", label: "GA 3rd Committee (SR)", minTurns: 3 },
  // ECOSOC — uses SR (summary records) not PV
  { symbol: "E/2023/SR.10", body: "Economic and Social Council", label: "ECOSOC", minTurns: 1 },
  { symbol: "E/2024/SR.5", body: "Economic and Social Council", label: "ECOSOC 2024", minTurns: 1 },
];

function cacheKey(symbol: string, lang: string): string {
  return symbol.replace(/\//g, "_") + `_${lang}.pdf`;
}

async function getCachedOrFetch(symbol: string, lang: string): Promise<Buffer | null> {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const path = `${CACHE_DIR}/${cacheKey(symbol, lang)}`;
  if (existsSync(path)) {
    return readFileSync(path);
  }

  console.log(`    Downloading ${symbol} [${lang}]...`);
  const buffer = await fetchPVDocument(symbol, lang);
  if (buffer) {
    writeFileSync(path, buffer);
  }
  return buffer;
}

interface TestResult {
  symbol: string;
  lang: string;
  label: string;
  success: boolean;
  symbolOk: boolean;
  bodyOk: boolean;
  turnCount: number;
  turnCountOk: boolean;
  presidentFound: boolean;
  membersCount: number;
  agendaCount: number;
  speechTurns: number;
  proceduralTurns: number;
  withLang: number;
  error?: string;
  firstSpeaker?: string;
  lastSpeaker?: string;
}

async function testDocument(doc: TestDoc, lang: string): Promise<TestResult> {
  const result: TestResult = {
    symbol: doc.symbol,
    lang,
    label: doc.label,
    success: false,
    symbolOk: false,
    bodyOk: false,
    turnCount: 0,
    turnCountOk: false,
    presidentFound: false,
    membersCount: 0,
    agendaCount: 0,
    speechTurns: 0,
    proceduralTurns: 0,
    withLang: 0,
  };

  try {
    const buffer = await getCachedOrFetch(doc.symbol, lang);
    if (!buffer) {
      result.error = "PDF not available";
      return result;
    }

    const parsed = await parsePVDocument(buffer, lang);

    result.symbolOk = parsed.symbol === doc.symbol;
    result.bodyOk = parsed.body === doc.body;
    result.turnCount = parsed.turns.length;
    result.turnCountOk = parsed.turns.length >= doc.minTurns;
    result.presidentFound = !!parsed.president;
    result.membersCount = parsed.members.length;
    result.agendaCount = parsed.agendaItems.length;
    result.speechTurns = parsed.turns.filter(t => t.type === "speech").length;
    result.proceduralTurns = parsed.turns.filter(t => t.type === "procedural").length;
    result.withLang = parsed.turns.filter(t => t.spokenLanguage).length;
    result.firstSpeaker = parsed.turns[0]?.speaker;
    result.lastSpeaker = parsed.turns[parsed.turns.length - 1]?.speaker;
    result.success = result.symbolOk && result.bodyOk && result.turnCountOk;
  } catch (err) {
    result.error = (err as Error).message;
  }

  return result;
}

function printResult(r: TestResult) {
  const icon = r.error ? "❌" : r.success ? "✅" : "⚠️";
  const symbolIcon = r.symbolOk ? "✅" : "❌";
  const bodyIcon = r.bodyOk ? "✅" : "❌";
  const turnIcon = r.turnCountOk ? "✅" : "❌";

  console.log(`  ${icon} [${r.lang}] ${r.symbol} — ${r.label}`);
  if (r.error) {
    console.log(`       ERROR: ${r.error}`);
    return;
  }
  console.log(`       Symbol: ${symbolIcon}  Body: ${bodyIcon}  Turns: ${r.turnCount} ${turnIcon} (min ${TEST_DOCS.find(d => d.symbol === r.symbol)!.minTurns})`);
  console.log(`       President: ${r.presidentFound ? "✅" : "—"}  Members: ${r.membersCount}  Agenda: ${r.agendaCount}`);
  console.log(`       Speech: ${r.speechTurns}  Procedural: ${r.proceduralTurns}  LangAnnot: ${r.withLang}`);
  if (r.firstSpeaker) console.log(`       First: ${r.firstSpeaker}  Last: ${r.lastSpeaker}`);
}

async function main() {
  const args = process.argv.slice(2);
  const symbolFilter = args.find(a => a.startsWith("--symbol="))?.split("=")[1];
  const langFilter = args.find(a => a.startsWith("--lang="))?.split("=")[1]?.split(",");
  const quick = args.includes("--quick");

  const docs = symbolFilter
    ? TEST_DOCS.filter(d => d.symbol === symbolFilter)
    : TEST_DOCS;

  const langs = langFilter || (quick ? ["en"] : [...ALL_LANGS]);

  console.log(`\nPV Parser Test Matrix: ${docs.length} documents × ${langs.length} languages = ${docs.length * langs.length} runs\n`);

  const allResults: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let unavailable = 0;

  for (const doc of docs) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📄 ${doc.symbol} — ${doc.label}`);
    console.log(`${"=".repeat(70)}`);

    for (const lang of langs) {
      const result = await testDocument(doc, lang as string);
      allResults.push(result);
      printResult(result);

      if (result.error === "PDF not available") {
        unavailable++;
      } else if (result.success) {
        passed++;
      } else {
        failed++;
      }
    }
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log(`SUMMARY`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Total runs: ${allResults.length}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⬚  Unavailable: ${unavailable}`);

  // Show failures
  const failures = allResults.filter(r => !r.success && r.error !== "PDF not available");
  if (failures.length > 0) {
    console.log(`\nFailed tests:`);
    for (const f of failures) {
      const issues = [];
      if (!f.symbolOk) issues.push("symbol mismatch");
      if (!f.bodyOk) issues.push("body mismatch");
      if (!f.turnCountOk) issues.push(`only ${f.turnCount} turns`);
      if (f.error) issues.push(f.error);
      console.log(`  ${f.symbol} [${f.lang}]: ${issues.join(", ")}`);
    }
  }

  // Per-language summary
  console.log(`\nPer-language breakdown:`);
  for (const lang of langs) {
    const langResults = allResults.filter(r => r.lang === lang && r.error !== "PDF not available");
    const langPassed = langResults.filter(r => r.success).length;
    console.log(`  ${lang}: ${langPassed}/${langResults.length} passed`);
  }
}

main();
