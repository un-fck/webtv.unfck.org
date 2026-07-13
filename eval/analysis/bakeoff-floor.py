#!/usr/bin/env python3
"""Floor bake-off analyzer (SYNTHESIS §13 experiment).

Reads eval/results/raw/<symbol>/<provider>_floor.json for the bake-off arms,
computes script mix / coverage / speaker signals, per-segment language label
distributions where the provider exposes them, and dumps the transcript text
for known language windows (President zh opening, Bahrain ar, Nebenzia ru,
France fr) so the passages can be read against the PV.

Standalone on purpose — does not regenerate compare.py's committed out/ files.
"""
import json
import os
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(__file__), "..", "results", "raw")

ARMS = [
    "soniox-stt-async-v5",
    "speechmatics-melia-1",
    "azure-llm-speech",
    "elevenlabs-scribe-v2-tuned",
    "gemini-3-flash",
    # incumbents for reference when present
    "assemblyai-universal-3-5-pro",
    "google-chirp-3",
]

# consensus reference for S_PV.10153 floor (SYNTHESIS §4/§11.3)
CONSENSUS = {"latin": 75, "arabic": 10, "cyrillic": 13, "cjk": 3}

# known language windows in S_PV.10153 floor (minutes)
WINDOWS = [
    ("President zh opening", 0.0, 1.1),
    ("Bahrain ar statement", 10.3, 14.0),
    ("Nebenzia ru statement", 39.3, 43.0),
    ("France fr statement", 44.3, 47.0),
]


def script_counts(text):
    c = Counter()
    for ch in text:
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF:
            c["cjk"] += 1
        elif 0x0600 <= o <= 0x06FF:
            c["arabic"] += 1
        elif 0x0400 <= o <= 0x04FF:
            c["cyrillic"] += 1
        elif ch.isalpha() and o < 0x250:
            c["latin"] += 1
    return c


def repetition_score(text):
    tk = text.lower().split()
    if len(tk) < 6:
        return 0.0
    tri = [tuple(tk[i : i + 3]) for i in range(len(tk) - 2)]
    rep = sum(1 for i in range(1, len(tri)) if tri[i] == tri[i - 1])
    return round(rep / len(tri), 3)


def lang_labels(provider, d):
    """Per-segment language label distribution, where exposed."""
    raw = d.get("raw") or {}
    langs = Counter()
    if provider.startswith("soniox"):
        for t in raw.get("tokens", []):
            if t.get("language"):
                langs[t["language"]] += len(t.get("text", ""))
    elif provider.startswith("azure-llm"):
        for p in raw.get("phrases", []):
            if p.get("locale"):
                langs[p["locale"]] += len(p.get("text", ""))
    elif provider.startswith("speechmatics"):
        for r in raw.get("results", []):
            alt = (r.get("alternatives") or [{}])[0]
            if alt.get("language"):
                langs[alt["language"]] += len(alt.get("content", ""))
    total = sum(langs.values()) or 1
    return {k: round(100 * v / total, 1) for k, v in langs.most_common(10)}


def analyze(symbol):
    print(f"\n{'='*70}\n{symbol}\n{'='*70}")
    for p in ARMS:
        f = os.path.join(ROOT, symbol, f"{p}_floor.json")
        if not os.path.exists(f):
            continue
        d = json.load(open(f))
        text = d.get("fullText", "")
        utts = d.get("utterances", [])
        c = script_counts(text)
        tot = sum(c.values()) or 1
        mix = {k: round(100 * v / tot, 1) for k, v in c.items()}
        speakers = {u.get("speaker") for u in utts}
        dur = d.get("durationMs") or (utts[-1]["end"] if utts else 0)
        covered = sum(max(0, u["end"] - u["start"]) for u in utts)
        print(f"\n--- {p}")
        print(
            f"  chars={len(text)} utts={len(utts)} speakers={len(speakers)}"
            f" dur={round(dur/60000,1)}m coverage={round(100*covered/dur,1) if dur else 0}%"
            f" repetition={repetition_score(text)}"
            f" chars/min={round(len(text)/(dur/60000)) if dur else 0}"
            f" unk={text.count('<unk>')}"
        )
        print(f"  script mix: {mix}  (consensus: {CONSENSUS})")
        ll = lang_labels(p, d)
        if ll:
            print(f"  language labels (% of chars): {ll}")
        if symbol == "S_PV.10153":
            for label, lo, hi in WINDOWS:
                seg = " ".join(
                    u["text"]
                    for u in utts
                    if lo * 60000 <= u["start"] < hi * 60000
                )
                print(f"  [{label}] {seg[:300]}")


if __name__ == "__main__":
    for symbol in sys.argv[1:] or ["S_PV.10156", "S_PV.10153"]:
        analyze(symbol)
