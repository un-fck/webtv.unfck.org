#!/usr/bin/env tsx
/**
 * Phase 1 reporting: turn raw anchor lags into calibrated per-language-pair
 * statistics.
 *
 * Two corrections matter here.
 *
 * **Clock calibration.** Every language track is a separate audio flavor of
 * the same Kaltura entry, and the flavors are not guaranteed to start on the
 * same sample. We can measure that offset directly: when the floor is already
 * being spoken in language L, the L track is not interpreting anything — it is
 * the floor relayed — so its true lag is zero by construction. Whatever we
 * measure there is track offset, and it is subtracted from every other source
 * language on that same (session, track). Sessions where this null is large
 * are flagged rather than silently corrected.
 *
 * **Robust statistics.** Anchor pairing is occasionally wrong (the wrong
 * occurrence of a repeated number), which produces a long right tail that
 * would wreck a mean. Everything is reported as median and interquartile
 * range, and pairs with fewer than a floor of observations are withheld.
 */
import fs from "fs";
import path from "path";
import { STUDY_SESSIONS } from "./sessions";
import { pct } from "./align";

const OUT = path.join(__dirname, "out");

const FLOOR_LANG_ALIAS: Record<string, string> = {
  cmn: "zh",
  yue: "zh",
  arb: "ar",
};
const norm = (l?: string) => (l ? (FLOOR_LANG_ALIAS[l] ?? l) : "unknown");

interface RawAnchor {
  value: string;
  kind: string;
  surface: string;
  floorTime: number;
  targetTime: number;
  lagMs: number;
  sourceLanguage?: string;
  target: string;
  kalturaId: string;
  uncertaintyMs: number;
}

/**
 * Anchors whose combined timing uncertainty exceeds this are dropped from the
 * headline figures. Tracks transcribed by Azure LLM Speech (fr/es/ar/ru) carry
 * no word timestamps and merge whole statements into one segment, so a token
 * inside a 27 s segment is only located to ±13 s — noise far larger than the
 * lag itself. Anchors from AssemblyAI (en), Fun-ASR (zh) and Melia (floor)
 * have measured word times and pass freely.
 */
const MAX_UNCERTAINTY_MS = 3_000;

/** Minimum observations before a cell is reported at all. */
const MIN_N = 8;
/** A null-test offset larger than this means the session's tracks disagree
 * about their own clock; report it but don't trust the session. */
const SUSPECT_NULL_S = 2.5;

