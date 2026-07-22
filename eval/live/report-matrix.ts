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
const PV_CACHE = path.join(__dirname, "cache", "pv");
const TEXTS = path.join(OUT, "system-texts.json");

/**
 * Coverage — how much of the record the system actually produced, by
 * non-whitespace character count.
 *
 * This separates the two ways a system can score badly, which every overlap
 * metric conflates: saying wrong things, and not saying most things. A
 * turn-based speech-to-speech model scored 7/100 on adequacy here not because
 * its interpretation was wrong — it was fluent and correct — but because it
 * emitted only a tenth of the meeting. Without this column that looks like a
 * quality failure instead of what it is.
 */
function coverageMap(): Record<string, number> {
  if (!fs.existsSync(TEXTS)) return {};
  const texts = JSON.parse(fs.readFileSync(TEXTS, "utf8")) as Record<string, string>;
  const norm = (x: string) => x.replace(/\s+/g, "");
  const out: Record<string, number> = {};
  for (const [k, hyp] of Object.entries(texts)) {
    const [, sym, lang] = k.split("|");
    const p = path.join(PV_CACHE, `${sym.replace(/\//g, "_")}_${lang}.txt`);
    if (!fs.existsSync(p)) continue;
    const ref = norm(fs.readFileSync(p, "utf8"));
    if (!ref.length) continue;
    out[k] = (norm(hyp).length / ref.length) * 100;
  }
  return out;
}

interface Row {
  system: string;
  arm: string;
  symbol: string;
  language: string;
  errorRate: number | null;
  errorMetric: string;
  chrf: number | null;
  adequacy?: number | null;
  ntr?: number | null;
  ntrTranslationLoss?: number | null;
  ntrRecognitionLoss?: number | null;
  medianLagS: number | null;
  p90LagS: number | null;
  atdS: number | null;
  captionSegmented?: boolean | null;
  captionMeanChars?: number | null;
  captionsPerMinute?: number | null;
  captionReadingRate?: number | null;
  captionShareOverLimit?: number | null;
  costUsd: number | null;
  error?: string;
}

/** Phase 1 measurement — the number the machines are being compared against. */
const HUMAN_LAG_MEDIAN_S = 1.6;
const HUMAN_LAG_BY_SOURCE = "0.9 s from English, 4.7 s from Arabic";

/**
 * Latency a system incurs BEFORE the point its own instrumentation can see.
 *
 * Soniox's translation tokens carry no timestamps, so they can only be
 * anchored to the last finalized SOURCE token. The measured per-token lag is
 * therefore the gap from "the ASR finalized this word" to "its translation is
 * out" — it omits how long the ASR took to finalize the word after it was
 * actually spoken. That omitted half is exactly measurable (source tokens DO
 * carry timestamps) and probe-srclag.ts measures it at 2.38 s median / 4.88 s
 * p90 over a full session.
 *
 * Without this correction the table reads 0.6 s and implies the model beats a
 * human interpreter by 3x. It does not.
 */
const PRE_INSTRUMENT_LAG_S: Record<string, number> = {
  "C-soniox-rt-v5": 2.38,
};

