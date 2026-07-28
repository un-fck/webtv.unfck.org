#!/usr/bin/env python3
"""
Speed analysis with honest error bands, and a solution to the one measurement
problem that cannot be solved by instrumentation.

THE PROBLEM
-----------
AssemblyAI's upload is a separate HTTP call, so `t_upload` and `t_process` are
directly observed. Azure's fast-transcription API is ONE synchronous POST that
carries the audio, so upload and inference are a single indivisible interval and
the response has no server-side timing. Reporting Azure's whole POST as
"processing time" would overstate it by however long the upload took — on a
74 MB file over a home uplink that is minutes.

THE FIX
-------
Do not guess the uplink; measure it from the data we already have. Across all
Azure runs, fit

    t_total  =  a  +  b * megabytes  +  c * audio_seconds

`b` is seconds per megabyte on the wire (the upload slope) and `c` is seconds of
inference per second of audio (the real processing rate). This is identified
because bytes and duration vary INDEPENDENTLY in our design: arms A2 and A3 are
the same audio at 64k and 128k, so the same duration appears at two different
sizes. That is what makes the 128k arm worth its cost — it buys the leverage to
separate the two terms.

The same regression is run on AssemblyAI, where `b` and `c` can be checked
against the directly-measured upload and job legs. If the fitted values match
the observed ones for the arm where we can see both, the method is validated on
the arm where we cannot.

ERROR BANDS
-----------
Two variance components, reported separately because they answer different
questions:
  - WITHIN-session SD across repeat passes = measurement noise.
  - ACROSS-session spread = what a user actually experiences.
Bootstrap CIs use `random.Random`, not the LCG in paired-wer.ts, which has period
10466 while drawing 180000 values.
"""
import json
import math
import random
import statistics as st
import sys
from collections import defaultdict

RUNS = "/Volumes/SSDAStorage/un-en-bakeoff/runs.jsonl"

ARM_LABEL = {
    "A0": "AssemblyAI U-3.5 Pro @ 64k mp3 (matched input)",
    "A1": "AssemblyAI U-3.5 Pro @ original AAC (production)",
    "A2": "azure-llm-speech @ 64k mp3 (production-equiv)",
    "A3": "azure-llm-speech @ 128k mp3",
}


def load():
    rows = []
    with open(RUNS) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return [r for r in rows if r.get("ok")]


def ols3(X, y):
    """Least squares for y = a + b*x1 + c*x2, via normal equations (3x3)."""
    n = len(y)
    if n < 4:
        return None
    A = [[0.0] * 3 for _ in range(3)]
    b = [0.0] * 3
    for (x1, x2), yi in zip(X, y):
        v = [1.0, x1, x2]
        for i in range(3):
            b[i] += v[i] * yi
            for j in range(3):
                A[i][j] += v[i] * v[j]
    # Gaussian elimination with partial pivoting
    M = [A[i][:] + [b[i]] for i in range(3)]
    for col in range(3):
        p = max(range(col, 3), key=lambda r: abs(M[r][col]))
        if abs(M[p][col]) < 1e-12:
            return None
        M[col], M[p] = M[p], M[col]
        for r in range(3):
            if r == col:
                continue
            f = M[r][col] / M[col][col]
            for k in range(col, 4):
                M[r][k] -= f * M[col][k]
    return [M[i][3] / M[i][i] for i in range(3)]


def boot_ci(vals, iters=20000, seed=20260728):
    if len(vals) < 2:
        return (float("nan"), float("nan"))
    rnd = random.Random(seed)
    means = []
    n = len(vals)
    for _ in range(iters):
        means.append(sum(vals[rnd.randrange(n)] for _ in range(n)) / n)
    means.sort()
    return means[int(iters * 0.025)], means[int(iters * 0.975)]


