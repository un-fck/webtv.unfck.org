#!/usr/bin/env python3
"""
Accuracy analysis.

PRE-REGISTERED PRIMARY ENDPOINT
-------------------------------
    A0 (AssemblyAI @ 64k mono mp3)  vs  A2 (azure-llm @ 64k mono mp3)
    micro-averaged normalized WER, `spelling` variant.

A0 vs A2 is the only comparison where both arms receive the BYTE-IDENTICAL audio
file, so it is the only one that isolates the model rather than the codec. Every
other comparison here is exploratory and labelled as such. Naming one endpoint in
advance is what stops four arms x five normalization variants x several metrics
from becoming a search for a favourable cell (6 pairwise x 5 variants = 30 tests;
at 95% each, the chance of at least one spurious "significant" is ~79%).

MICRO vs MACRO
--------------
The corpus spans 92 to 17,700 reference words — a factor of 192. An unweighted
mean over sessions gives a 92-word procedural clip the same vote as a 2h33m
debate: the six sessions under 1,000 words hold ~3% of the evidence but a third
of the macro mean, and on the shortest one a SINGLE word error moves the corpus
verdict by more than the whole effect under test. So:
  - MICRO (sum of errors / sum of reference words) is the headline. It weights by
    evidence and is the estimator that matches the decision, which is about
    hours of audio, not counts of meetings.
  - MACRO is reported alongside for comparability with SYNTHESIS §14.1/§15.1,
    which used it.
Where the two disagree, that disagreement is itself reported rather than resolved
by picking the friendlier one.
"""
import json
import random
import statistics as st
import sys
from collections import defaultdict

SCORES = "/Volumes/SSDAStorage/un-en-bakeoff/scores.json"
PRIMARY = ("A0", "A2", "spelling")

ARM_LABEL = {
    "A0": "AssemblyAI U-3.5 Pro @ 64k mp3  (matched-input control)",
    "A1": "AssemblyAI U-3.5 Pro @ orig AAC (production today)",
    "A2": "azure-llm-speech @ 64k mp3      (production-equivalent)",
    "A3": "azure-llm-speech @ 128k mp3     (transcode headroom)",
}
VARIANTS = ["strict", "apos", "spelling", "numbers", "full"]


def boot_ci(vals, iters=20000, seed=20260728):
    """Percentile bootstrap with a real RNG (see module docstring of analyse-speed)."""
    if len(vals) < 2:
        return (float("nan"), float("nan"))
    rnd = random.Random(seed)
    n = len(vals)
    means = sorted(sum(vals[rnd.randrange(n)] for _ in range(n)) / n for _ in range(iters))
    return means[int(iters * 0.025)], means[int(iters * 0.975)]


def boot_ci_micro(pairs, iters=20000, seed=20260728):
    """Bootstrap the MICRO average: resample sessions, recompute sum(err)/sum(ref)."""
    if len(pairs) < 2:
        return (float("nan"), float("nan"))
    rnd = random.Random(seed)
    n = len(pairs)
    out = []
    for _ in range(iters):
        e = r = 0
        for _ in range(n):
            de, dr = pairs[rnd.randrange(n)]
            e += de
            r += dr
        out.append(e / r if r else float("nan"))
    out.sort()
    return out[int(iters * 0.025)], out[int(iters * 0.975)]


