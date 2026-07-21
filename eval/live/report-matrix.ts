#!/usr/bin/env tsx
/**
 * Turn matrix-results.json into something a human can read and act on.
 *
 * Two rules govern the presentation:
 *
 * 1. **Every comparison is within a cell.** Session difficulty swamps system
 *    differences — the same human English interpretation scores 35.7% WER on
 *    one meeting and 15.9% on another — so a system is only ever compared to
 *    another system on the SAME session and SAME language, and only those
 *    paired deltas are averaged.
 *
 * 2. **Quality and latency are never combined.** They are independent
 *    properties and a system can be excellent at one and hopeless at the
 *    other. Two tables, no composite score, no ranking that mixes them.
 */
import fs from "fs";
import path from "path";

const OUT = path.join(__dirname, "out");

interface Row {
  system: string;
  arm: string;
  symbol: string;
  language: string;
  errorRate: number | null;
  errorMetric: string;
  chrf: number | null;
  adequacy?: number | null;
  medianLagS: number | null;
  p90LagS: number | null;
  atdS: number | null;
  costUsd: number | null;
  error?: string;
}

/** Phase 1 measurement — the number the machines are being compared against. */
const HUMAN_LAG_MEDIAN_S = 1.6;
const HUMAN_LAG_BY_SOURCE = "0.9 s from English, 4.7 s from Arabic";

const LABELS: Record<string, string> = {
  "A-human": "Human interpreter → ASR",
  "B-pivot": "Floor ASR → Azure MT",
  "C-soniox-rt-v5": "Soniox live translate",
  "D-openai-realtime-s2s": "OpenAI Realtime S2S",
};

const f1 = (v: number | null | undefined, suffix = "") =>
  v == null || Number.isNaN(v) ? "   —  " : v.toFixed(1) + suffix;

function main() {
  const data = JSON.parse(
    fs.readFileSync(path.join(OUT, "matrix-results.json"), "utf8"),
  ) as { rows: Row[] };
  const rows = data.rows;

  const systems = [...new Set(rows.map((r) => r.system))];
  const cells = [...new Set(rows.map((r) => `${r.symbol}|${r.language}`))];
  const get = (sys: string, cell: string) =>
    rows.find((r) => r.system === sys && `${r.symbol}|${r.language}` === cell);

  const lines: string[] = [];
  const say = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  // ── QUALITY ───────────────────────────────────────────────────────────────
  say("");
  say("════ QUALITY (independent of latency) ════");
  say("");
  say("chrF++ against the official verbatim record. Higher is better.");
  say("chrF++ is the translation metric: it scores character n-gram overlap,");
  say("so it survives legitimate paraphrase and works the same in every script");
  say("(unlike WER, which is meaningless for Chinese and unstable for Arabic).");
  say("");

  const header =
    "cell".padEnd(22) + systems.map((s) => s.padEnd(24)).join("");
  say(header);
  say("─".repeat(header.length));
  for (const cell of cells.sort()) {
    const [sym, lang] = cell.split("|");
    let line = `${sym} ${lang}`.padEnd(22);
    for (const s of systems) {
      const r = get(s, cell);
      line +=
        (r?.chrf != null ? f1(r.chrf) : r?.error ? "(no data)" : "   —  ").padEnd(
          24,
        );
    }
    say(line);
  }

  // Paired deltas vs the human baseline — the only valid aggregate.
  say("");
  say("Mean chrF++ difference vs the human baseline, paired within each cell:");
  say("(positive = the machine preserved more of the record than the human did)");
  say("");
  for (const s of systems) {
    if (s === "A-human") continue;
    const deltas: number[] = [];
    for (const cell of cells) {
      const a = get("A-human", cell);
      const b = get(s, cell);
      if (a?.chrf != null && b?.chrf != null) deltas.push(b.chrf - a.chrf);
    }
    if (!deltas.length) {
      say(`  ${(LABELS[s] ?? s).padEnd(26)} no paired cells`);
      continue;
    }
    const mean = deltas.reduce((x, y) => x + y, 0) / deltas.length;
    say(
      `  ${(LABELS[s] ?? s).padEnd(26)} ${(mean >= 0 ? "+" : "") + mean.toFixed(1)} chrF++  ` +
        `(n=${deltas.length} cells, ${deltas.filter((d) => d > 0).length} wins)`,
    );
  }

  // Adequacy, if the judge has been run.
  const hasAdequacy = rows.some((r) => r.adequacy != null);
  if (hasAdequacy) {
    say("");
    say("Semantic adequacy (0-100), judged on content preserved, ignoring wording:");
    say("");
    let h = "cell".padEnd(22) + systems.map((s) => s.padEnd(24)).join("");
    say(h);
    say("─".repeat(h.length));
    for (const cell of cells.sort()) {
      const [sym, lang] = cell.split("|");
      let line = `${sym} ${lang}`.padEnd(22);
      for (const s of systems) line += f1(get(s, cell)?.adequacy).padEnd(24);
      say(line);
    }
    say("");
    for (const s of systems) {
      if (s === "A-human") continue;
      const d: number[] = [];
      for (const cell of cells) {
        const a = get("A-human", cell);
        const b = get(s, cell);
        if (a?.adequacy != null && b?.adequacy != null)
          d.push(b.adequacy - a.adequacy);
      }
      if (d.length) {
        const mean = d.reduce((x, y) => x + y, 0) / d.length;
        say(
          `  ${(LABELS[s] ?? s).padEnd(26)} ${(mean >= 0 ? "+" : "") + mean.toFixed(1)} adequacy  (n=${d.length})`,
        );
      }
    }
  }

  // ── LATENCY ───────────────────────────────────────────────────────────────
  say("");
  say("════ LATENCY (independent of quality) ════");
  say("");
  say(`Human interpreter baseline, measured in Phase 1: ${HUMAN_LAG_MEDIAN_S} s median`);
  say(`(${HUMAN_LAG_BY_SOURCE})`);
  say("");
  say("Offline arms have no latency by construction and are omitted here.");
  say("");
  say(
    "system".padEnd(28) +
      "lang".padEnd(6) +
      "median".padEnd(10) +
      "p90".padEnd(10) +
      "ATD".padEnd(10) +
      "vs human",
  );
  say("─".repeat(80));
  for (const s of systems) {
    for (const cell of cells.sort()) {
      const r = get(s, cell);
      if (!r || r.medianLagS == null) continue;
      say(
        (LABELS[s] ?? s).padEnd(28) +
          r.language.padEnd(6) +
          f1(r.medianLagS, "s").padEnd(10) +
          f1(r.p90LagS, "s").padEnd(10) +
          f1(r.atdS, "s").padEnd(10) +
          `${(r.medianLagS / HUMAN_LAG_MEDIAN_S).toFixed(1)}× slower`,
      );
    }
  }

  // ── COST ──────────────────────────────────────────────────────────────────
  const totalCost = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  say("");
  say(`Total metered spend across all recorded runs: $${totalCost.toFixed(2)}`);

  const failures = rows.filter((r) => r.error);
  if (failures.length) {
    say("");
    say("Cells with problems:");
    for (const r of failures)
      say(`  ${r.system} ${r.symbol} ${r.language}: ${r.error}`);
  }

  fs.writeFileSync(path.join(OUT, "REPORT.txt"), lines.join("\n"));
  console.log(`\nwrote ${path.join(OUT, "REPORT.txt")}`);
}

main();
