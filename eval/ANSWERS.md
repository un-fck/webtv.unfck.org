# UN interpretation: how far behind, and could a machine do better?

Start here. Detail lives in `eval/interp-lag/FINDINGS-phase1.md` (the human
measurement) and `eval/live/README.md` (the benchmark design).

Two questions, answered separately, because they have different answers:

- **Speed** — how long after a speaker says something does it exist in the
  other five languages?
- **Quality** — how much of what was said actually survives?

A system can win one and lose the other. Nothing here is combined into a single
score.

---

## Q1. How far behind does the interpretation run?

**Median 1.6 seconds.** But the average is the least interesting number in the
table, because the language pair dominates it:

| speaker's language | median lag |
|---|---|
| **Arabic** | **4.7 s** |
| French | 2.0 s |
| Russian | 1.7 s |
| Spanish | 1.3 s |
| English | 0.9 s |

Interpreting *out of Arabic* takes 3–5× longer than out of any other UN
language. That is the direction the literature predicts — Arabic word order
forces an interpreter to wait for more of the sentence before committing — but
the size of the gap is the finding here.

For context, published ear-voice span for conference interpreters is ~3 s. UN
booths come in *faster* than that, which fits: much UN floor time is scripted,
formulaic procedure, and delegations often circulate texts in advance.

### Why you can believe it

Measured from transcripts across 7 meetings / 7.9 hours, using translation-
invariant anchors (numbers and official UN country names, which survive
interpretation unchanged) rather than a model's opinion.

- **The null test reads 0.07 s.** Where the floor is already being spoken in
  the target track's language, that track is not interpreting — it is the floor
  relayed — so the true lag is zero by construction. Across 130 such pairs the
  instrument reads 0.07 s. It returns zero when the answer is zero.
- **Stable across an order of magnitude of filtering.** Sweeping the timing-
  precision threshold from 1 s to 15 s moves the median only 1.61 → 1.76 s.
- **Not an artifact of which words serve as anchors.** Numbers cannot be
  anticipated; country names in formulaic announcements can. If the method were
  flattered by predictable tokens the two would diverge. They don't: 1.5 s vs
  1.6 s.

The stored floor transcripts had to be rebuilt first — all of them predated the
2026-07-10 Speechmatics switch, and Gemini's timestamps drift by tens of
seconds (S/PV.10168's floor emits onsets at 8085 s in a 4898 s video).

---

## Q2. Quality — does a machine preserve more of the meeting?

*(filled in from `eval/live/out/REPORT.txt` once all cells are measured)*

Four pipelines, all scored against the official UN verbatim record:

| arm | pipeline |
|---|---|
| **A** | human interpreter → our ASR — **the incumbent** |
| **B** | floor ASR → Azure OpenAI translation — **the cheap alternative** |
| **C** | one live model, audio → target text |
| **D** | one live model, audio → target audio, then transcribed |

### The one methodological point that matters

A French verbatim record **is not a transcript of the French interpreter**. It
is the original speech rendered by UN *translators*, working from text, with
unlimited time. So it is a translation reference: a home game for arms B/C/D,
an away game for arm A, which gets charged for exactly the compression that
simultaneous interpreting requires.

This is why the headline metric is not WER:

- **chrF++** (0–100, higher better) is the translation metric — character
  n-gram overlap, so paraphrase survives, and it behaves identically in every
  script.
- **Semantic adequacy** (0–100) asks an LLM judge how much *content* survives,
  explicitly ignoring wording, register and fluency — the question WER cannot
  ask, and the one that is fair to interpreters.
- **WER/CER** are secondary and carry two real caveats: `computeWER()` falls
  back to proportional chunking above 3,000 words (so long-session WER is an
  approximation, not a measurement), and Chinese CER exceeded 100% on one cell
  — an artifact, not a finding.

Arm A is therefore reported as a **ceiling to read the machines against**, never
as a verdict on the interpreters.

### Why every number is paired

Session difficulty swamps system differences: the *same* human English
interpretation scores 15.9%, 35.7% and 39.9% WER across our three meetings. So
every system runs the same fixed (session, language) cells, and only cells with
a human track are used — the rest cannot answer "better or worse than a human".

---

## Q3. Latency — could a machine keep up with the booth?

*(filled in from `eval/live/out/REPORT.txt`)*

Measured by streaming audio at **1× real time**, never faster. Firehosing a
file into a socket measures a vendor's backend throughput, not what a delegate
in the room would experience.

The bar is **1.6 s median / 4.7 s from Arabic**.

---

## Cost

The whole study, including every re-run, is a rounding error against the
question it answers. Running totals are in `eval/live/out/REPORT.txt`.