const LABELS: Record<string, string> = {
  "A-human": "Human interpreter → ASR",
  "B-pivot": "Floor ASR → Azure MT",
  "C-soniox-rt-v5": "Soniox live translate",
  "D-openai-realtime-s2s": "OpenAI Realtime S2S",
  "C-openai-realtime-text": "OpenAI Realtime text",
  "C-caption-deepgram-multi-gtranslate": "Deepgram→GTranslate [YouTube]",
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
  say("so it survives legitimate paraphrase and works the same in every script.");
  say("");
  say("It is primary here, and WER/CER are secondary, for two concrete reasons:");
  say("  - computeWER() falls back to PROPORTIONAL CHUNKING above 3,000 words,");
  say("    comparing chunk i of the reference to chunk i of the hypothesis. Any");
  say("    drift between them inflates the score, so WER on the 82-minute");
  say("    session is an approximation. chrF++ has no such cutoff.");
  say("  - Chinese has no word boundaries, so word-level WER is noise, and its");
  say("    CER exceeded 100% on one cell — an artifact, not a measurement.");
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

  // Coverage table — the explanatory column.
  const cov = coverageMap();
  if (Object.keys(cov).length) {
    say("");
    say("Coverage: how much of the record the system actually produced (%).");
    say("Distinguishes saying WRONG things from not saying MOST things.");
    say("");
    let h = "cell".padEnd(22) + systems.map((s) => s.padEnd(24)).join("");
    say(h);
    say("─".repeat(h.length));
    for (const cell of cells.sort()) {
      const [sym, lang] = cell.split("|");
      let line = `${sym} ${lang}`.padEnd(22);
      for (const s of systems) {
        const v = cov[`${s}|${sym}|${lang}`];
        line += (v == null ? "   —  " : v.toFixed(0) + "%").padEnd(24);
      }
      say(line);
    }
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

  // ── NTR ───────────────────────────────────────────────────────────────────
  if (rows.some((r) => r.ntr != null)) {
    say("");
    say("NTR — the model broadcasters actually certify live subtitles with.");
    say("Errors are weighted by how much MEANING they destroy (minor 0.25,");
    say("standard 0.5, serious 1.0) instead of counted equally, and split by");
    say("origin: translation error vs speech-recognition error. The accepted");
    say("broadcast threshold is 98.");
    say("");
    say("⚠ READ THIS WITH THE COVERAGE TABLE. NTR's denominator is the");
    say("  candidate's OWN word count, so a system that drops half the meeting");
    say("  but renders the rest cleanly still scores well. NTR says how good");
    say("  the subtitles that appeared were; coverage says how much appeared.");
    say("");
    let h = "cell".padEnd(22) + systems.map((s) => s.padEnd(24)).join("");
    say(h);
    say("─".repeat(h.length));
    for (const cell of cells.sort()) {
      const [sym, lang] = cell.split("|");
      let line = `${sym} ${lang}`.padEnd(22);
      for (const s of systems) line += f1(get(s, cell)?.ntr).padEnd(24);
      say(line);
    }
    say("");
    say("Where the loss comes from (mean points lost per system):");
    for (const s of systems) {
      const rs = cells.map((c) => get(s, c)).filter((r) => r?.ntr != null);
      if (!rs.length) continue;
      const mean = (f: (x: Row) => number | null | undefined) => {
        const v = rs.map((r) => f(r!)).filter((n): n is number => n != null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
      };
      say(
        `  ${(LABELS[s] ?? s).padEnd(30)} translation −${mean((x) => x.ntrTranslationLoss).toFixed(1)}   ` +
          `recognition −${mean((x) => x.ntrRecognitionLoss).toFixed(1)}`,
      );
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
  say("'measured' is what the provider's own token stream exposes.");
  say("'end-to-end' adds latency incurred before that instrumentation can see it");
  say("(for Soniox, +2.4 s of ASR finalization, measured by probe-srclag.ts).");
  say("End-to-end is the number comparable to the human booths.");
  say("");
  say(
    "system".padEnd(26) +
      "session".padEnd(13) +
      "lang".padEnd(5) +
      "measured".padEnd(10) +
      "end-to-end".padEnd(12) +
      "vs human",
  );
  say("─".repeat(90));
  for (const s of systems) {
    const pre = PRE_INSTRUMENT_LAG_S[s] ?? 0;
    for (const cell of cells.sort()) {
      const r = get(s, cell);
      if (!r || r.medianLagS == null) continue;
      const e2e = r.medianLagS + pre;
      const ratio = e2e / HUMAN_LAG_MEDIAN_S;
      say(
        (LABELS[s] ?? s).padEnd(26) +
          r.symbol.padEnd(13) +
          r.language.padEnd(5) +
          f1(r.medianLagS, "s").padEnd(10) +
          f1(e2e, "s").padEnd(12) +
          (ratio >= 1
            ? `${ratio.toFixed(1)}× slower than human`
            : `${(1 / ratio).toFixed(1)}× faster than human`),
      );
    }
  }
  say("");
  say("p90 tells a harsher story than the median for the live text model:");
  for (const s of systems) {
    const vals = cells
      .map((c) => get(s, c))
      .filter((r) => r?.p90LagS != null)
      .map((r) => r!.p90LagS!);
    if (!vals.length) continue;
    const worst = Math.max(...vals);
    say(`  ${(LABELS[s] ?? s).padEnd(26)} worst p90 across cells: ${worst.toFixed(1)}s`);
  }

  // ── CAPTION READABILITY ───────────────────────────────────────────────────
  const capRows = rows.filter((r) => r.captionSegmented != null);
  if (capRows.length) {
    say("");
    say("════ CAPTION READABILITY ════");
    say("");
    say("A stream of correct words is not captioning. Live-subtitle practice");
    say("judges whether a viewer can READ the result: how much text lands at");
    say("once and how fast it is replaced. ~21 chars/sec is the usual adult");
    say("ceiling; above it, line one is still being read when line two arrives.");
    say("");
    say("'segmented: no' means the system emits token fragments, not caption");
    say("units — it is not a captioning system, and anyone shipping it as one");
    say("must add segmentation, line-breaking and timing themselves.");
    say("");
    say(
      "system".padEnd(34) +
        "segmented".padEnd(11) +
        "chars/cap".padEnd(11) +
        "caps/min".padEnd(10) +
        "read rate".padEnd(11) +
        "over limit",
    );
    say("─".repeat(92));
    const seen = new Set<string>();
    for (const r of capRows) {
      if (seen.has(r.system)) continue;
      seen.add(r.system);
      const same = capRows.filter((x) => x.system === r.system);
      const avg = (f: (x: Row) => number | null | undefined) => {
        const v = same.map(f).filter((n): n is number => n != null && !Number.isNaN(n));
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
      };
      const seg = same.some((x) => x.captionSegmented);
      say(
        (LABELS[r.system] ?? r.system).padEnd(34) +
          (seg ? "yes" : "NO").padEnd(11) +
          f1(avg((x) => x.captionMeanChars)).padEnd(11) +
          f1(avg((x) => x.captionsPerMinute)).padEnd(10) +
          (seg ? f1(avg((x) => x.captionReadingRate)) + "/s" : "   n/a").padEnd(11) +
          (seg
            ? (avg((x) => x.captionShareOverLimit) * 100).toFixed(0) + "%"
            : "n/a"),
      );
    }
  }

  // ── COST ──────────────────────────────────────────────────────────────────
  const totalCost = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  say("");
  say(
    `Metered spend across recorded runs: $${totalCost.toFixed(2)} ` +
      `(under-counts: arm D's audio tokens and arm B's Azure OpenAI tokens are not metered here)`,
  );

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
