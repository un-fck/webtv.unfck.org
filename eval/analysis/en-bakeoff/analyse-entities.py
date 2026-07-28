#!/usr/bin/env python3
"""
Entity and document-symbol fidelity, swept systematically across the corpus.

WHY THIS IS SEPARATE FROM WER
-----------------------------
SYNTHESIS §15.5a found azure-llm rendering "UN80" correctly 6 times and mangling
it ~50 times into "the UNAT initiative" / "the UNAD initiative". UNAT is a real
UN body (the Appeals Tribunal). That is ~50 tokens in a 22,837-word transcript —
0.2% — so it does not move WER at all, and WER is what decided §14/§15. In a UN
record the institution being discussed IS the content, so this error class is
worth more than its token count and has to be counted on its own.

DENOMINATOR FROM THE SOURCE
---------------------------
Entity candidates are extracted from the GROUND TRUTH, not from provider output.
A check that counted only the entities a provider managed to emit would read
"100% correct" on a transcript that dropped half of them. For each entity the PV
contains, we ask: how many times does each arm reproduce it?

This is a recall measure over exact surface forms, so it under-counts legitimate
variants ("Secretary-General" vs "Secretary General"). It is therefore reported
as a PAIRED comparison between arms on identical targets — the absolute rate is
not the interesting number, the gap between arms is.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

REFS = "/Volumes/SSDAStorage/un-en-bakeoff/references/AFTER-fix"
HYPS = "/Volumes/SSDAStorage/un-en-bakeoff/hyps.jsonl"

ARM = {"A0": "AssemblyAI @64k", "A1": "AssemblyAI @orig",
       "A2": "azure-llm @64k", "A3": "azure-llm @128k"}

# UN document symbols: S/PV.10156, S/2026/426, A/78/L.4, S/PRST/2024/4, A/RES/78/1
SYMBOL_RE = re.compile(r"\b[ASE]/(?:[A-Z]{2,6}[./])?[\dA-Z.]{1,8}(?:/[\dA-Z.]{1,8}){0,3}\b")
# Acronyms: 2+ caps, optionally with digits (UNIFIL, UNMISS, UN80, OCHA, DPPA)
ACRONYM_RE = re.compile(r"\b(?:[A-Z]{2,}\d*|UN\d+)\b")


def load_refs():
    out = {}
    for fn in os.listdir(REFS):
        if fn.startswith("._") or not fn.endswith(".ref.txt"):
            continue
        out[fn[: -len(".ref.txt")]] = open(os.path.join(REFS, fn), encoding="utf-8").read()
    return out


def load_hyps():
    out = defaultdict(dict)
    with open(HYPS, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            h = json.loads(line)
            if h.get("pass", 1) == 1:
                out[h["dir"]][h["arm"]] = h["text"]
    return out


STOP = {"THE", "AND", "FOR", "THAT", "THIS", "WITH", "FROM", "HAVE", "NOT", "ALL",
        "ITS", "HAS", "WHO", "WAS", "ARE", "OUR", "WILL", "MUST", "III", "II", "IV", "VI"}


def main():
    refs = load_refs()
    hyps = load_hyps()
    sessions = sorted(set(refs) & set(hyps))
    if not sessions:
        sys.exit("no scored sessions yet")

    arms = sorted({a for d in sessions for a in hyps[d]})

    print("=" * 112)
    print("UN DOCUMENT SYMBOLS — recall against the symbols the PV actually contains")
    print("Exact surface match. Denominator is the PV's symbol count, not the provider's.")
    print("=" * 112)
    print(f"{'session':<14} {'PV symbols':>11} " + " ".join(f"{ARM[a]:>18}" for a in arms))
    tot = Counter()
    totref = 0
    missed_detail = defaultdict(list)
    for d in sessions:
        ref_syms = Counter(SYMBOL_RE.findall(refs[d]))
        # ignore the meeting's own S/PV header symbol if it appears once
        nref = sum(ref_syms.values())
        if not nref:
            continue
        totref += nref
        cells = []
        for a in arms:
            got = 0
            h = hyps[d].get(a, "")
            for sym, cnt in ref_syms.items():
                got += min(cnt, len(re.findall(re.escape(sym), h)))
                if len(re.findall(re.escape(sym), h)) < cnt:
                    missed_detail[a].append(f"{d}:{sym}")
            tot[a] += got
            cells.append(f"{f'{got}/{nref}':>18}")
        print(f"{d:<14} {nref:>11} " + " ".join(cells))
    print(f"{'TOTAL':<14} {totref:>11} " + " ".join(f"{f'{tot[a]}/{totref} ({100*tot[a]/totref:.0f}%)':>18}" for a in arms))

    print()
    print("=" * 112)
    print("ACRONYMS — recall against acronyms present in the PV (>=2 occurrences, to skip noise)")
    print("=" * 112)
    agg = defaultdict(Counter)
    ref_tot = Counter()
    for d in sessions:
        ref_ac = Counter(x for x in ACRONYM_RE.findall(refs[d]) if x not in STOP and len(x) >= 2)
        for ac, cnt in ref_ac.items():
            if cnt < 2:
                continue
            ref_tot[ac] += cnt
            for a in arms:
                agg[a][ac] += min(cnt, len(re.findall(r"\b" + re.escape(ac) + r"\b", hyps[d].get(a, ""))))
    if ref_tot:
        print(f"{'acronym':<14} {'in PV':>7} " + " ".join(f"{ARM[a]:>18}" for a in arms))
        for ac, cnt in ref_tot.most_common(30):
            print(f"{ac:<14} {cnt:>7} " + " ".join(f"{f'{agg[a][ac]}':>18}" for a in arms))
        gt = sum(ref_tot.values())
        print(f"{'TOTAL':<14} {gt:>7} " + " ".join(
            f"{f'{sum(agg[a].values())} ({100*sum(agg[a].values())/gt:.0f}%)':>18}" for a in arms))
    else:
        print("  (no acronyms with >=2 occurrences yet)")

    print()
    print("=" * 112)
    print("WRONG-BUT-REAL SUBSTITUTIONS — acronyms an arm emits that the PV never contains")
    print("This is the §15.5a class: a plausible, real institution put in front of a reader.")
    print("=" * 112)
    for a in arms:
        inv = Counter()
        for d in sessions:
            ref_ac = set(x for x in ACRONYM_RE.findall(refs[d]))
            for x in ACRONYM_RE.findall(hyps[d].get(a, "")):
                if x in STOP or len(x) < 3:
                    continue
                if x not in ref_ac:
                    inv[x] += 1
        top = ", ".join(f"{k}x{v}" for k, v in inv.most_common(12))
        print(f"{ARM[a]:<20} {sum(inv.values()):>5} invented-acronym tokens  {top}")


if __name__ == "__main__":
    main()
