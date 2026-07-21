#!/usr/bin/env tsx
/**
 * Score arm A (human interpreter → our ASR) against arm B (floor ASR → Azure
 * OpenAI translation) on the same sessions, same target languages, same
 * ground truth.
 *
 *   tsx eval/live/run-arms.ts [--symbols=S/PV.10156,...] [--languages=en,fr]
 *                             [--dry-run]
 *
 * READ THIS BEFORE READING THE TABLE. A UN verbatim record in French is not a
 * transcript of the French interpreter. It is the original speech rendered by
 * UN *translators*, working from text, with unlimited time, and edited to a
 * published standard. That makes it a translation reference — which is arm B's
 * home game and arm A's away game. Arm A is penalised for every compression,
 * reordering and omission that simultaneous interpreting *requires*, none of
 * which is an error. So arm A's score is not a quality verdict on the
 * interpreters; it is the ceiling that "professional human under real-time
 * constraint" scores on this metric, and arm B should be read relative to it.
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { STUDY_SESSIONS } from "../interp-lag/sessions";
import { fetchPVDocument } from "../ground-truth/documents-api";
import { parsePVDocument } from "../ground-truth/pdf-parser";
import { computeMetrics } from "../metrics";
import { pivotTranslate, type FloorSegment } from "./translate-pivot";

const OUT = path.join(__dirname, "out");
const PV_CACHE = path.join(__dirname, "cache", "pv");
const FLOOR_CACHE = path.join(__dirname, "..", "interp-lag", "cache", "floor");

const LANGS = ["en", "fr", "es", "ar", "ru", "zh"];

interface Row {
  symbol: string;
  language: string;
  arm: "A-interpreter" | "B-pivot";
  wer: number;
  normalizedWer: number;
  cer: number;
  normalizedCer: number;
  refWords: number;
  hypWords: number;
}

/**
 * Chinese is written without spaces, so word-level WER against a PV document
 * is meaningless — it reads ~90-100% no matter how good the transcript is.
 * Character error rate is the standard substitute. `primaryRate` picks the
 * metric that actually carries signal for each language.
 */
const CHARACTER_SCORED = new Set(["zh"]);
const primaryRate = (r: Row) =>
  CHARACTER_SCORED.has(r.language) ? r.normalizedCer : r.normalizedWer;
const primaryLabel = (lang: string) =>
  CHARACTER_SCORED.has(lang) ? "CER" : "WER";

async function getPVText(symbol: string, language: string): Promise<string> {
  fs.mkdirSync(PV_CACHE, { recursive: true });
  const key = path.join(
    PV_CACHE,
    `${symbol.replace(/\//g, "_")}_${language}.txt`,
  );
  if (fs.existsSync(key)) return fs.readFileSync(key, "utf8");
  const pdf = await fetchPVDocument(symbol, language);
  const parsed = await parsePVDocument(pdf);
  fs.writeFileSync(key, parsed.fullText);
  return parsed.fullText;
}

