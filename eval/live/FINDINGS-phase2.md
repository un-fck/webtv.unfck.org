# Phase 2 findings — can a machine replace or beat the booth?

Four arms, one ground truth (the UN verbatim record), three Security Council
sessions. Arms A and B are complete; arm C has a first system running; arm D
is built but not yet run.

## Read this before the tables

A UN verbatim record in French **is not a transcript of the French
interpreter**. It is the original speech rendered by UN *translators*, working
from text, with unlimited time, then edited to a published standard.

That makes it a **translation reference**, which is a home game for every
machine-translation arm and an away game for the human. Arm A is charged for
each compression, reordering and omission that simultaneous interpreting
*requires* — none of which is an error, all of which are the craft. So arm A's
score is not a verdict on the interpreters. It is the number that "a
professional human working under real-time constraint" scores on this metric,
and the machines should be read *relative to it*, never in the absolute.

## Arm A (human interpreter → our ASR) vs Arm B (floor ASR → Azure OpenAI MT)

WER against the PV record, except Chinese which uses CER (Chinese is written
without spaces, so word-level WER reads ~90–100% regardless of quality).

| session | lang | metric | A: interpreter | B: pivot | delta |
|---|---|---|---|---|---|
| S/PV.10156 | en | WER | **15.9%** | 20.7% | +4.7 |
| S/PV.10161 | en | WER | 35.7% | **30.4%** | −5.4 |
| S/PV.10161 | fr | WER | 63.1% | **40.7%** | −22.4 |
| S/PV.10161 | es | WER | 62.3% | **45.6%** | −16.7 |
| S/PV.10161 | ar | WER | 82.5% | **76.6%** | −5.9 |
| S/PV.10161 | zh | CER | 62.9% | **40.6%** | −22.4 |
| S/PV.10168 | en | WER | 39.9% | **33.8%** | −6.1 |
| S/PV.10168 | fr | WER | 67.2% | **49.7%** | −17.5 |
| S/PV.10168 | ru | WER | 77.3% | **65.1%** | −12.2 |
| S/PV.10168 | zh | CER | 66.9% | **46.0%** | −20.8 |

**The pivot wins 9 of these 10 cells, by a mean of 12.5 points.** The single
loss is English on the shortest session, where the interpreted track is
already excellent (15.9%) because much of that meeting's floor *was* English.

One further cell — S/PV.10156 zh, arm A — returned a CER of **117.5%**, which
is above 100% and therefore an artifact rather than a result (the hypothesis
is far longer than the reference, pointing at a truncated Chinese PV parse:
the parser's speaker-splitting patterns are Latin-oriented). It is excluded
from the mean above and must be diagnosed before any Chinese arm-A figure is
quoted.

### How to read that honestly

The direction is consistent and large, but part of it is the reference bias
described above and part of it is real. Three observations separate them:

- **The gap is smallest in English (5–6 pts) and largest in fr/es/zh
  (17–22 pts).** If this were purely reference bias it should be roughly
  uniform. It is not — which suggests a genuine ASR component: our non-English
  tracks are transcribed by Azure LLM Speech, and arm B routes around that by
  transcribing only the floor (with Melia) and translating text.
- **Arm B never has to hear an interpreter.** It reads the original speaker
  directly, so it is not compounding interpreter compression with ASR error.
- **Arm B is not doing the same job.** It is a *transcript* pipeline, not an
  interpretation one — no latency constraint at all in the numbers above.

## Arm C (direct live speech-translation) — first system

Soniox `stt-rt-v5`, floor audio streamed at 1× real time, S/PV.10156 → French:

| | quality | median lag | p90 lag | ATD | cost |
|---|---|---|---|---|---|
| Soniox real-time | WER 56.6% | **6.0 s** | 15.3 s | 5.3 s | $0.018 |

Against the Phase 1 human measurement on the same corpus:

| | median lag |
|---|---|
| **Human interpreter booths** | **1.6 s** (4.7 s from Arabic) |
| Soniox live translation | 6.0 s |

**The live model runs roughly four times further behind the speaker than the
human booths do**, and further behind than even the hardest human language
pair. This is the finding that the whole latency harness exists to produce,
and it cuts against the "AI is faster" intuition: on quality the machines are
competitive, on *lag* the humans are still comfortably ahead.

That is consistent with the literature: IWSLT state of the art operates around
2 s AL, but AL flatters systems by rewarding over-generation, and
computation-aware latency runs 1.1–2.3× higher than the idealized figure.

## Cost so far

| item | spend |
|---|---|
| Floor re-transcription, 7.9 h × 2 passes (Speechmatics Melia) | $1.05 |
| Phase 1 embeddings (text-embedding-3-large) | $0.05 |
| Arm B translation, 3 sessions × 6 languages (Azure OpenAI) | ~$0.90 |
| Arm C pilot (Soniox) | $0.02 |
| **Total** | **≈$2.0 of $40** |

## What is built but not yet run

- **Arm C, remaining systems.** Alibaba Gummy ($0.075/hr), Azure Speech
  Translation ($2.50/hr), Gemini Live, OpenAI `gpt-realtime-translate`. Note
  two hard gaps found in the research: OpenAI's translate model **does not emit
  Arabic**, and Speechmatics has **no Arabic translation at all** plus a
  published 5 s finalization delay.
- **Arm D, live speech-to-speech**, scored by transcribing the output audio.
  Capped at one session × two target languages.
- **NEEDS-KEY, implemented and skipped**: DeepL Voice, Palabra.ai, Camb.ai,
  Wordly. Meta Seamless-Streaming is CC-BY-NC with a repo stale since Nov 2024
  — documented, not benchmarked.

## Known weaknesses

- **Three sessions, one meeting type.** All Security Council. Nothing here
  generalizes to GA general debate or technical committees yet.
- **Arm C rests on one session and one language pair.** The 6.0 s figure is a
  first data point, not an established rate.
- **Soniox translation tokens carry no timestamps**, so their audio position is
  reconstructed by mapping output onto the source timeline. That is
  language-neutral and unbiased in expectation, but it is an estimate, not a
  measurement — unlike the Phase 1 human numbers, which are exact.
- **No adequacy judging yet.** WER/CER against a translation reference is a
  blunt instrument for translation quality; chrF++ and an LLM adequacy judge
  are specified in the plan and not yet wired in.
