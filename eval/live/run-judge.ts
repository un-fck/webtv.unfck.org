#!/usr/bin/env tsx
/**
 * Add semantic-adequacy scores to matrix-results.json.
 *
 * Run after run-matrix.ts. Kept separate because judging is the one metric
 * that costs money per re-run, and because a judge failure should never be
 * able to invalidate a completed measurement pass.
 *
 *   tsx eval/live/run-judge.ts [--dry-run]
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { fetchPVDocument } from "../ground-truth/documents-api";
import { parsePVDocument } from "../ground-truth/pdf-parser";
import { judgeAdequacy } from "./judge";
import { Pool } from "pg";
import { humanInterpreter, pivotSystem, loadFloorSegments } from "./systems";

const OUT = path.join(__dirname, "out");
const PV_CACHE = path.join(__dirname, "cache", "pv");
const RESULTS = path.join(OUT, "matrix-results.json");
const TEXTS = path.join(OUT, "system-texts.json");

async function getPVText(symbol: string, language: string): Promise<string> {
  const key = path.join(PV_CACHE, `${symbol.replace(/\//g, "_")}_${language}.txt`);
  if (fs.existsSync(key)) return fs.readFileSync(key, "utf8");
  const parsed = await parsePVDocument(await fetchPVDocument(symbol, language));
  fs.writeFileSync(key, parsed.fullText);
  return parsed.fullText;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const data = JSON.parse(fs.readFileSync(RESULTS, "utf8")) as {
    rows: Array<Record<string, unknown>>;
  };
  const texts: Record<string, string> = fs.existsSync(TEXTS)
    ? JSON.parse(fs.readFileSync(TEXTS, "utf8"))
    : {};

  const todo = data.rows.filter(
    (r) => r.adequacy == null && !r.error && r.chrf != null,
  );
  console.log(`[judge] ${todo.length} cell(s) to score`);
  if (dryRun) return;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  for (const r of todo) {
    const key = `${r.system}|${r.symbol}|${r.language}`;
    let hyp = texts[key];

    // Texts are re-derivable for the offline arms; live-arm outputs were saved
    // by the runner. Anything we cannot reconstruct is skipped rather than
    // guessed at.
    if (!hyp) {
      const cell = {
        kalturaId: "",
        symbol: String(r.symbol),
        language: String(r.language),
        durationS: 0,
        label: "",
      };
      const kid = findKalturaId(String(r.symbol));
      if (!kid) continue;
      cell.kalturaId = kid;
      const ctx = { pool, floorPcmPath: "", floorDurationMs: 0 };
      if (r.system === "A-human") hyp = (await humanInterpreter.produce(cell, ctx)).text;
      else if (r.system === "B-pivot" && loadFloorSegments(kid))
        hyp = (await pivotSystem.produce(cell, ctx)).text;
    }
    if (!hyp) {
      console.log(`  ${key}: no text available, skipping`);
      continue;
    }

    const pv = await getPVText(String(r.symbol), String(r.language));
    const res = await judgeAdequacy(pv, hyp, String(r.language));
    r.adequacy = res?.meanScore ?? null;
    console.log(
      `  ${key}: adequacy ${res ? res.meanScore.toFixed(1) : "n/a"} (${res?.windows ?? 0} windows)`,
    );
    fs.writeFileSync(RESULTS, JSON.stringify(data, null, 2));
  }

  await pool.end();
  console.log("[judge] done");
}

function findKalturaId(symbol: string): string | null {
  const { STUDY_SESSIONS } = require("../interp-lag/sessions") as {
    STUDY_SESSIONS: Array<{ kalturaId: string; pvSymbol: string | null }>;
  };
  return STUDY_SESSIONS.find((s) => s.pvSymbol === symbol)?.kalturaId ?? null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