function main() {
  const anchors: RawAnchor[] = JSON.parse(
    fs.readFileSync(path.join(OUT, "lag-anchors.json"), "utf8"),
  );
  const labels = new Map(STUDY_SESSIONS.map((s) => [s.kalturaId, s.label]));

  // ── Step 1: per-(session, target) clock calibration from the null test ────
  const calib = new Map<string, { offsetS: number; n: number }>();
  const nullRows: Array<{
    session: string;
    target: string;
    offsetS: number;
    n: number;
    suspect: boolean;
  }> = [];

  for (const a of anchors) {
    const key = `${a.kalturaId}|${a.target}`;
    if (norm(a.sourceLanguage) !== a.target) continue;
    if (!calib.has(key)) calib.set(key, { offsetS: 0, n: 0 });
  }
  for (const key of calib.keys()) {
    const [kid, target] = key.split("|");
    const lags = anchors
      .filter(
        (a) =>
          a.kalturaId === kid &&
          a.target === target &&
          norm(a.sourceLanguage) === target &&
          a.uncertaintyMs <= MAX_UNCERTAINTY_MS,
      )
      .map((a) => a.lagMs / 1000);
    const offsetS = lags.length >= 3 ? pct(lags, 50) : 0;
    calib.set(key, { offsetS, n: lags.length });
    nullRows.push({
      session: labels.get(kid) ?? kid,
      target,
      offsetS,
      n: lags.length,
      suspect: Math.abs(offsetS) > SUSPECT_NULL_S,
    });
  }

  // ── Step 2: calibrated lags, grouped by source→target ────────────────────
  const cells = new Map<string, number[]>();
  const bySession = new Map<string, number[]>();
  // Anchor kind is a bias probe, not a result. A country name inside a
  // formulaic chair announcement ("I give the floor to the representative of
  // X") is anticipatable, so an interpreter can produce it almost in step with
  // the floor. A number cannot be anticipated — it has to be heard in full
  // before it can be said. If numbers lag further than country names, then the
  // anchor estimate as a whole is biased low as a measure of average EVS.
  const byKind = new Map<string, number[]>();

  for (const a of anchors) {
    const src = norm(a.sourceLanguage);
    if (src === "unknown") continue;
    if (src === a.target) continue; // the null itself, not interpretation
    if (a.uncertaintyMs > MAX_UNCERTAINTY_MS) continue;
    // Calibrate where a null test exists for this track. Where none does — the
    // floor never happened to be spoken in that track's language — fall back to
    // zero offset, which the measured nulls justify: they read 0.0–0.5 s on six
    // of the seven sessions.
    const c = calib.get(`${a.kalturaId}|${a.target}`);
    const offset = c && c.n >= 3 ? c.offsetS : 0;
    if (c && c.n >= 3 && Math.abs(c.offsetS) > SUSPECT_NULL_S) continue;
    const lag = a.lagMs / 1000 - offset;
    // Physically impossible values are pairing errors, not interpretation.
    if (lag < -10 || lag > 60) continue;
    const key = `${src}→${a.target}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(lag);
    if (!byKind.has(a.kind)) byKind.set(a.kind, []);
    byKind.get(a.kind)!.push(lag);
    const sk = `${a.kalturaId}|${key}`;
    if (!bySession.has(sk)) bySession.set(sk, []);
    bySession.get(sk)!.push(lag);
  }

  const rows = [...cells.entries()]
    .map(([pair, lags]) => ({
      pair,
      source: pair.split("→")[0],
      target: pair.split("→")[1],
      n: lags.length,
      medianS: pct(lags, 50),
      q1S: pct(lags, 25),
      q3S: pct(lags, 75),
    }))
    .filter((r) => r.n >= MIN_N)
    .sort((a, b) => b.medianS - a.medianS);

  // ── Step 3: by source language, pooled over targets ───────────────────────
  const bySource = new Map<string, number[]>();
  const byTarget = new Map<string, number[]>();
  for (const [pair, lags] of cells) {
    const [s, t] = pair.split("→");
    if (!bySource.has(s)) bySource.set(s, []);
    bySource.get(s)!.push(...lags);
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t)!.push(...lags);
  }

  const fmt = (v: number) => (v >= 0 ? " " : "") + v.toFixed(1);

  console.log("\n=== Clock calibration (null test: floor language == track) ===");
  console.log("A track carrying its own floor language is not interpreting;");
  console.log("its measured lag is pure track offset and should read ~0.\n");
  for (const r of nullRows.sort((a, b) => Math.abs(b.offsetS) - Math.abs(a.offsetS)))
    console.log(
      `  ${r.session.padEnd(24)} ${r.target.padEnd(3)} offset ${fmt(r.offsetS)}s  (n=${r.n})` +
        (r.suspect ? "   ⚠ SUSPECT" : ""),
    );

  console.log("\n=== Interpretation lag by language pair (calibrated) ===");
  console.log("source→target      n   median    IQR");
  for (const r of rows)
    console.log(
      `  ${r.pair.padEnd(12)} ${String(r.n).padStart(5)}   ${fmt(r.medianS)}s   ` +
        `[${fmt(r.q1S)}, ${fmt(r.q3S)}]`,
    );

  console.log("\n=== Pooled by SOURCE language (how hard to interpret FROM) ===");
  for (const [s, lags] of [...bySource.entries()]
    .filter(([, l]) => l.length >= MIN_N)
    .sort((a, b) => pct(b[1], 50) - pct(a[1], 50)))
    console.log(
      `  ${s.padEnd(4)} n=${String(lags.length).padStart(4)}  median ${fmt(pct(lags, 50))}s  ` +
        `IQR [${fmt(pct(lags, 25))}, ${fmt(pct(lags, 75))}]`,
    );

  console.log("\n=== Pooled by TARGET language (booth) ===");
  for (const [t, lags] of [...byTarget.entries()]
    .filter(([, l]) => l.length >= MIN_N)
    .sort((a, b) => pct(b[1], 50) - pct(a[1], 50)))
    console.log(
      `  ${t.padEnd(4)} n=${String(lags.length).padStart(4)}  median ${fmt(pct(lags, 50))}s  ` +
        `IQR [${fmt(pct(lags, 25))}, ${fmt(pct(lags, 75))}]`,
    );

  console.log("\n=== Bias probe: anchor kind ===");
  console.log("Countries are anticipatable in formulaic context; numbers are not.");
  for (const [k, lags] of byKind)
    console.log(
      `  ${k.padEnd(8)} n=${String(lags.length).padStart(4)}  median ${fmt(pct(lags, 50))}s  ` +
        `IQR [${fmt(pct(lags, 25))}, ${fmt(pct(lags, 75))}]`,
    );

  const all = [...cells.values()].flat();
  console.log(
    `\n=== Overall === n=${all.length}  median ${fmt(pct(all, 50))}s  ` +
      `IQR [${fmt(pct(all, 25))}, ${fmt(pct(all, 75))}]  ` +
      `p90 ${fmt(pct(all, 90))}s`,
  );

  fs.writeFileSync(
    path.join(OUT, "lag-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        minN: MIN_N,
        calibration: nullRows,
        byPair: rows,
        bySource: Object.fromEntries(
          [...bySource].map(([k, v]) => [
            k,
            { n: v.length, medianS: pct(v, 50), q1S: pct(v, 25), q3S: pct(v, 75) },
          ]),
        ),
        byKind: Object.fromEntries(
          [...byKind].map(([k, v]) => [
            k,
            { n: v.length, medianS: pct(v, 50), q1S: pct(v, 25), q3S: pct(v, 75) },
          ]),
        ),
        byTarget: Object.fromEntries(
          [...byTarget].map(([k, v]) => [
            k,
            { n: v.length, medianS: pct(v, 50), q1S: pct(v, 25), q3S: pct(v, 75) },
          ]),
        ),
        overall: {
          n: all.length,
          medianS: pct(all, 50),
          q1S: pct(all, 25),
          q3S: pct(all, 75),
          p90S: pct(all, 90),
        },
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.join(OUT, "lag-report.json")}`);
}

main();
