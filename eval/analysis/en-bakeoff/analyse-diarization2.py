#!/usr/bin/env python3
"""
Diarization, measured FAIRLY. Supersedes the first cut in analyse-diarization.py.

A BUG IN MY OWN FIRST MEASUREMENT, recorded because it is the kind that flatters
a conclusion silently
---------------------------------------------------------------------------
The run harness recorded Azure's utterance count as `len(phrases)` — the raw
phrase list — and AssemblyAI's as `len(utterances)`, which AssemblyAI has ALREADY
merged into contiguous same-speaker turns. Those are different units. Comparing
them made Azure look ~11x finer-grained than it really is relative to the
incumbent. The production provider (`lib/providers/azure-llm-speech.ts`) merges
consecutive same-speaker phrases before returning, so the production-equivalent
Azure number is the MERGED one.

This script recomputes both sides from the raw provider JSON under identical
semantics: a TURN is a maximal run of consecutive segments carrying the same
speaker label. Raw segment counts are reported separately, because fine segments
are genuinely useful downstream (they carry timestamps) even when they belong to
a single turn — but they are not comparable to AssemblyAI's utterances.

WHAT THIS DOES AND DOES NOT MEASURE. There is no speaker-labelled ground truth
here, so this is not attribution accuracy (DER/cpWER would need the PV's speaker
turns aligned to audio — a separate job). The answerable question, and the one
that matters for our pipeline, is whether the provider hands the downstream
GPT-5.4 speaker-ID stage a usable signal at all.

COMPARABILITY CAVEAT: Azure was sent maxSpeakers=35 (the documented ceiling;
production currently sends 20). AssemblyAI is uncapped. A ceiling can only
penalise Azure, never flatter it.
"""
import json
import os
import re
import statistics as st
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = "/Volumes/SSDAStorage/un-en-bakeoff/raw"
ARM = {"A0": "AssemblyAI @64k", "A1": "AssemblyAI @orig",
       "A2": "azure-llm @64k", "A3": "azure-llm @128k"}

# Durations come from the manifest (ffprobe of the SOURCE), never from a provider.
DUR = {}
for m in re.finditer(r'dir:\s*"([^"]+)",\s*audioSeconds:\s*([\d.]+)',
                     open(os.path.join(HERE, "sessions.ts")).read()):
    DUR[m.group(1)] = float(m.group(2))


def analyse(path, arm):
    j = json.load(open(path))
    if arm in ("A0", "A1"):
        segs = [(u.get("speaker"), u.get("start"), u.get("end"))
                for u in (j.get("utterances") or [])]
    else:
        segs = [(str(p.get("speaker", "1")),
                 p.get("offsetMilliseconds"),
                 (p.get("offsetMilliseconds") or 0) + (p.get("durationMilliseconds") or 0))
                for p in (j.get("phrases") or [])]
    if not segs:
        return None
    # merge consecutive same-speaker segments into turns
    turns = []
    cur_spk, cur_start, cur_end = segs[0]
    for spk, s, e in segs[1:]:
        if spk == cur_spk:
            cur_end = e
        else:
            turns.append((cur_spk, cur_start, cur_end))
            cur_spk, cur_start, cur_end = spk, s, e
    turns.append((cur_spk, cur_start, cur_end))
    longest_turn = max(((e - s) / 1000) for _, s, e in turns
                       if s is not None and e is not None)
    return dict(segs=len(segs), turns=len(turns),
                spk=len({s[0] for s in segs}), longest=longest_turn)


data = defaultdict(dict)
for f in sorted(os.listdir(RAW)):
    if not f.endswith(".json") or f.startswith("._"):
        continue
    m = re.match(r"^(A\d)__(.+)__p(\d+)\.json$", f)
    if not m or m.group(3) != "1":
        continue
    arm, d = m.group(1), m.group(2)
    r = analyse(os.path.join(RAW, f), arm)
    if r:
        r["dur"] = DUR.get(d, 0)
        data[d][arm] = r

order = sorted(data, key=lambda d: DUR.get(d, 0))

print("=" * 118)
print("DIARIZATION — both vendors under IDENTICAL semantics (turn = maximal same-speaker run)")
print("=" * 118)
print(f"{'session':<14} {'min':>5} | {'AssemblyAI (A1)':^30} | {'azure-llm (A2)':^30}")
print(f"{'':<14} {'':>5} | {'spk / turns / segments':^30} | {'spk / turns / segments':^30}")
for d in order:
    cells = []
    for a in ("A1", "A2"):
        r = data[d].get(a)
        if r:
            cells.append("{:^30}".format("{} / {} / {}".format(r["spk"], r["turns"], r["segs"])))
        else:
            cells.append("{:^30}".format("—"))
    print(f"{d:<14} {DUR.get(d,0)/60:>5.0f} | " + " | ".join(cells))

print()
print("=" * 118)
print("GRANULARITY — seconds of audio per TURN (the production-equivalent number)")
print("=" * 118)
print(f"{'arm':<20} {'median s/turn':>14} {'median s/segment':>18} {'longest single turn':>22}")
for a in ("A1", "A0", "A2", "A3"):
    vals = [data[d][a] for d in data if a in data[d] and data[d][a]["dur"]]
    if not vals:
        continue
    per_turn = [v["dur"] / max(1, v["turns"]) for v in vals]
    per_seg = [v["dur"] / max(1, v["segs"]) for v in vals]
    print(f"{ARM[a]:<20} {st.median(per_turn):>14.1f} {st.median(per_seg):>18.1f}"
          f" {max(v['longest'] for v in vals)/60:>19.1f} min")

print()
print("=" * 118)
print("SYNTHESIS §14.3 RE-TEST — does AssemblyAI collapse to ~1 speaker on long meetings?")
print("=" * 118)
print(f"{'bucket':<16} {'AssemblyAI (A1)':>28} {'azure-llm (A2)':>28}")
for name, lo, hi in [("< 10 min", 0, 600), ("10-30 min", 600, 1800),
                     ("30-60 min", 1800, 3600), ("60-120 min", 3600, 7200),
                     ("> 120 min", 7200, 10**9)]:
    cells = []
    for a in ("A1", "A2"):
        vals = [data[d][a] for d in data if a in data[d] and lo <= data[d][a]["dur"] < hi]
        if vals:
            sp = st.median([v["spk"] for v in vals])
            tu = st.median([v["turns"] for v in vals])
            cells.append(f"{f'{sp:.0f} spk / {tu:.0f} turns (n={len(vals)})':>28}")
        else:
            cells.append(f"{'—':>28}")
    print(f"{name:<16} " + " ".join(cells))

print()
print("=" * 118)
print("DEGENERATE SPEAKER SIGNAL — 1 speaker, or <3 turns, on audio longer than 10 minutes")
print("=" * 118)
for a in ("A1", "A0", "A2", "A3"):
    elig = [d for d in data if a in data[d] and data[d][a]["dur"] > 600]
    bad = [d for d in elig if data[d][a]["spk"] <= 1 or data[d][a]["turns"] < 3]
    detail = "; ".join(f"{d} ({data[d][a]['spk']}spk/{data[d][a]['turns']}turns)" for d in bad)
    print(f"{ARM[a]:<20} {len(bad)}/{len(elig)} degenerate" + (f"   -> {detail}" if bad else ""))