/** Arm A: what our production pipeline produced from the interpreted track. */
async function armAText(
  pool: Pool,
  kalturaId: string,
  language: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT content FROM webtv.transcripts
      WHERE kaltura_id = $1 AND language_code = $2
        AND transcription_status = 'completed'
      ORDER BY updated_at DESC LIMIT 1`,
    [kalturaId, language],
  );
  if (!r.rows.length) return null;
  const c = r.rows[0].content as {
    statements?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text: string }> }> }>;
  };
  const parts: string[] = [];
  for (const st of c.statements ?? [])
    for (const p of st.paragraphs ?? [])
      for (const s of p.sentences ?? []) parts.push(s.text);
  const text = parts.join(" ").trim();
  return text || null;
}

function loadFloorSegments(kalturaId: string): FloorSegment[] | null {
  const p = path.join(FLOOR_CACHE, `${kalturaId}.json`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8")) as {
    utterances: Array<{ start: number; end: number; text: string }>;
  };
  return d.utterances.map((u) => ({
    start: u.start,
    end: u.end,
    text: u.text,
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const symbolArg = args.find((a) => a.startsWith("--symbols="))?.split("=")[1];
  const langArg = args.find((a) => a.startsWith("--languages="))?.split("=")[1];
  const languages = langArg ? langArg.split(",") : LANGS;

  // Only sessions with a PV symbol can be scored — the ground truth is the
  // verbatim record, and briefings don't have one.
  let sessions = STUDY_SESSIONS.filter((s) => s.pvSymbol);
  if (symbolArg) {
    const want = new Set(symbolArg.split(","));
    sessions = sessions.filter((s) => want.has(s.pvSymbol!));
  }

  console.log(
    `[arms] ${sessions.length} session(s) × ${languages.length} language(s)`,
  );
  for (const s of sessions)
    console.log(
      `  ${s.pvSymbol}  ${(s.durationS / 60).toFixed(0)} min  tracks: ${s.targets.join(",")}`,
    );
  if (dryRun) {
    console.log(
      "[arms] --dry-run: arm A is free (DB), arm B costs Azure OpenAI tokens only",
    );
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rows: Row[] = [];
  let inTok = 0;
  let outTok = 0;

  for (const s of sessions) {
    const symbol = s.pvSymbol!;
    console.log(`\n[arms] ${symbol} (${s.label})`);
    const floor = loadFloorSegments(s.kalturaId);
    if (!floor) {
      console.log("  no cached floor transcript, skipping arm B");
    }

    for (const lang of languages) {
      let pv: string;
      try {
        pv = await getPVText(symbol, lang);
      } catch (e) {
        console.log(`  ${lang}: no PV (${(e as Error).message.slice(0, 60)})`);
        continue;
      }

      // ── Arm A ──
      const a = await armAText(pool, s.kalturaId, lang);
      if (a) {
        const m = computeMetrics(pv, a, lang);
        rows.push({
          symbol,
          language: lang,
          arm: "A-interpreter",
          wer: m.wer.wer,
          normalizedWer: m.normalizedWer.wer,
          cer: m.wer.cer,
          normalizedCer: m.normalizedWer.cer,
          refWords: m.wer.refLength,
          hypWords: m.wer.hypLength,
        });
        console.log(
          `  ${lang} A-interpreter  WER ${(m.normalizedWer.wer * 100).toFixed(1)}%  CER ${(m.normalizedWer.cer * 100).toFixed(1)}%`,
        );
      } else {
        console.log(`  ${lang} A-interpreter  — no transcript in DB`);
      }

      // ── Arm B ──
      if (floor) {
        const pivot = await pivotTranslate(s.kalturaId, floor, lang);
        inTok += pivot.usage.inputTokens;
        outTok += pivot.usage.outputTokens;
        const m = computeMetrics(pv, pivot.fullText, lang);
        rows.push({
          symbol,
          language: lang,
          arm: "B-pivot",
          wer: m.wer.wer,
          normalizedWer: m.normalizedWer.wer,
          cer: m.wer.cer,
          normalizedCer: m.normalizedWer.cer,
          refWords: m.wer.refLength,
          hypWords: m.wer.hypLength,
        });
        console.log(
          `  ${lang} B-pivot        WER ${(m.normalizedWer.wer * 100).toFixed(1)}%  CER ${(m.normalizedWer.cer * 100).toFixed(1)}%`,
        );
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT, "arms-ab.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );

  // ── Head-to-head, only where both arms produced something ────────────────
  console.log("\n=== Arm A (interpreter) vs Arm B (floor ASR → MT) ===");
  console.log("vs PV verbatim record, lower is better; CER for zh, WER otherwise\n");
  console.log("symbol        lang  metric   A-interp   B-pivot    delta");
  const key = (r: Row) => `${r.symbol}|${r.language}`;
  const byKey = new Map<string, Partial<Record<Row["arm"], Row>>>();
  for (const r of rows) {
    if (!byKey.has(key(r))) byKey.set(key(r), {});
    byKey.get(key(r))![r.arm] = r;
  }
  const deltas: number[] = [];
  for (const [k, v] of byKey) {
    const [sym, lang] = k.split("|");
    if (!v["A-interpreter"] || !v["B-pivot"]) continue;
    const a = primaryRate(v["A-interpreter"]!) * 100;
    const b = primaryRate(v["B-pivot"]!) * 100;
    deltas.push(b - a);
    console.log(
      `${sym.padEnd(13)} ${lang.padEnd(5)} ${primaryLabel(lang).padEnd(7)} ${a.toFixed(1).padStart(7)}%  ${b.toFixed(1).padStart(8)}%  ${(b - a >= 0 ? "+" : "") + (b - a).toFixed(1)}`,
    );
  }
  if (deltas.length) {
    const mean = deltas.reduce((x, y) => x + y, 0) / deltas.length;
    console.log(
      `\nmean delta ${(mean >= 0 ? "+" : "") + mean.toFixed(1)} pts ` +
        `(negative = pivot beats interpreter on this metric)`,
    );
  }
  console.log(
    `\nAzure OpenAI tokens: ${inTok} in / ${outTok} out` +
      `\nwrote ${path.join(OUT, "arms-ab.json")}`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