def main():
    rows = json.load(open(SCORES))
    # one row per (arm, dir); if repeats exist, use pass 1 for accuracy so the
    # accuracy set is a single well-defined draw rather than an arbitrary one.
    best = {}
    for r in rows:
        k = (r["arm"], r["dir"])
        if k not in best or (r.get("pass") or 1) < (best[k].get("pass") or 1):
            best[k] = r
    rows = list(best.values())

    arms = sorted({r["arm"] for r in rows})
    sessions_by_arm = {a: {r["dir"] for r in rows if r["arm"] == a} for a in arms}
    common = set.intersection(*sessions_by_arm.values()) if sessions_by_arm else set()

    print("=" * 110)
    print("COVERAGE — the denominator is fixed to the sessions ALL arms completed")
    print("=" * 110)
    for a in arms:
        missing = sorted(common.symmetric_difference(sessions_by_arm[a]) & sessions_by_arm[a])
        print(f"  {a}: {len(sessions_by_arm[a])} sessions" + (f"   extra: {missing}" if missing else ""))
    for a in arms:
        miss = sorted(common - sessions_by_arm[a])
        if miss:
            print(f"  !! {a} MISSING: {miss}")
    print(f"  common to all arms: n = {len(common)}")
    print(f"  sessions: {', '.join(sorted(common))}")

    for variant in VARIANTS:
        print()
        print("=" * 110)
        print(f"VARIANT: {variant}")
        print("=" * 110)
        print(f"{'arm':<4} {'micro WER':>10} {'95% CI':>18} {'macro WER':>10} {'95% CI':>18} {'S':>7} {'I':>7} {'D':>7}")
        stats = {}
        for a in arms:
            rs = [r for r in rows if r["arm"] == a and r["dir"] in common]
            errs = sum(r["variants"][variant]["errors"] for r in rs)
            refs = sum(r["variants"][variant]["refLen"] for r in rs)
            micro = errs / refs
            macro_vals = [r["variants"][variant]["wer"] for r in rs]
            mlo, mhi = boot_ci(macro_vals)
            ulo, uhi = boot_ci_micro([(r["variants"][variant]["errors"], r["variants"][variant]["refLen"]) for r in rs])
            S = sum(r["variants"][variant]["S"] for r in rs)
            I = sum(r["variants"][variant]["I"] for r in rs)
            D = sum(r["variants"][variant]["D"] for r in rs)
            stats[a] = dict(micro=micro, macro=st.fmean(macro_vals), rows=rs)
            print(
                f"{a:<4} {100*micro:>9.2f}% [{100*ulo:>6.2f},{100*uhi:>6.2f}] "
                f"{100*st.fmean(macro_vals):>9.2f}% [{100*mlo:>6.2f},{100*mhi:>6.2f}] "
                f"{S:>7} {I:>7} {D:>7}   {ARM_LABEL.get(a,'')}"
            )

        # paired deltas, all pairs
        print(f"\n  paired deltas (per-session, negative = first arm better):")
        for i, a in enumerate(arms):
            for b in arms[i + 1:]:
                ra = {r["dir"]: r["variants"][variant] for r in rows if r["arm"] == a and r["dir"] in common}
                rb = {r["dir"]: r["variants"][variant] for r in rows if r["arm"] == b and r["dir"] in common}
                d = [100 * (ra[s]["wer"] - rb[s]["wer"]) for s in sorted(common)]
                lo, hi = boot_ci(d)
                wins = sum(1 for x in d if x < 0)
                # micro delta
                mia = sum(ra[s]["errors"] for s in common) / sum(ra[s]["refLen"] for s in common)
                mib = sum(rb[s]["errors"] for s in common) / sum(rb[s]["refLen"] for s in common)
                tag = "  <<< PRIMARY ENDPOINT" if (a, b, variant) == PRIMARY else ""
                verdict = "better" if hi < 0 else ("worse" if lo > 0 else "tied")
                print(
                    f"    {a} vs {b}: macro Δ={st.fmean(d):+6.2f} [{lo:+6.2f},{hi:+6.2f}]  "
                    f"micro Δ={100*(mia-mib):+6.2f}  {a} wins {wins}/{len(d)}  -> {a} is {verdict}{tag}"
                )

    # ---- codec equivalence (TOST), pre-registered margin +/- 0.5 WER points
    print()
    print("=" * 110)
    print("CODEC EFFECT — is the 64k mono transcode costing anything?")
    print("Pre-registered equivalence margin: +/- 0.5 WER points. Absence of a significant")
    print("difference is NOT evidence of equivalence; the CI must sit INSIDE the margin.")
    print("=" * 110)
    for pair, what in ((("A2", "A3"), "azure 64k vs 128k"), (("A0", "A1"), "assemblyai 64k mp3 vs original AAC")):
        a, b = pair
        if a not in arms or b not in arms:
            continue
        ra = {r["dir"]: r["variants"]["spelling"] for r in rows if r["arm"] == a and r["dir"] in common}
        rb = {r["dir"]: r["variants"]["spelling"] for r in rows if r["arm"] == b and r["dir"] in common}
        d = [100 * (ra[s]["wer"] - rb[s]["wer"]) for s in sorted(common)]
        lo, hi = boot_ci(d)
        inside = lo > -0.5 and hi < 0.5
        print(
            f"  {what:<40} Δ={st.fmean(d):+6.3f} pts  95% CI [{lo:+6.3f},{hi:+6.3f}]  n={len(d)}  -> "
            + ("EQUIVALENT within +/-0.5" if inside else "NOT demonstrated equivalent — CI escapes the margin")
        )

    # ---- per-session table for the primary comparison
    print()
    print("=" * 110)
    print(f"PER-SESSION, primary comparison {PRIMARY[0]} vs {PRIMARY[1]}, variant '{PRIMARY[2]}'")
    print("=" * 110)
    a, b, v = PRIMARY
    ra = {r["dir"]: r["variants"][v] for r in rows if r["arm"] == a}
    rb = {r["dir"]: r["variants"][v] for r in rows if r["arm"] == b}
    print(f"{'session':<15} {'refW':>7} {a+' WER':>10} {b+' WER':>10} {'Δ':>8}  winner")
    for s in sorted(common, key=lambda x: -ra[x]["refLen"]):
        d = 100 * (ra[s]["wer"] - rb[s]["wer"])
        print(
            f"{s:<15} {ra[s]['refLen']:>7} {100*ra[s]['wer']:>9.2f}% {100*rb[s]['wer']:>9.2f}% {d:>+8.2f}  "
            f"{a if d < 0 else b}"
        )

    # ---- effect of each normalization step, on the primary pair
    print()
    print("=" * 110)
    print("WHAT EACH NORMALIZATION STEP IS WORTH (primary pair) — each is a judgement call,")
    print("so its effect is shown rather than folded silently into the headline.")
    print("=" * 110)
    print(f"{'variant':<10} {a+' micro':>12} {b+' micro':>12} {'micro Δ':>10}")
    for v2 in VARIANTS:
        ea = sum(r["variants"][v2]["errors"] for r in rows if r["arm"] == a and r["dir"] in common)
        fa = sum(r["variants"][v2]["refLen"] for r in rows if r["arm"] == a and r["dir"] in common)
        eb = sum(r["variants"][v2]["errors"] for r in rows if r["arm"] == b and r["dir"] in common)
        fb = sum(r["variants"][v2]["refLen"] for r in rows if r["arm"] == b and r["dir"] in common)
        print(f"{v2:<10} {100*ea/fa:>11.2f}% {100*eb/fb:>11.2f}% {100*(ea/fa-eb/fb):>+9.2f}")


if __name__ == "__main__":
    main()
