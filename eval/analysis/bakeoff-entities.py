#!/usr/bin/env python3
"""Entity / probe-word scoring for the anecdotal battery (SYNTHESIS §13.2).

For each arm's raw floor transcript, counts hits of the known-good entities
and the known failure spellings from SYNTHESIS §5/§6. A correct provider has
high counts in GOOD and zero in BAD; a BAD hit is the §6.1 hallucination class
(or the u3-pro "Haiti Initiative" mishearing class) reproduced.
"""
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(__file__), "..", "results", "raw")

ARMS = [
    "speechmatics-melia-1",
    "soniox-stt-async-v5",
    "elevenlabs-scribe-v2-tuned",
    "azure-llm-speech",
    "gemini-3-flash",
]

# (symbol, {label: [regexes]}) — case-insensitive
PROBES = {
    "UN80-Apr06-keita": {
        "GOOD Keita": [r"\bKeita\b"],
        "BAD  Kanem (hallucination)": [r"\bKanem\b"],
        "GOOD UN80": [r"\bUN[- ]?80\b"],
        "BAD  UN80 miss (Haiti/UN 2.0/Eighty Init.)": [
            r"Haiti Initiative", r"UN 2\.0", r"Eighty Initiative"],
        "GOOD Bahous": [r"\bBahous\b"],
        "GOOD Bogdan-Martin": [r"Bogdan[- ]Martin"],
        "GOOD Baerbock": [r"\bBaerbock\b"],
    },
    "Nebenzia-Starobelsk": {
        "GOOD appalling": [r"\bappalling\b"],
        "BAD  polling (mishear)": [r"\bpolling\b"],
        "GOOD cold blood": [r"cold[- ]?blood"],
        # Starobilsk is the (standard) Ukrainian transliteration — both count
        "GOOD Starobelsk": [r"\bStarob[ei]lsk"],
        "GOOD Alexeyevich (patronymic)": [r"Alexe[iy]evi[ct]ch|Alekseyevich|Alexeevich"],
    },
}

EXPECT_SPEAKERS = {"UN80-Apr06-keita": 8, "UN80-Apr29-timestamps": 8,
                   "Nebenzia-Starobelsk": 3}


def main():
    for symbol, probes in PROBES.items():
        print(f"\n{'='*72}\n{symbol}\n{'='*72}")
        for arm in ARMS:
            f = os.path.join(ROOT, symbol, f"{arm}_floor.json")
            if not os.path.exists(f):
                print(f"\n--- {arm}: (missing)")
                continue
            d = json.load(open(f))
            text = d.get("fullText", "")
            utts = d.get("utterances", [])
            speakers = len({u.get("speaker") for u in utts})
            dur = d.get("durationMs", 0)
            covered = sum(max(0, u["end"] - u["start"]) for u in utts)
            print(f"\n--- {arm}  chars={len(text)} utts={len(utts)} "
                  f"speakers={speakers} (expect ~{EXPECT_SPEAKERS.get(symbol,'?')}) "
                  f"coverage={round(100*covered/dur,1) if dur else 0}%")
            for label, pats in probes.items():
                n = sum(len(re.findall(p, text, re.I)) for p in pats)
                flag = " <<<" if (label.startswith("BAD") and n > 0) or \
                       (label.startswith("GOOD") and n == 0) else ""
                print(f"    {label}: {n}{flag}")

    # V3: structural signals only
    symbol = "UN80-Apr29-timestamps"
    print(f"\n{'='*72}\n{symbol} (structure only)\n{'='*72}")
    for arm in ARMS:
        f = os.path.join(ROOT, symbol, f"{arm}_floor.json")
        if not os.path.exists(f):
            print(f"--- {arm}: (missing)")
            continue
        d = json.load(open(f))
        utts = d.get("utterances", [])
        text = d.get("fullText", "")
        dur = d.get("durationMs", 0)
        covered = sum(max(0, u["end"] - u["start"]) for u in utts)
        last = max((u["end"] for u in utts), default=0)
        longest = max((u["end"] - u["start"] for u in utts), default=0)
        print(f"--- {arm}: chars={len(text)} utts={len(utts)} "
              f"speakers={len({u.get('speaker') for u in utts})} (expect ~8) "
              f"coverage={round(100*covered/dur,1) if dur else 0}% "
              f"last_end={round(last/60000,1)}m longest_utt={round(longest/60000,1)}m")


if __name__ == "__main__":
    main()
