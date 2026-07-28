#!/usr/bin/env python3
"""
How much do the two vendors' errors OVERLAP?

This is load-bearing for the recommendation: if most of each arm's errors are the
same error, then swapping vendors cannot fix them, and the vendor choice matters
much less than an external glossary/validator would.

An adversarial reading agent estimated 70% overlap by hand across six meetings.
That was an agent's count, on a sample, of substitutions only. This measures it
in code, over the whole scored corpus, and over ALL three error types — because
substitutions-only would miss exactly where the fabrications live (insertions).

METHOD. Align each arm to the reference with the same full-sequence Levenshtein
used for scoring, and record the set of reference POSITIONS each arm gets wrong
(substituted or deleted), plus the insertion points. Then compare the two arms'
error sets position by position:

  shared   — both arms err at the same reference position
  A1-only  — AssemblyAI errs where azure-llm is correct
  A2-only  — azure-llm errs where AssemblyAI is correct

A high shared fraction means the two systems are failing on the same acoustics,
and no vendor swap addresses it.
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import normalize  # noqa: E402
from rapidfuzz.distance import Levenshtein  # noqa: E402

REFS = "/Volumes/SSDAStorage/un-en-bakeoff/references/AFTER-fix"
HYPS = "/Volumes/SSDAStorage/un-en-bakeoff/hyps.jsonl"
VARIANT = "spelling"


def err_positions(ref, hyp):
    """Reference indices the hypothesis gets wrong, and insertion points."""
    sub_del = set()
    ins = defaultdict(int)
    for op in Levenshtein.editops(ref, hyp):
        if op.tag in ("replace", "delete"):
            sub_del.add(op.src_pos)
        elif op.tag == "insert":
            ins[op.src_pos] += 1
    return sub_del, ins


def main():
    refs = {}
    for fn in os.listdir(REFS):
        if fn.startswith("._") or not fn.endswith(".ref.txt"):
            continue
        refs[fn[: -len(".ref.txt")]] = open(os.path.join(REFS, fn), encoding="utf-8").read()

    hyp = defaultdict(dict)
    with open(HYPS, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            h = json.loads(line)
            if h.get("pass", 1) == 1:
                hyp[h["dir"]][h["arm"]] = h["text"]

    # A1 = AssemblyAI production, A2 = azure production-equivalent.
    # Also report A0 vs A2 (the matched-input pair) so the overlap cannot be
    # explained away as a codec artifact.
    for pair in (("A1", "A2"), ("A0", "A2")):
        a, b = pair
        tot_shared = tot_a = tot_b = tot_ref = 0
        tot_ins_shared = tot_ins_a = tot_ins_b = 0
        print("=" * 96)
        print(f"ERROR OVERLAP — {a} vs {b}   (variant: {VARIANT})")
        print("=" * 96)
        print(f"{'session':<14} {'refW':>7} {'shared':>8} {a+'-only':>9} {b+'-only':>9} {'shared %':>9}")
        for d in sorted(refs):
            if a not in hyp.get(d, {}) or b not in hyp.get(d, {}):
                continue
            r = normalize(refs[d], VARIANT)
            ea, ia = err_positions(r, normalize(hyp[d][a], VARIANT))
            eb, ib = err_positions(r, normalize(hyp[d][b], VARIANT))
            shared = len(ea & eb)
            only_a = len(ea - eb)
            only_b = len(eb - ea)
            # insertions: count positions where both inserted vs one only
            ins_shared = sum(min(ia[p], ib[p]) for p in set(ia) & set(ib))
            ins_a = sum(ia.values()) - ins_shared
            ins_b = sum(ib.values()) - ins_shared
            tot_shared += shared; tot_a += only_a; tot_b += only_b; tot_ref += len(r)
            tot_ins_shared += ins_shared; tot_ins_a += ins_a; tot_ins_b += ins_b
            tot_err = shared + only_a + only_b
            print(f"{d:<14} {len(r):>7} {shared:>8} {only_a:>9} {only_b:>9} "
                  f"{100*shared/tot_err if tot_err else 0:>8.1f}%")
        te = tot_shared + tot_a + tot_b
        print("-" * 96)
        print(f"{'TOTAL':<14} {tot_ref:>7} {tot_shared:>8} {tot_a:>9} {tot_b:>9} "
              f"{100*tot_shared/te if te else 0:>8.1f}%")
        print()
        print(f"  substitution+deletion positions: {te} distinct reference positions in error")
        print(f"     shared by both arms : {tot_shared:>6}  ({100*tot_shared/te:.1f}%)")
        print(f"     {a} only            : {tot_a:>6}  ({100*tot_a/te:.1f}%)")
        print(f"     {b} only            : {tot_b:>6}  ({100*tot_b/te:.1f}%)")
        ti = tot_ins_shared + tot_ins_a + tot_ins_b
        print(f"  INSERTIONS (where fabrications live): {ti} total")
        print(f"     shared              : {tot_ins_shared:>6}  ({100*tot_ins_shared/ti if ti else 0:.1f}%)")
        print(f"     {a} only            : {tot_ins_a:>6}  ({100*tot_ins_a/ti if ti else 0:.1f}%)")
        print(f"     {b} only            : {tot_ins_b:>6}  ({100*tot_ins_b/ti if ti else 0:.1f}%)")
        allerr = te + ti
        allshared = tot_shared + tot_ins_shared
        print(f"  ALL ERROR TYPES COMBINED: {100*allshared/allerr:.1f}% shared")
        print()


if __name__ == "__main__":
    main()
