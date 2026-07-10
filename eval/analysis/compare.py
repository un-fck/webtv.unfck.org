#!/usr/bin/env python3
"""Reference-free cross-provider transcript analysis.

For each (video, language) it aligns all providers' transcripts on a shared
timeline, computes deterministic per-provider quality signals, and flags
consensus anomalies (a provider diverging from a >=majority of the others).

No ground truth required: the ensemble of providers is the pseudo-reference.

Outputs (under eval/analysis/out/):
  <symbol>/<lang>.aligned.md     human/LLM-readable 6-column windows
  <symbol>/<lang>.signals.json   per-provider stats
  <symbol>/<lang>.anomalies.json flagged consensus divergences
  summary.json                   roll-up across everything
"""
import json
import os
import re
import math
from collections import Counter, defaultdict

RAW = os.path.join(os.path.dirname(__file__), "..", "results", "raw")
OUT = os.path.join(os.path.dirname(__file__), "out")
PROVIDERS = ["assemblyai", "mistral", "gemini", "azure-openai", "alibaba", "elevenlabs",
             "gemini-3.5-flash", "assemblyai-u3-pro", "fun-asr", "qwen3.5-omni-plus",
             # new-style {vendor}-{model} registry keys (post-rename runs)
             "assemblyai-universal-3-5-pro", "assemblyai-universal-3-pro"]
WINDOW_MS = 30_000
# Only our four hand-picked videos (ignore older corpus results in raw/)
ONLY_SYMBOLS = {"UN80-Apr06-keita", "S_PV.10156", "UN80-Apr29-timestamps", "Nebenzia-Starobelsk", "S_PV.10153"}

STOP = set("""the a an and or but of to in on at for with by from as is are was were be been being
this that these those it its he she they them his her their we you i me my our your
de la le les des du un une et en dans pour par sur avec au aux ce cette ces
el los las una y o en de por para con se su sus lo al del que es son
a an the of to and""".split())

# ---------- text utils ----------
def tokens(text):
    return [t for t in re.findall(r"[A-Za-zÀ-ÿ0-9']+", text.lower()) if t]

def content_tokens(text):
    return [t for t in tokens(text) if t not in STOP and len(t) > 2 and not t.isdigit()]

def proper_nouns(text):
    # capitalized tokens not at sentence start heuristics are noisy; collect all
    # multi-cap or capitalized mid-sentence words len>=3 (Latin only)
    pn = re.findall(r"\b([A-ZÀ-Þ][a-zà-ÿ]{2,}(?:[- ][A-ZÀ-Þ][a-zà-ÿ]+)*)\b", text)
    return [p for p in pn if p.lower() not in STOP]

def numbers(text):
    return re.findall(r"\b\d[\d.,]*\b", text)

