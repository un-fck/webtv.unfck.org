#!/usr/bin/env tsx
/**
 * Phase 1 — measure how far each interpreted language track runs behind the
 * floor (original) audio.
 *
 *   tsx analysis/interp-lag/run-lag.ts [--only=<kalturaId>] [--min-sim=0.5]
 *
 * Writes per-pair matches and a summary to analysis/interp-lag/out/.
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { STUDY_SESSIONS } from "./sessions";
import { loadDbTrack, loadFloorTrack, type Track } from "./extract";
import { alignChunks, summarize, pct, type Match } from "./align";
import { embedAll, embedSpend } from "./embed";
import { extractAnchors, anchorLags, type AnchorLag } from "./anchors";

/** Country names to look for on the floor track — the floor switches language. */
const ALL_LANGS = ["en", "fr", "es", "ar", "zh", "ru"];

const OUT = path.join(__dirname, "out");

/** Melia's per-word labels use ISO-639-3-ish codes; map to our track codes. */
const FLOOR_LANG_ALIAS: Record<string, string> = {
  cmn: "zh",
  yue: "zh",
  arb: "ar",
};
const normLang = (l?: string) => (l ? (FLOOR_LANG_ALIAS[l] ?? l) : undefined);

interface PairResult {
  kalturaId: string;
  label: string;
  target: string;
  floorChunks: number;
  targetChunks: number;
  summary: ReturnType<typeof summarize>;
  /** Lag broken out by the floor-side language actually being spoken. */
  bySourceLang: Record<
    string,
    { n: number; medianLagS: number; p10LagS: number; p90LagS: number }
  >;
  /** Primary, quantization-free measurement. See anchors.ts. */
  anchor: {
    n: number;
    medianLagS: number;
    p10LagS: number;
    p90LagS: number;
    bySourceLang: Record<string, { n: number; medianLagS: number }>;
  } | null;
}

