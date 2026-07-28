#!/usr/bin/env python3
"""
NEGATIVE CONTROLS for score.py.

A check that has never been shown to fail is absent, not passing. This damages a
real reference in known ways and asserts the scorer reports a KNOWN NUMBER, not
merely "something worse".

The controls are chosen so that the one the old design used (uniform random
deletion) is present but is NOT the only one — proportional chunking absorbs
uniform damage and would pass it while inflating contiguous damage 5x. The
contiguous and prefix cases are the ones that actually discriminate, so they are
the ones with tight bars.

Every control also runs against the SHIPPED TypeScript scorer via a companion
script, so the two can be compared. Exit code is non-zero if any control fails.
"""
import json
import os
import random
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import normalize, score  # noqa: E402

REFS = "/Volumes/SSDAStorage/un-en-bakeoff/references/AFTER-fix"
# A large session (chunking would be ACTIVE on the TS scorer) and a small one.
CASES = [("S_PV.9816", "large, 16k words"), ("S_PV.10156", "small, 920 words")]

results = []
failures = []


def check(name, got, lo, hi, note=""):
    ok = lo <= got <= hi
    results.append((name, got, lo, hi, ok, note))
    if not ok:
        failures.append(name)
    return ok


for sess, desc in CASES:
    path = os.path.join(REFS, f"{sess}.ref.txt")
    if not os.path.exists(path):
        sys.exit(f"missing {path} — run prep-references.ts first")
    ref_text = open(path, encoding="utf-8").read()
    ref = normalize(ref_text, "strict")
    n = len(ref)
    print(f"\n=== {sess} ({desc}) — reference {n} words ===")

    # 1. identity — must be exactly zero
    r = score(ref, list(ref))
    check(f"{sess}/identity", r["wer"], 0.0, 0.0, "must be exactly 0")

    # 2. empty hypothesis — must be exactly 1.0 (all deletions)
    r = score(ref, [])
    check(f"{sess}/empty-hyp", r["wer"], 1.0, 1.0, "all deletions")

    # 3. uniform random deletion of 30% — the control the OLD design used.
    #    A chunked scorer passes this too, which is why it is not sufficient.
    rnd = random.Random(12345)
    keep = [w for w in ref if rnd.random() > 0.30]
    r = score(ref, keep)
    check(f"{sess}/uniform-delete-30%", r["wer"], 0.27, 0.33, "old design's control")

    # 4. CONTIGUOUS deletion of 30% from the FRONT — the discriminating case.
    #    True WER is 0.30. A proportional-chunk scorer reports ~0.80 here.
    cut = int(n * 0.30)
    r = score(ref, list(ref[cut:]))
    check(f"{sess}/contiguous-delete-30%-front", r["wer"], 0.29, 0.31,
          "chunked scorer reports ~0.80")

    # 5. CONTIGUOUS deletion of 30% from the BACK
    r = score(ref, list(ref[: n - cut]))
    check(f"{sess}/contiguous-delete-30%-back", r["wer"], 0.29, 0.31, "")

    # 6. first 10% missing — models a provider dropping its opening chunk
    cut10 = int(n * 0.10)
    r = score(ref, list(ref[cut10:]))
    check(f"{sess}/missing-first-10%", r["wer"], 0.095, 0.105,
          "chunked scorer reports ~0.57")

    # 7. PREPEND N words — WER must rise by exactly N/refLen. This is the control
    #    the old design lacked entirely, and the one a chunked scorer fails hard.
    N_PRE = 200
    r = score(ref, ["prepended"] * N_PRE + list(ref))
    expect = N_PRE / n
    check(f"{sess}/prepend-{N_PRE}", r["wer"], expect * 0.97, expect * 1.03,
          f"must be exactly {expect:.4f}")

    # 8. every capitalized token replaced (entity damage) — must rise, and by
    #    roughly the capitalized-token share
    caps = sum(1 for w in ref_text.split() if w[:1].isupper())
    dmg = [("xqzxqz" if w[:1].isupper() else w) for w in ref_text.split()]
    r = score(ref, normalize(" ".join(dmg), "strict"))
    check(f"{sess}/entity-damage", r["wer"], 0.05, 1.0,
          f"{caps} capitalized tokens in source")

    # 9. wrong session entirely — must be catastrophic
    other = "S_PV.10156" if sess != "S_PV.10156" else "S_PV.9816"
    other_text = open(os.path.join(REFS, f"{other}.ref.txt"), encoding="utf-8").read()
    r = score(ref, normalize(other_text, "strict"))
    check(f"{sess}/wrong-session", r["wer"], 0.80, 99.0, "must be catastrophic")

    # 10. duplicated hypothesis — WER must exceed 1.0 (insertions)
    r = score(ref, list(ref) + list(ref))
    check(f"{sess}/duplicated-hyp", r["wer"], 0.95, 1.05, "one full insertion set")

    # 11. word order shuffled — same words, no alignment. Must be high.
    sh = list(ref)
    random.Random(7).shuffle(sh)
    r = score(ref, sh)
    check(f"{sess}/shuffled", r["wer"], 0.50, 1.0, "same bag of words")

print("\n" + "=" * 100)
print(f"{'control':<46} {'got':>9} {'expected range':>22}   verdict")
print("=" * 100)
for name, got, lo, hi, ok, note in results:
    print(f"{name:<46} {got*100:8.3f}% [{lo*100:7.2f}%, {hi*100:7.2f}%]   "
          f"{'PASS' if ok else 'FAIL'}   {note}")

print("=" * 100)
if failures:
    print(f"\n{len(failures)} CONTROL(S) FAILED: {', '.join(failures)}")
    sys.exit(1)
print(f"\nALL {len(results)} CONTROLS PASSED")
