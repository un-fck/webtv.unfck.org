#!/usr/bin/env python3
"""
Independent WER scorer for the English bake-off.

WHY THIS EXISTS AND IS NOT THE TYPESCRIPT ONE
---------------------------------------------
`eval/metrics/wer.ts` computes `chunkedEditDistance`: for any pair over 3,000
words it slices reference and hypothesis into PROPORTIONAL index-chunks and sums
per-chunk edit distances. That is not WER. It is WER conditional on the two texts
staying globally index-aligned, and it inflates *localized* errors — a dropped
block, a missing opening, a leading offset — by up to 50 points at real session
length, while scoring uniformly-scattered errors correctly. 14 of 21 English
references are over the threshold.

That failure mode is not neutral between our two arms. AssemblyAI's documented
defect is long-file collapse (whole-block behaviour); Azure's is scattered entity
substitution. The chunked scorer amplifies one and not the other, by far more
than the ~1.3-point effect under test.

This scorer does full-sequence alignment via rapidfuzz (C++ Levenshtein with
editops, linear memory, fast enough for 25k-word pairs). It is also deliberately
a SEPARATE IMPLEMENTATION IN A SEPARATE LANGUAGE from the TypeScript metrics, so
that "scored twice" means two instruments rather than two agents running one.

NORMALIZATION VARIANTS
----------------------
Each variant is reported separately rather than folded in, because each one is a
judgement call that can flatter one arm:

  strict   — as close to the shipped `normalizeForWER` as possible (baseline for
             comparability with SYNTHESIS §14/§15).
  apos     — strict + curly apostrophe U+2019 folded to ASCII. The PV files use
             curly exclusively and every provider emits ASCII, so under `strict`
             every possessive and contraction in the corpus is scored as an
             error, for every arm.
  spelling — apos + en-GB/en-US spelling harmonised. UN records are en-GB
             ("programme", "labour", "centre", "defence", "organisation");
             azure-llm is pinned to `en-US` and AssemblyAI is given generic `en`.
             Without this, a config choice is charged to Azure as accuracy.
  numbers  — spelling + digits expanded to words and hyphens split, so ITN house
             style ("10156" vs "ten thousand one hundred and fifty-six",
             "Secretary-General" vs "Secretary General") is not scored as
             accuracy.
  full     — all of the above.

Usage:
  python3 score.py --refs <dir> --hyps <jsonl> --out <json>
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from collections import Counter

try:
    from rapidfuzz.distance import Levenshtein
except ImportError:
    sys.exit("need rapidfuzz: pip3 install --user rapidfuzz")

# Fillers: only the English list, and only genuine disfluencies. The shipped
# TS list removes Spanish content words ("este", "pues", "bueno") and is a no-op
# for ru/ar/zh because JS \b is ASCII-only — neither matters for an English run,
# but the English list is reproduced here rather than imported so this scorer has
# no dependency on the code it is meant to cross-check.
FILLERS_EN = ["um", "uh", "erm", "hmm", "mm", "mhm", "uh-huh"]

# en-GB -> en-US, applied to BOTH sides so it cannot favour either arm.
SPELLING = {
    "programme": "program", "programmes": "programs",
    "labour": "labor", "labours": "labors",
    "centre": "center", "centres": "centers", "centred": "centered",
    "defence": "defense", "defences": "defenses",
    "offence": "offense", "offences": "offenses",
    "organisation": "organization", "organisations": "organizations",
    "organise": "organize", "organised": "organized", "organising": "organizing",
    "recognise": "recognize", "recognised": "recognized", "recognising": "recognizing",
    "emphasise": "emphasize", "emphasised": "emphasized", "emphasising": "emphasizing",
    "realise": "realize", "realised": "realized", "realising": "realizing",
    "utilise": "utilize", "utilised": "utilized",
    "behaviour": "behavior", "behaviours": "behaviors",
    "honour": "honor", "honoured": "honored", "honours": "honors",
    "favour": "favor", "favours": "favors", "favourable": "favorable",
    "neighbour": "neighbor", "neighbours": "neighbors", "neighbouring": "neighboring",
    "endeavour": "endeavor", "endeavours": "endeavors",
    "fulfil": "fulfill", "fulfilment": "fulfillment",
    "practise": "practice", "practised": "practiced",
    "analyse": "analyze", "analysed": "analyzed",
    "modernise": "modernize", "modernised": "modernized",
    "mobilise": "mobilize", "mobilised": "mobilized",
    "stabilise": "stabilize", "stabilised": "stabilized",
    "prioritise": "prioritize", "prioritised": "prioritized",
    "armoured": "armored", "armour": "armor",
    "manoeuvre": "maneuver", "manoeuvres": "maneuvers",
    "sceptical": "skeptical", "sceptic": "skeptic",
    "travelled": "traveled", "travelling": "traveling",
    "signalled": "signaled", "signalling": "signaling",
    "channelled": "channeled", "channelling": "channeling",
    "counselled": "counseled", "counselling": "counseling",
    "judgement": "judgment", "judgements": "judgments",
    "ageing": "aging", "cancelled": "canceled", "cancellation": "cancellation",
}

ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
        "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
        "eighty", "ninety"]


def num_to_words(n: int) -> str:
    if n < 0:
        return "minus " + num_to_words(-n)
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return ONES[n // 100] + " hundred" + (" " + num_to_words(n % 100) if n % 100 else "")
    for div, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= div:
            return num_to_words(n // div) + " " + name + (" " + num_to_words(n % div) if n % div else "")
    return str(n)


def normalize(text: str, variant: str) -> list:
    apos = variant in ("apos", "spelling", "numbers", "full")
    spell = variant in ("spelling", "numbers", "full")
    nums = variant in ("numbers", "full")

    t = text
    if apos:
        # Fold every apostrophe-like codepoint to ASCII before the keep-class
        # runs, otherwise U+2019 is replaced by a space and splits the token.
        t = t.replace("’", "'").replace("ʼ", "'").replace("‘", "'")
        t = t.replace("‛", "'").replace("´", "'").replace("`", "'")
    t = unicodedata.normalize("NFKC", t)
    t = t.lower()

    if nums:
        # Split hyphenated compounds and document symbols before punctuation
        # stripping so "Secretary-General" and "S/2026/426" tokenize the same way
        # regardless of which side wrote them.
        t = re.sub(r"[-‐-―/]", " ", t)

    # Keep letters, numbers, whitespace, ASCII apostrophe, hyphen.
    t = re.sub(r"[^\w\s'-]", " ", t, flags=re.UNICODE)
    t = re.sub(r"_", " ", t)

    words = [w for w in t.split() if w]

    out = []
    for w in words:
        w = w.strip("-'")
        if not w:
            continue
        if w in FILLERS_EN:
            continue
        if spell:
            w = SPELLING.get(w, w)
        if nums and w.isdigit():
            out.extend(num_to_words(int(w)).split())
            continue
        out.append(w)
    return out


def score(ref_words: list, hyp_words: list) -> dict:
    """Full-sequence Levenshtein with S/I/D breakdown. No chunking."""
    ops = Levenshtein.editops(ref_words, hyp_words)
    c = Counter(op.tag for op in ops)
    S, I, D = c.get("replace", 0), c.get("insert", 0), c.get("delete", 0)
    n = len(ref_words)
    return {
        "refLen": n,
        "hypLen": len(hyp_words),
        "S": S, "I": I, "D": D,
        "errors": S + I + D,
        "wer": (S + I + D) / n if n else float("nan"),
    }


VARIANTS = ["strict", "apos", "spelling", "numbers", "full"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refs", required=True, help="dir of <session>.ref.txt")
    ap.add_argument("--hyps", required=True, help="jsonl: {arm,dir,text}")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    refs = {}
    for fn in os.listdir(a.refs):
        if fn.endswith(".ref.txt"):
            refs[fn[:-len(".ref.txt")]] = open(os.path.join(a.refs, fn), encoding="utf-8").read()

    rows = []
    with open(a.hyps, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            h = json.loads(line)
            if h["dir"] not in refs:
                print(f"  !! no reference for {h['dir']}, skipped", file=sys.stderr)
                continue
            row = {"arm": h["arm"], "dir": h["dir"], "symbol": h.get("symbol"),
                   "pass": h.get("pass"), "variants": {}}
            for v in VARIANTS:
                r = normalize(refs[h["dir"]], v)
                y = normalize(h["text"], v)
                row["variants"][v] = score(r, y)
            rows.append(row)
            print(f"  {h['arm']:<3} {h['dir']:<14} p{h.get('pass')} "
                  f"strict={row['variants']['strict']['wer']*100:6.2f}%  "
                  f"full={row['variants']['full']['wer']*100:6.2f}%")

    json.dump(rows, open(a.out, "w"), indent=1)
    print(f"\nwrote {len(rows)} rows -> {a.out}")


if __name__ == "__main__":
    main()
