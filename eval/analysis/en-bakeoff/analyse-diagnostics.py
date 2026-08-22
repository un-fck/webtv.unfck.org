#!/usr/bin/env python3
"""
Were the four inherited exclusions ever justified?

SYNTHESIS §14.1 excluded S/PV.9606, 9614, 9686 and 9732 as "PV↔video mismatch —
the record does not match the recording", on the evidence that "every arm scores
>85% there". `paired-wer.ts` hard-codes the same list, and my own pre-registration
inherited it.

But that evidence was produced by a scorer that inflated localized errors by up
to 50 points, over a reference from which 15.7% of the real speech had been
deleted. An exception is a claim like any other, so it gets checked against the
thing it describes rather than inherited.

TWO INDEPENDENT TESTS, neither of which uses provider output:

1. **Speaking rate from the source.** Ground-truth words divided by audio
   minutes. Sustained human speech is ~100–150 wpm. A PV covering far more
   material than the recording contains shows up as an impossible rate. This is
   computed entirely from the PV and the audio duration — no transcriber
   involved, so no scorer defect can affect it.

2. **Re-scored WER with the fixed scorer.** If a session is genuinely mismatched,
   BOTH vendors must score catastrophically, because neither can transcribe
   speech that is not in the recording. If it scores like an ordinary session,
   the exclusion was an artifact.

A session is only a genuine mismatch if BOTH tests agree.
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCORES = "/Volumes/SSDAStorage/un-en-bakeoff/scores.json"
LEDGER = "/Volumes/SSDAStorage/un-en-bakeoff/references/AFTER-fix.ledger.json"

EXCLUDED = {"S_PV.9606", "S_PV.9614", "S_PV.9686", "S_PV.9732"}
VARIANT = "spelling"

rows = json.load(open(SCORES))
ledger = {r["dir"]: r for r in json.load(open(LEDGER))}

by = defaultdict(dict)
for r in rows:
    by[r["dir"]][r["arm"]] = r["variants"][VARIANT]["wer"] * 100

# Baseline: what an ordinary, matched session scores with the fixed scorer.
normal = [v for d, v in by.items() if d not in EXCLUDED and "A1" in v and "A2" in v]
if normal:
    base_a1 = sum(v["A1"] for v in normal) / len(normal)
    base_a2 = sum(v["A2"] for v in normal) / len(normal)
else:
    base_a1 = base_a2 = float("nan")

print("=" * 104)
print("ARE THE FOUR INHERITED EXCLUSIONS REAL? Two independent tests.")
print("=" * 104)
print(f"Baseline from the {len(normal)} retained sessions (fixed scorer): "
      f"AssemblyAI {base_a1:.1f}%  azure-llm {base_a2:.1f}%")
print()
print(f"{'session':<14} {'kept wpm':>9} {'rate verdict':<24} {'AAI WER':>9} {'azure WER':>10} {'WER verdict':<22}")
print("-" * 104)

for d in sorted(EXCLUDED | {x for x in by if x not in EXCLUDED}, key=lambda x: x not in EXCLUDED):
    if d not in EXCLUDED:
        continue
    lg = ledger.get(d, {})
    wpm = lg.get("keptWpm", float("nan"))
    rate_bad = wpm > 200
    rate_v = "IMPOSSIBLE — PV > audio" if rate_bad else ("elevated" if wpm > 160 else "normal, plausible")
    v = by.get(d, {})
    a1 = v.get("A1", float("nan"))
    a2 = v.get("A2", float("nan"))
    if a1 != a1:
        wer_v = "not scored yet"
    elif a1 > 2 * base_a1:
        wer_v = "CATASTROPHIC — mismatch"
    elif a1 > 1.35 * base_a1:
        wer_v = "elevated"
    else:
        wer_v = "ORDINARY — not a mismatch"
    print(f"{d:<14} {wpm:>9.0f} {rate_v:<24} {a1:>8.1f}% {a2:>9.1f}% {wer_v:<22}")

print()
print("=" * 104)
print("VERDICT PER SESSION")
print("=" * 104)
for d in sorted(EXCLUDED):
    lg = ledger.get(d, {})
    wpm = lg.get("keptWpm", float("nan"))
    v = by.get(d, {})
    a1 = v.get("A1", float("nan"))
    if a1 != a1:
        print(f"  {d}: not scored yet")
        continue
    rate_bad = wpm > 200
    wer_bad = a1 > 2 * base_a1
    if rate_bad and wer_bad:
        print(f"  {d}: GENUINE MISMATCH — both tests agree ({wpm:.0f} wpm, {a1:.0f}% WER). Exclusion correct.")
    elif rate_bad and not wer_bad:
        print(f"  {d}: rate impossible ({wpm:.0f} wpm) but WER ordinary ({a1:.0f}%) — investigate")
    elif wer_bad and not rate_bad:
        print(f"  {d}: WER catastrophic ({a1:.0f}%) but speaking rate normal ({wpm:.0f} wpm) — "
              f"something OTHER than volume mismatch")
    else:
        print(f"  {d}: **EXCLUSION NOT SUPPORTED** — {wpm:.0f} wpm is a normal speaking rate and "
              f"{a1:.0f}% WER is ordinary. This session should probably be IN the corpus.")
print()
print("Note: including a wrongly-excluded session changes the headline numbers, so this")
print("is reported as a finding rather than acted on — the pre-registered session list")
print("stands for the verdict, and any effect is shown as a sensitivity check.")