function lagStats(lags: number[]) {
  return {
    n: lags.length,
    medianLagS: pct(lags, 50),
    p10LagS: pct(lags, 10),
    p90LagS: pct(lags, 90),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];
  const minSim = Number(
    args.find((a) => a.startsWith("--min-sim="))?.split("=")[1] ?? 0.5,
  );

  const sessions = only
    ? STUDY_SESSIONS.filter((s) => s.kalturaId === only)
    : STUDY_SESSIONS;

  fs.mkdirSync(OUT, { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: PairResult[] = [];
  const allMatches: Array<Match & { target: string; kalturaId: string }> = [];
  const allAnchors: Array<AnchorLag & { target: string; kalturaId: string }> =
    [];

  for (const s of sessions) {
    const floor = loadFloorTrack(s.kalturaId);
    if (!floor) {
      console.log(`[lag] ${s.kalturaId}: no cached floor transcript, skipping`);
      continue;
    }
    console.log(
      `\n[lag] ${s.label} (${s.kalturaId}) — floor: ${floor.tokens.length} tokens, ` +
        `${floor.chunks.length} chunks, ${floor.tokenRate.toFixed(1)} tok/s`,
    );

    const floorEmb = await embedAll(floor.chunks.map((c) => c.text));

    for (const target of s.targets) {
      const tt: Track | null = await loadDbTrack(pool, s.kalturaId, target);
      if (!tt || !tt.chunks.length) {
        console.log(`[lag]   ${target}: no DB transcript, skipping`);
        continue;
      }
      const targetEmb = await embedAll(tt.chunks.map((c) => c.text));
      const matches = alignChunks(
        floor.chunks,
        tt.chunks,
        floorEmb,
        targetEmb,
      );
      const summary = summarize(matches, minSim);

      // Break the lag out by what language the floor was actually in. This is
      // the interesting cut: lag is a property of the language PAIR, and the
      // floor of a UN meeting switches language every few minutes.
      const bySourceLang: PairResult["bySourceLang"] = {};
      const groups = new Map<string, number[]>();
      for (const m of matches) {
        if (m.similarity < minSim) continue;
        const src = normLang(m.sourceLanguage) ?? "unknown";
        if (!groups.has(src)) groups.set(src, []);
        groups.get(src)!.push(m.lagMs / 1000);
      }
      for (const [src, lags] of groups) {
        if (lags.length < 5) continue;
        bySourceLang[src] = {
          n: lags.length,
          medianLagS: pct(lags, 50),
          p10LagS: pct(lags, 10),
          p90LagS: pct(lags, 90),
        };
      }

      // Primary measurement: exact anchor pairs, using the DTW only to predict
      // where each anchor's counterpart should be.
      const fAnchors = extractAnchors(floor.tokens, ALL_LANGS);
      const tAnchors = extractAnchors(tt.tokens, [target]);
      const aLags = anchorLags(fAnchors, tAnchors, matches, floor.chunks, {
        minSim,
      });
      allAnchors.push(
        ...aLags.map((a) => ({ ...a, target, kalturaId: s.kalturaId })),
      );

      let anchor: PairResult["anchor"] = null;
      if (aLags.length >= 5) {
        const secs = aLags.map((a) => a.lagMs / 1000);
        const byLang: Record<string, { n: number; medianLagS: number }> = {};
        const g = new Map<string, number[]>();
        for (const a of aLags) {
          const src = normLang(a.sourceLanguage) ?? "unknown";
          if (!g.has(src)) g.set(src, []);
          g.get(src)!.push(a.lagMs / 1000);
        }
        for (const [k, v] of g)
          if (v.length >= 3) byLang[k] = { n: v.length, medianLagS: pct(v, 50) };
        anchor = { ...lagStats(secs), bySourceLang: byLang };
      }

      results.push({
        kalturaId: s.kalturaId,
        label: s.label,
        target,
        floorChunks: floor.chunks.length,
        targetChunks: tt.chunks.length,
        summary,
        bySourceLang,
        anchor,
      });
      for (const m of matches)
        allMatches.push({ ...m, target, kalturaId: s.kalturaId });

      const bits = Object.entries(bySourceLang)
        .map(([k, v]) => `${k}→${target} ${v.medianLagS.toFixed(1)}s (n=${v.n})`)
        .join("  ");
      console.log(
        `[lag]   ${target}: ${summary.confident}/${summary.matched} confident, ` +
          `median ${summary.medianLagS.toFixed(1)}s ` +
          `[p10 ${summary.p10LagS.toFixed(1)}, p90 ${summary.p90LagS.toFixed(1)}], ` +
          `sim ${summary.meanSimilarity.toFixed(2)}`,
      );
      if (bits) console.log(`[lag]     dtw by source: ${bits}`);
      if (anchor) {
        const ab = Object.entries(anchor.bySourceLang)
          .map(([k, v]) => `${k}→${target} ${v.medianLagS.toFixed(1)}s (n=${v.n})`)
          .join("  ");
        console.log(
          `[lag]     ANCHOR n=${anchor.n} median ${anchor.medianLagS.toFixed(1)}s ` +
            `[p10 ${anchor.p10LagS.toFixed(1)}, p90 ${anchor.p90LagS.toFixed(1)}]` +
            (ab ? `  ${ab}` : ""),
        );
      } else {
        console.log(`[lag]     ANCHOR too few pairs`);
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT, "lag-summary.json"),
    JSON.stringify({ minSim, results }, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT, "lag-matches.json"),
    JSON.stringify(allMatches, null, 1),
  );
  fs.writeFileSync(
    path.join(OUT, "lag-anchors.json"),
    JSON.stringify(allAnchors, null, 1),
  );
  console.log(
    `\n[lag] wrote out/lag-summary.json (${results.length} pairs), ` +
      `embedding spend ≈ $${embedSpend().toFixed(3)}`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
