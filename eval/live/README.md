# Live interpretation benchmark

Two questions, answered independently:

1. **How far behind the speaker does each UN interpretation booth run?**
   (`eval/interp-lag/` — see `FINDINGS-phase1.md`)
2. **Could a machine do it better, or faster?** (this directory)

Quality and latency are kept apart throughout. A system can be excellent at one
and hopeless at the other, and collapsing them into a single score would hide
exactly the trade-off worth knowing about.

## The arms

| arm | pipeline | has latency? |
|---|---|---|
| **A** | human interpreter → our production ASR | human EVS, from Phase 1 |
| **B** | floor ASR (Speechmatics Melia) → Azure OpenAI translation | no (offline) |
| **C** | live, audio in → target **text** out | yes, measured |
| **D** | live, audio in → target **audio** out | yes, measured |

Arm C contains two *architectures*, which fail differently enough that the
distinction matters more than the vendor choice:

- **Single-model live translation** — Soniox, OpenAI Realtime, Azure Speech
  Translation. Often natively multilingual.
- **Caption-then-translate** — streaming ASR → MT over the captions. This is
  the YouTube shape, and the shape of Meet, Teams, Zoom and the AWS reference
  architecture. Its ASR must **commit to one source language**, which on a UN
  floor is wrong for part of every meeting.

Arm D emits audio, so it is transcribed afterwards to be scorable. That ASR
pass adds errors the model is not responsible for — a delegate hears the audio
and never sees the transcript — so a strong monolingual ASR is used on what is
clean synthetic speech, and the caveat is reported rather than charged to the
model.

## Why there is a fixed matrix

Session difficulty swamps system differences. The *same* human English
interpretation scores 15.9%, 35.7% and 39.9% WER on our three sessions — a
24-point swing, larger than any system difference worth detecting. So a system
evaluated on the easy meeting would beat one evaluated on the hard meeting no
matter how bad it was.

`matrix.ts` therefore fixes the cells. A **cell** is (session, target
language), and it only qualifies if a **human interpreted track exists**, since
that is the baseline the whole exercise is about. Every system runs the same
cells; every comparison is paired within a cell; only paired deltas are
averaged.

- **Tier 1** — `S/PV.10161`, the one session with five interpreted tracks
  (ar/en/es/fr/zh). A 25-minute meeting yielding a five-language crossed
  comparison, which is what makes it affordable for the $2+/hr vendors.
- **Tier 2** — `S/PV.10156` and `S/PV.10168`, for systems cheap enough to run
  everywhere. Together: 11 cells.

## Metrics

**chrF++ is primary** (`eval/metrics/chrf.ts`), 0–100, higher is better. It is
the translation metric — character n-gram overlap — so it survives legitimate
paraphrase and behaves identically in every script.

WER/CER are secondary and must be read with two caveats:
- `computeWER()` silently falls back to **proportional chunking** above 3,000
  words, comparing chunk *i* of the reference to chunk *i* of the hypothesis.
  Drift inflates the result, so WER on the 82-minute session is an
  approximation. (Pre-existing; affects the published eval too.)
- Chinese has no word boundaries. Its CER exceeded 100% on one cell — an
  artifact of scoring, not a finding: the transcript was 1754 CJK characters
  against the record's 1815, with matching content.

**Semantic adequacy** (`judge.ts`), 0–100, is the metric that asks what the
surface metrics cannot: how much of what the speaker said survives, explicitly
ignoring wording, register and fluency. This matters because interpreters are
*trained* to compress and paraphrase, and WER punishes them for it.

**Semantic adequacy** (`judge.ts`), 0–100 — how much content survives, ignoring
wording. Fair to interpreters, whose craft is compression.

**NTR** (`ntr.ts`), 0–100 — the model broadcasters actually certify live
subtitles with. Errors weighted by meaning damage (minor 0.25 / standard 0.5 /
serious 1.0) and split into **T**ranslation vs **R**ecognition origin, so it
says *which stage to fix*. Threshold 98. **Suppressed below 80% coverage**: its
denominator is the candidate's own word count, so it scored a nonsense
transcript at 96.6 before that guard existed.

**Caption readability** (`caption-quality.ts`) — chars per caption, replacement
rate, reading rate against the ~21 char/sec ceiling, and crucially whether the
system emits caption units at all. Token-streaming translators report
`segmented: no`: they are not captioning systems, and shipping one as such
means building segmentation and timing yourself.

**Coverage** — produced characters / reference characters. Separates *saying
wrong things* from *not saying most things*, which every overlap metric
conflates. This is what turned an uninterpretable arm-D result into a finding.

**Latency** is measured by streaming audio at **1× real time** — never faster.
Firehosing a file into a socket measures vendor backend throughput, not what a
delegate in the room experiences. Reported as median/p90 emission lag plus ATD
(the metric shown to correlate best with human ear-voice span) and LAAL. Raw AL
is included only for comparability with the literature; it rewards
over-generation and should not be used for the human comparison.

## Running it

```bash
tsx eval/interp-lag/fetch-floor.ts          # floor tracks (Melia), ~$1
tsx eval/interp-lag/run-lag.ts              # human interpreter lag
tsx eval/interp-lag/report.ts               # → FINDINGS-phase1.md numbers

tsx eval/live/run-matrix.ts --tier=1 --dry-run   # always estimates first
tsx eval/live/run-matrix.ts --tier=1
tsx eval/live/run-matrix.ts --tier=2 --systems=A-human,B-pivot,C-soniox-rt-v5
tsx eval/live/run-judge.ts                  # adds adequacy scores
tsx eval/live/report-matrix.ts              # → out/REPORT.txt
```

Every runner prints a cost and wall-clock estimate before billing anything and
refuses to start above `--budget`. Results accumulate in
`out/matrix-results.json`; re-runs skip completed cells unless `--force`.

Live arms take **at least as long as the audio**, by construction.

## Vendor notes

Adapters live in `providers/`. Gaps found during the vendor survey
(`eval/analysis/live-models-research.md`) that constrain what can be tested:

- **OpenAI `gpt-realtime-translate`** does not emit **Arabic**.
- **Speechmatics** has **no Arabic translation at all**, plus a published 5 s
  finalization delay.
- **Deepgram** and **AssemblyAI** have no translation feature.
- **Alibaba Gummy** is the cheapest option on paper but its WebSocket endpoint
  could not be verified, so it is not implemented rather than guessed at.
- **Speechmatics real-time rejects `language: multi`** — Melia is batch-only, so
  our production floor model has no live equivalent and arm B cannot simply be
  made live.
- **Azure Speech Translation** answers only on `northeurope` for our key
  (westeurope and eastus 401). Implemented against the raw WebSocket protocol,
  no SDK dependency added.
- **YouTube auto-captions are English-only for LIVE streams**, so there is no
  caption track to auto-translate for a non-English live meeting. See
  `FINDINGS-captioning.md`.
- **Meta Seamless-Streaming** is CC-BY-NC with a repo stale since Nov 2024.

`missingKey()` lets a system be implemented but skipped until a key exists, so
NEEDS-KEY vendors can be added now and run the day credentials arrive.