def soundex(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w:
        return ""
    codes = {**dict.fromkeys("bfpv", "1"), **dict.fromkeys("cgjkqsxz", "2"),
             **dict.fromkeys("dt", "3"), "l": "4", **dict.fromkeys("mn", "5"), "r": "6"}
    first = w[0].upper()
    tail = []
    prev = codes.get(w[0], "")
    for c in w[1:]:
        cc = codes.get(c, "")
        if cc and cc != prev:
            tail.append(cc)
        if c not in "hw":
            prev = cc
    return (first + "".join(tail) + "000")[:4]

def edit_ratio(a, b):
    # normalized Levenshtein distance in [0,1]; 0 = identical
    la, lb = len(a), len(b)
    if la == 0 and lb == 0:
        return 0.0
    prev = list(range(lb + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / max(la, lb)

def phonetic_near(a, b):
    return soundex(a) == soundex(b) or edit_ratio(a, b) <= 0.34

# ---------- script / language leak ----------
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

EXPECTED_SCRIPT = {"en": "latin", "fr": "latin", "es": "latin",
                   "ar": "arabic", "zh": "cjk", "ru": "cyrillic", "floor": None}

# ---------- load ----------
def load(symbol_dir, lang):
    out = {}
    for p in PROVIDERS:
        f = os.path.join(RAW, symbol_dir, f"{p}_{lang}.json")
        if os.path.exists(f):
            d = json.load(open(f))
            out[p] = {"durationMs": d.get("durationMs", 0),
                      "utts": d.get("utterances", []),
                      "fullText": d.get("fullText", "")}
    return out

# ---------- per-provider signals ----------
def repetition_score(text):
    tk = tokens(text)
    if len(tk) < 6:
        return 0.0
    tri = [tuple(tk[i:i+3]) for i in range(len(tk) - 2)]
    rep = sum(1 for i in range(1, len(tri)) if tri[i] == tri[i-1])
    return round(rep / len(tri), 3)

def signals(data, lang):
    res = {}
    expect = EXPECTED_SCRIPT.get(lang)
    for p, d in data.items():
        utts = d["utts"]
        dur = d["durationMs"] or (utts[-1]["end"] if utts else 0)
        txt = d["fullText"] or " ".join(u["text"] for u in utts)
        sc = script_counts(txt)
        total_script = sum(sc.values()) or 1
        # coverage: union of utterance spans / duration
        covered = sum(max(0, u["end"] - u["start"]) for u in utts)
        last_end = max((u["end"] for u in utts), default=0)
        res[p] = {
            "utt_count": len(utts),
            "char_count": len(txt),
            "duration_min": round(dur / 60000, 1),
            "last_end_min": round(last_end / 60000, 1),
            "chars_per_min": round(len(txt) / (dur / 60000), 0) if dur else 0,
            "coverage_pct": round(100 * covered / dur, 1) if dur else 0,
            "fffd": txt.count("�"),
            "repetition": repetition_score(txt),
            "script_mix": {k: round(100*v/total_script, 1) for k, v in sc.items()},
            "off_script_pct": round(100 * (1 - sc.get(expect, 0)/total_script), 1) if expect else None,
        }
    return res

# ---------- alignment ----------
def align(data):
    nwin = 0
    for d in data.values():
        for u in d["utts"]:
            nwin = max(nwin, int(u["start"] // WINDOW_MS) + 1)
    windows = []
    for w in range(nwin):
        lo, hi = w * WINDOW_MS, (w + 1) * WINDOW_MS
        row = {"win": w, "t": f"{lo//60000}:{(lo//1000)%60:02d}"}
        for p, d in data.items():
            seg = " ".join(u["text"] for u in d["utts"] if lo <= u["start"] < hi)
            row[p] = seg.strip()
        windows.append(row)
    return windows

def first_window(data, provider, name):
    """Earliest 30s window where `provider` utters `name` (for localization)."""
    for u in data[provider]["utts"]:
        if re.search(r"\b" + re.escape(name) + r"\b", u["text"]):
            ms = u["start"]
            return f"{int(ms//60000)}:{int((ms//1000)%60):02d}"
    return None

# ---------- entity-level cross diff (document) ----------
# Document scope avoids the cross-provider timestamp-offset noise that makes
# window-level token voting useless. Proper nouns + numbers are where the
# error classes we care about (name hallucination, misheard figures) live.
def entity_diff(data, lang):
    present = list(data.keys())
    full = {p: (d["fullText"] or " ".join(u["text"] for u in d["utts"]))
            for p, d in data.items()}
    # proper-noun detection only meaningful for cased scripts (latin/cyrillic)
    cased = EXPECTED_SCRIPT.get(lang) in (None, "latin", "cyrillic")
    pn = {p: Counter(proper_nouns(full[p])) for p in present} if cased else {p: Counter() for p in present}
    nums = {p: Counter(numbers(full[p])) for p in present}

    # 1) proper nouns present in exactly ONE provider (>=2 mentions) = halluc/odd-spelling
    unique_pn, allpn = [], Counter()
    for p in present:
        allpn.update(set(pn[p]))
    for name, inn in allpn.items():
        if inn == 1:
            owner = next(p for p in present if name in pn[p])
            if pn[owner][name] >= 2:
                others = set().union(*[set(pn[q]) for q in present if q != owner]) or set()
                near = any(phonetic_near(name, o) for o in others)
                unique_pn.append({"name": name, "provider": owner, "count": pn[owner][name],
                                  "likely": "acoustic" if near else "hallucination",
                                  "at": first_window(data, owner, name)})

    # 2) name table: proper nouns where providers DISAGREE on count/spelling.
    #    Cluster names by soundex so spelling variants of one person group together.
    clusters = defaultdict(lambda: defaultdict(Counter))  # sx -> provider -> {name:count}
    for p in present:
        for name, c in pn[p].items():
            if c >= 2 or len(name) >= 5:
                clusters[soundex(name.split()[0])][p].update({name: c})
    name_table = []
    for sx, perprov in clusters.items():
        variants = set()
        for pc in perprov.values():
            variants |= set(pc)
        if len(variants) > 1 or len(perprov) < len(present):  # disagreement
            name_table.append({
                "variants": sorted(variants),
                "by_provider": {p: dict(perprov.get(p, {})) for p in present},
            })

    # 3) numbers in exactly one provider (rough misheard-figure signal)
    unique_nums, alln = [], Counter()
    for p in present:
        alln.update(set(nums[p]))
    for num, inn in alln.items():
        if inn == 1:
            owner = next(p for p in present if num in nums[p])
            if nums[owner][num] >= 2:
                unique_nums.append({"number": num, "provider": owner, "count": nums[owner][num]})

    return {"unique_proper_nouns": sorted(unique_pn, key=lambda x: -x["count"]),
            "name_table": name_table,
            "unique_numbers": sorted(unique_nums, key=lambda x: -x["count"])[:30]}

# ---------- main ----------
def discover():
    jobs = []
    for sym in sorted(os.listdir(RAW)):
        d = os.path.join(RAW, sym)
        if not os.path.isdir(d) or sym not in ONLY_SYMBOLS:
            continue
        langs = sorted({f.split("_")[-1].replace(".json", "")
                        for f in os.listdir(d) if f.endswith(".json")})
        for l in langs:
            jobs.append((sym, l))
    return jobs

def main():
    summary = []
    for sym, lang in discover():
        data = load(sym, lang)
        if len(data) < 2:
            continue
        present = list(data.keys())
        sig = signals(data, lang)
        win = align(data)
        ent = entity_diff(data, lang)
        od = os.path.join(OUT, sym)
        os.makedirs(od, exist_ok=True)
        json.dump({"providers": present, "signals": sig}, open(f"{od}/{lang}.signals.json", "w"),
                  ensure_ascii=False, indent=2)
        json.dump(ent, open(f"{od}/{lang}.anomalies.json", "w"),
                  ensure_ascii=False, indent=2)
        # aligned markdown (only non-empty windows)
        with open(f"{od}/{lang}.aligned.md", "w") as fo:
            fo.write(f"# {sym} / {lang}\n\n")
            for row in win:
                cells = {p: row.get(p, "") for p in present}
                if not any(cells.values()):
                    continue
                fo.write(f"\n## [{row['win']}] {row['t']}\n")
                for p in present:
                    if cells[p]:
                        fo.write(f"- **{p}**: {cells[p]}\n")
        halluc = [u for u in ent["unique_proper_nouns"] if u["likely"] == "hallucination"]
        summary.append({
            "symbol": sym, "lang": lang, "providers": present,
            "name_disagreements": len(ent["name_table"]),
            "unique_pn_hallucination": halluc[:10],
            "unique_numbers": len(ent["unique_numbers"]),
            "signals": {p: {k: sig[p][k] for k in
                            ("utt_count", "coverage_pct", "fffd", "repetition",
                             "off_script_pct", "chars_per_min")} for p in present},
        })
        print(f"{sym:24} {lang:5} providers={len(present)} "
              f"name_disagree={len(ent['name_table'])} halluc_names={len(halluc)}")
    json.dump(summary, open(os.path.join(OUT, "summary.json"), "w"),
              ensure_ascii=False, indent=2)
    print(f"\nWrote {OUT}/summary.json ({len(summary)} video-langs)")

if __name__ == "__main__":
    main()
