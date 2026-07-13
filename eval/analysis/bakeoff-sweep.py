#!/usr/bin/env python3
"""Multi-session floor sweep roll-up + diarization-vs-length curve (§13.3).

For every (session, arm) with a raw floor transcript: script mix, coverage,
distinct speakers vs the PV speaker-list truth, chars. Speaker truth = distinct
'## Name' headers in results/ground-truth/<sym>/floor_speakers.txt.
WER comes from results/summary.json (floor scored against the English PV —
imperfect but paired across arms; only deltas are meaningful).
"""
import json
import os
import re
from collections import Counter, defaultdict

RES = os.path.join(os.path.dirname(__file__), "..", "results")
RAW = os.path.join(RES, "raw")
GT = os.path.join(RES, "ground-truth")

ARMS = ["speechmatics-melia-1", "soniox-stt-async-v5",
        "elevenlabs-scribe-v2-tuned", "azure-llm-speech", "gemini-3-flash"]

SWEEP = ["S_PV.10100", "S_PV.9722", "S_PV.9606", "S_PV.9614",
         "S_PV.9532", "S_PV.9578", "S_PV.9686"]
# earlier bake-off points for the length curve
EXTRA = ["S_PV.10156", "S_PV.10153", "UN80-Apr06-keita", "UN80-Apr29-timestamps",
         "Nebenzia-Starobelsk"]


def script_counts(text):
    c = Counter()
    for ch in text:
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF: c["cjk"] += 1
        elif 0x0600 <= o <= 0x06FF: c["arabic"] += 1
        elif 0x0400 <= o <= 0x04FF: c["cyrillic"] += 1
        elif ch.isalpha() and o < 0x250: c["latin"] += 1
    return c


def truth_speakers(sym):
    f = os.path.join(GT, sym, "floor_speakers.txt")
    if not os.path.exists(f):
        return None
    names = set(re.findall(r"^## (.+?)(?: \(.*)?$", open(f).read(), re.M))
    return len(names)


def wer_map():
    m = {}
    p = os.path.join(RES, "summary.json")
    for r in json.load(open(p)):
        if r["language"] == "floor":
            m[(r["symbol"].replace("/", "_"), r["provider"])] = r["normalizedWer"]
    return m


def main():
    wers = wer_map()
    rows = []
    for sym in SWEEP + EXTRA:
        truth = truth_speakers(sym)
        for arm in ARMS:
            f = os.path.join(RAW, sym, f"{arm}_floor.json")
            if not os.path.exists(f):
                continue
            d = json.load(open(f))
            text = d.get("fullText", "")
            utts = d.get("utterances", [])
            dur = d.get("durationMs") or (utts[-1]["end"] if utts else 0)
            covered = sum(max(0, u["end"] - u["start"]) for u in utts)
            c = script_counts(text)
            tot = sum(c.values()) or 1
            rows.append({
                "sym": sym, "arm": arm, "min": round(dur / 60000),
                "spk": len({u.get("speaker") for u in utts}),
                "spk_true": truth,
                "cov": round(100 * covered / dur, 1) if dur else 0,
                "nonlatin": round(100 * (1 - c.get("latin", 0) / tot), 1),
                "chars": len(text),
                "wer": wers.get((sym, arm)),
            })

    # per-session table
    print(f"{'session':<22}{'min':>5} {'arm':<28}{'nWER':>6}{'spk':>5}{'true':>5}{'cov%':>6}{'nonLat%':>8}{'chars':>8}")
    for sym in SWEEP:
        print("-" * 95)
        for r in [r for r in rows if r["sym"] == sym]:
            wer = f"{r['wer']*100:.1f}" if r["wer"] is not None else "-"
            print(f"{r['sym']:<22}{r['min']:>5} {r['arm']:<28}{wer:>6}{r['spk']:>5}"
                  f"{r['spk_true'] or '-':>5}{r['cov']:>6}{r['nonlatin']:>8}{r['chars']:>8}")

    # paired mean normalized WER over sweep sessions where ALL arms have a value
    print("\nPaired mean normalized WER (floor vs English PV, sweep sessions with all arms):")
    complete = [s for s in SWEEP if all(
        any(r["sym"] == s and r["arm"] == a and r["wer"] is not None for r in rows)
        for a in ARMS)]
    print("  sessions:", len(complete), complete)
    for a in ARMS:
        vals = [r["wer"] for r in rows if r["arm"] == a and r["sym"] in complete]
        if vals:
            print(f"  {a:<30} {100*sum(vals)/len(vals):.1f}")

    # diarization vs length
    print("\nDiarization vs length (speakers detected / PV truth):")
    print(f"{'session':<24}{'min':>5}" + "".join(f"{a.split('-')[0][:9]:>11}" for a in ARMS) + f"{'true':>6}")
    for sym in sorted(set(SWEEP + EXTRA),
                      key=lambda s: next((r["min"] for r in rows if r["sym"] == s), 0)):
        rr = {r["arm"]: r for r in rows if r["sym"] == sym}
        if not rr:
            continue
        mins = next(iter(rr.values()))["min"]
        truth = next(iter(rr.values()))["spk_true"]
        line = f"{sym:<24}{mins:>5}"
        for a in ARMS:
            line += f"{rr[a]['spk'] if a in rr else '-':>11}"
        line += f"{truth or '-':>6}"
        print(line)


if __name__ == "__main__":
    main()
