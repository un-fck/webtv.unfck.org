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

**Yes — but the winner is the boring offline one, not a live model.**

Eleven cells (3 sessions × the languages each has a human track for), every
comparison paired within a cell.

Mean difference vs the human interpreter:

| pipeline | chrF++ | adequacy | cells won |
|---|---|---|---|
| **B — floor ASR → Azure OpenAI translation** | **+7.6** | **+6.8** | **10 / 11** |
| C — Soniox live translation | −15.2 | −20.4 | 1 / 11 |
| D — OpenAI Realtime speech-to-speech | −44.6 | −59.3 | 0 / 2 |

chrF++ per cell (higher better):

| cell | human | pivot | Soniox live | OpenAI S2S |
|---|---|---|---|---|
| 10156 en | **89.6** | 85.8 | 14.0 | — |
| 10156 zh | 20.3 | **32.1** | 14.2 | — |
| 10161 ar | 42.7 | **52.2** | 39.3 | 6.7 |
| 10161 en | 79.6 | **82.0** | 47.0 | — |
| 10161 es | 64.6 | **74.1** | 65.9 | — |
| 10161 fr | 65.1 | **77.9** | 61.1 | 11.8 |
| 10161 zh | 25.0 | **33.6** | 18.3 | — |
| 10168 en | 81.1 | **83.9** | 50.5 | — |
| 10168 fr | 69.8 | **79.9** | 67.5 | — |
| 10168 ru | 61.7 | **71.9** | 57.1 | — |
| 10168 zh | 27.4 | **37.2** | 24.4 | — |

The pivot's advantage is largest exactly where our own ASR is weakest — the
non-English booths, transcribed by Azure LLM Speech. The pivot never listens to
an interpreter at all: it transcribes the original speaker once, with a strong
multilingual model, and translates text. It therefore avoids compounding
interpreter compression with ASR error.

**Do not read this as "machines out-interpret humans."** The verbatim record is
a *translation* reference produced by UN translators from text with unlimited
time, so it is arm B's home game and arm A's away game — the human is charged
for every compression simultaneous interpreting requires. The right reading is
narrower and still useful: *if the goal is a written record, transcribing the
floor and translating beats transcribing the interpreters.*

### Coverage explains the live arms

| | human | pivot | Soniox | OpenAI S2S |
|---|---|---|---|---|
| share of the record produced | 87–101% | 90–100% | 17–91% | **10–13%** |

OpenAI Realtime's French and Arabic are *fluent and correct* — "Le Conseil de
sécurité va maintenant procéder au vote sur le projet de résolution qui lui est
soumis" is exactly right. It simply never said most of the meeting: 3.1 minutes
of audio for 25 minutes of input. Turn-based realtime APIs commit a turn on
silence, and a continuous debate does not offer one. That is an architectural
limit of the API shape, not a judgement on the model's interpreting ability.

Soniox has a milder version of the same disease (17–91%, worst on English).

---

## Q3. Latency — could a machine keep up with the booth?

**No. The humans are still fastest.**

| | median lag |
|---|---|
| **Human booths** | **1.6 s** (0.9 s from English, 4.7 s from Arabic) |
| Soniox live translation | **~3.0 s** end-to-end (1.8–2.0× slower) |
| OpenAI Realtime S2S | **3.2–3.6 s** (2.0–2.2× slower) |

And the tail is far worse than the median: Soniox's **p90 reaches 22.5 s**,
where the human p90 is 4.7 s. A live model is not merely slower on average — it
occasionally falls half a minute behind.

A caution about that 3.0 s, because it is easy to get wrong: Soniox's own token
stream reports **0.6 s**, which would suggest it beats a human interpreter
threefold. It does not. Translation tokens carry no timestamps and can only be
anchored to the last finalized *source* token, so 0.6 s measures the step from
"the ASR finalized this word" to "its translation is out" and omits how long
the ASR took to finalize it. That omitted half is separately measurable at
**2.38 s median / 4.88 s p90**. End-to-end is the comparable number.

---

## What this means

- **For a written record** (our actual product): switch to the pivot. Transcribe
  the floor once with a strong multilingual model and translate the text. It
  beat the incumbent in 10 of 11 cells on both metrics, and it costs less than
  transcribing six interpreted tracks.
- **For live delivery**: no benchmarked model is ready. The best live text
  system runs ~2× the human lag with a 22 s tail and drops 10–40% of content;
  the speech-to-speech model drops ~90%.
- **Arabic is the hard case throughout** — slowest for humans (4.7 s) and
  lowest-scoring for every machine.

## Caveats worth keeping

- Three Security Council sessions. Nothing here generalizes to the GA general
  debate or technical committees.
- Arm D rests on two cells, and its result is about the API's turn-taking
  model, not the underlying model's ceiling. A streaming-native S2S setup could
  score very differently.
- Only one live-text vendor was benchmarked. Alibaba Gummy is cheaper on paper
  but its WebSocket endpoint could not be verified; Azure Speech Translation,
  Gemini Live and OpenAI's translate model remain unrun (the last emits no
  Arabic).
- Coverage and adequacy are new metrics here, not externally validated.

## Cost

$3–4 of the $40 budget, including every re-run.
