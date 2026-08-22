#!/usr/bin/env python3
"""
Unit tests for score.py's normalization.

The failure mode being ruled out is ASYMMETRY: any transformation applied to one
side and not the other silently converts a style difference into an accuracy
difference, and does so in a direction that favours whichever vendor happens to
match the reference's house style. The shipped TypeScript normalizer has exactly
this problem with apostrophes — the PV files use U+2019 exclusively and every
provider emits U+0027, and the keep-class contains only U+0027, so every
possessive in the corpus is scored as an error for every arm.

Each test states the property it is protecting, and fails loudly.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import normalize, score, num_to_words  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
    if not ok:
        print(f"        got:  {got}")
        print(f"        want: {want}")
        fails.append(name)


def check_true(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"   {detail}" if detail and not cond else ""))
    if not cond:
        fails.append(name)


print("=== symmetry: the same transformation must apply to both sides ===")
# The PV writes curly, providers write ASCII. Under `strict` this splits the
# token; under `apos` and above it must not.
ref = "the Council’s decision doesn’t bind us"
hyp = "the Council's decision doesn't bind us"
check("strict: curly vs ASCII apostrophe DOES diverge (documents the defect)",
      normalize(ref, "strict") != normalize(hyp, "strict"), True)
check("apos: curly and ASCII normalize identically",
      normalize(ref, "apos"), normalize(hyp, "apos"))
check("apos: identical speech scores 0.0 WER",
      round(score(normalize(ref, "apos"), normalize(hyp, "apos"))["wer"], 6), 0.0)
r = score(normalize(ref, "strict"), normalize(hyp, "strict"))
print(f"        (under strict the same identical speech scores {100*r['wer']:.1f}% WER — "
      f"S={r['S']} I={r['I']} D={r['D']})")

print("\n=== spelling harmonisation must be applied to BOTH sides ===")
check("en-GB ref vs en-US hyp normalize identically under `spelling`",
      normalize("the programme on labour and defence", "spelling"),
      normalize("the program on labor and defense", "spelling"))
check("...and the reverse direction too (proves it is not one-way)",
      normalize("the program on labor and defense", "spelling"),
      normalize("the programme on labour and defence", "spelling"))
check("under `apos` (spelling OFF) they still differ — the switch actually does something",
      normalize("the programme", "apos") != normalize("the program", "apos"), True)

print("\n=== number handling ===")
check("num_to_words 10156", num_to_words(10156), "ten thousand one hundred fifty six")
check("digits and words converge under `numbers`",
      normalize("resolution 2815", "numbers"),
      normalize("resolution two thousand eight hundred fifteen", "numbers"))
check("under `spelling` (numbers OFF) they still differ",
      normalize("resolution 2815", "spelling") != normalize("resolution two thousand eight hundred fifteen", "spelling"),
      True)

print("\n=== UN document symbols ===")
check("S/2026/426 tokenizes the same on both sides under `numbers`",
      normalize("document S/2026/426", "numbers"),
      normalize("document S / 2026 / 426", "numbers"))
check("hyphenated compounds split consistently under `numbers`",
      normalize("the Secretary-General", "numbers"),
      normalize("the Secretary General", "numbers"))

print("\n=== the scorer itself ===")
check("identity is exactly zero", score(["a", "b", "c"], ["a", "b", "c"])["wer"], 0.0)
check("pure deletion", score(["a", "b", "c", "d"], ["a", "b", "c"])["wer"], 0.25)
check("pure substitution", score(["a", "b", "c", "d"], ["a", "x", "c", "d"])["wer"], 0.25)
check("pure insertion", score(["a", "b"], ["a", "x", "b"])["wer"], 0.5)
check("denominator is the REFERENCE, not max/hyp (WER may exceed 1)",
      score(["a"], ["x"] * 10)["wer"], 10.0)
check("empty hypothesis = 1.0", score(["a", "b"], [])["wer"], 1.0)
r = score(["a", "b", "c", "d", "e"], ["a", "x", "c", "z", "q", "e"])
check_true("S+I+D equals the total error count",
           r["S"] + r["I"] + r["D"] == r["errors"], f"{r}")

print("\n=== normalization is idempotent (running it twice changes nothing) ===")
for v in ("strict", "apos", "spelling", "numbers", "full"):
    once = normalize("The Programme’s S/2026/426 review, 2815 items.", v)
    twice = normalize(" ".join(once), v)
    check_true(f"idempotent under `{v}`", once == twice, f"{once} vs {twice}")

print("\n=== fillers are removed from both sides equally ===")
check("filler removal is symmetric",
      normalize("um the uh council", "strict"), normalize("the council", "strict"))

print("\n" + "=" * 70)
if fails:
    print(f"{len(fails)} TEST(S) FAILED: {', '.join(fails)}")
    sys.exit(1)
print("ALL NORMALIZATION TESTS PASSED")