def main():
    runs = load()
    if not runs:
        sys.exit("no successful runs yet")
    by_arm = defaultdict(list)
    for r in runs:
        by_arm[r["arm"]].append(r)

    print("=" * 108)
    print("SPEED — per-arm summary.  RTF = audio_seconds / processing_seconds (higher is faster)")
    print("Denominator is the ffprobe duration of the SOURCE file, never the provider's own report.")
    print("=" * 108)
    print(f"{'arm':<4} {'n':>3} {'audio h':>8} {'median RTF':>11} {'mean RTF':>9} {'95% CI of mean':>20} {'min':>7} {'max':>7}")
    for arm in sorted(by_arm):
        rs = by_arm[arm]
        # For AssemblyAI use the observed job leg; for Azure the whole POST is an
        # UPPER BOUND on processing (it contains the upload). Corrected below.
        rtfs = []
        for r in rs:
            proc = r["tProcessMs"] if r["tProcessMs"] is not None else r["tTotalMs"]
            rtfs.append(r["audioSeconds"] / (proc / 1000))
        lo, hi = boot_ci(rtfs)
        hrs = sum(r["audioSeconds"] for r in rs) / 3600
        print(
            f"{arm:<4} {len(rs):>3} {hrs:>8.2f} {st.median(rtfs):>11.1f} {st.fmean(rtfs):>9.1f} "
            f"  [{lo:>7.1f}, {hi:>7.1f}] {min(rtfs):>7.1f} {max(rtfs):>7.1f}   {ARM_LABEL.get(arm,'')}"
        )

    print()
    print("=" * 108)
    print("DECOMPOSITION — t_total = a + b*MB + c*audio_seconds")
    print("b = seconds per MB on the wire (upload).  c = seconds of inference per second of audio.")
    print("=" * 108)
    # Fit PER VENDOR, pooling both bitrate arms. Within a single arm bytes are
    # ~bitrate x duration, so the two regressors are collinear and the fit is
    # unidentifiable — which is exactly what the validation check below caught on
    # the first attempt. Pooling 64k with 128k (same durations, 2x the bytes) is
    # what breaks the collinearity, and is the reason arm A3 earns its cost.
    VENDOR_ARMS = {"assemblyai (A0+A1 pooled)": ["A0", "A1"],
                   "azure      (A2+A3 pooled)": ["A2", "A3"]}
    fits = {}
    for vname, arms in VENDOR_ARMS.items():
        rs = [r for a in arms for r in by_arm.get(a, [])]
        if len(rs) < 6:
            print(f"{vname}: only {len(rs)} runs, need >=6 to fit")
            continue
        X = [(r["bytesSent"] / 1e6, r["audioSeconds"]) for r in rs]
        y = [r["tTotalMs"] / 1000 for r in rs]
        f = ols3(X, y)
        for a in arms:
            fits[a] = f
        if not f:
            print(f"{vname}: singular")
            continue
        a_, b_, c_ = f
        pred = [a_ + b_ * x1 + c_ * x2 for x1, x2 in X]
        ss_res = sum((yi - pi) ** 2 for yi, pi in zip(y, pred))
        ybar = st.fmean(y)
        ss_tot = sum((yi - ybar) ** 2 for yi in y)
        r2 = 1 - ss_res / ss_tot if ss_tot else float("nan")
        eff = 1 / c_ if c_ > 0 else float("inf")
        mbit = 8 / b_ if b_ > 0 else float("nan")
        print(
            f"{vname:<28} a={a_:8.2f}s  b={b_:7.3f} s/MB ({mbit:6.1f} Mbit/s)  "
            f"c={c_:8.5f} s/s  -> inference {eff:8.1f}x realtime   R2={r2:.4f}  n={len(rs)}"
        )

    # Validation: on the AssemblyAI arms the upload leg is directly observed, so
    # the fitted slope b can be checked against reality. If it matches there, the
    # same method is trustworthy on the Azure arms where it cannot be observed.
    print()
    print("VALIDATION of the regression, on the arms where upload IS directly measured:")
    for arm in ("A0", "A1"):
        rs = by_arm.get(arm) or []
        if not rs or not fits.get(arm):
            continue
        obs = [
            (r["tUploadMs"] / 1000) / (r["bytesSent"] / 1e6)
            for r in rs
            if r.get("tUploadMs") and r["bytesSent"]
        ]
        if not obs:
            continue
        print(
            f"  {arm}: observed upload {st.median(obs):.3f} s/MB (median of {len(obs)}), "
            f"fitted b = {fits[arm][1]:.3f} s/MB  -> "
            f"{'CONSISTENT' if abs(st.median(obs)-fits[arm][1]) < max(0.05, 0.5*st.median(obs)) else 'INCONSISTENT — do not trust the Azure decomposition'}"
        )

    print()
    print("=" * 108)
    print("AZURE, upload removed using the fitted slope (this is the number to compare)")
    print("=" * 108)
    for arm in ("A2", "A3"):
        rs = by_arm.get(arm) or []
        f = fits.get(arm)
        if not rs or not f:
            continue
        a, b, c = f
        corr = []
        for r in rs:
            up = b * (r["bytesSent"] / 1e6)
            proc = max(0.001, r["tTotalMs"] / 1000 - up)
            corr.append(r["audioSeconds"] / proc)
        lo, hi = boot_ci(corr)
        print(
            f"{arm:<4} n={len(rs):>3}  median RTF (upload removed) = {st.median(corr):7.1f}x   "
            f"mean {st.fmean(corr):7.1f}x  95% CI [{lo:.1f}, {hi:.1f}]"
        )

    print()
    print("=" * 108)
    print("WITHIN-SESSION repeat variance (measurement noise) vs ACROSS-SESSION spread")
    print("=" * 108)
    for arm in sorted(by_arm):
        bysess = defaultdict(list)
        for r in by_arm[arm]:
            proc = r["tProcessMs"] if r["tProcessMs"] is not None else r["tTotalMs"]
            bysess[r["dir"]].append(r["audioSeconds"] / (proc / 1000))
        reps = [v for v in bysess.values() if len(v) > 1]
        if reps:
            cvs = [st.stdev(v) / st.fmean(v) for v in reps]
            within = f"{100*st.fmean(cvs):.1f}% CV over {len(reps)} repeated sessions"
        else:
            within = "no repeats yet"
        allr = [x for v in bysess.values() for x in v]
        across = f"{100*st.stdev(allr)/st.fmean(allr):.1f}% CV" if len(allr) > 1 else "n/a"
        print(f"{arm:<4} within-session: {within:<44} across-session: {across}")

    print()
    print("=" * 108)
    print("LATENCY vs DURATION — does either provider degrade on long files?")
    print("=" * 108)
    for arm in sorted(by_arm):
        rs = sorted(by_arm[arm], key=lambda r: r["audioSeconds"])
        short = [r for r in rs if r["audioSeconds"] < 1200]
        long_ = [r for r in rs if r["audioSeconds"] >= 3600]
        def m(g):
            if not g:
                return float("nan")
            return st.median([r["audioSeconds"] / ((r["tProcessMs"] or r["tTotalMs"]) / 1000) for r in g])
        print(f"{arm:<4} RTF on <20min files: {m(short):7.1f}x   on >=60min files: {m(long_):7.1f}x   "
              f"(n={len(short)}, {len(long_)})")

    print()
    print("=" * 108)
    print("WORST OBSERVED LATENCY (what a user waits, end to end, incl. upload from this laptop)")
    print("=" * 108)
    for arm in sorted(by_arm):
        rs = sorted(by_arm[arm], key=lambda r: -r["tTotalMs"])[:3]
        for r in rs[:1]:
            print(f"{arm:<4} worst = {r['tTotalMs']/1000:7.1f}s on {r['symbol']} ({r['audioSeconds']/60:.0f} min audio)")

    print()
    print("=" * 108)
    print("TRUNCATION TRIPWIRE — provider-reported duration vs ffprobe duration of the source")
    print("A provider that silently truncates would shrink numerator and denominator together")
    print("and look FASTER. This is the check that catches it.")
    print("=" * 108)
    bad = 0
    for r in runs:
        if not r.get("reportedDurationMs"):
            continue
        rep = r["reportedDurationMs"] / 1000
        src = r["audioSeconds"]
        d = abs(rep - src) / src
        if d > 0.01:
            bad += 1
            print(f"  !! {r['arm']} {r['symbol']}: reported {rep:.1f}s vs source {src:.1f}s ({100*d:.2f}% off)")
    print(f"  {bad} run(s) outside 1% tolerance out of {len(runs)}")

    print()
    print("=" * 108)
    print("RETRIES AND NON-200s")
    print("=" * 108)
    for arm in sorted(by_arm):
        rs = by_arm[arm]
        rt = sum(1 for r in rs if r.get("retries"))
        codes = defaultdict(int)
        for r in rs:
            for a in r.get("attempts", []):
                codes[a["status"]] += 1
        print(f"{arm:<4} runs={len(rs):>3} runs_needing_retry={rt}  statuses: {dict(codes)}")


if __name__ == "__main__":
    main()
