# Interpretation lag + live-model benchmark — plan (rev. 2)

Budget ceiling **$40**. Rev. 2 restores live speech-to-speech interpretation to
scope (scored via post-hoc ASR) and fixes the four comparison arms.

---

## The four arms

| Arm | Pipeline | Latency comes from | Quality scored |
|---|---|---|---|
| **A. Current** | human interpreter → our offline ASR | human ear-voice span (Phase 1) | interpreted track vs PV |
| **B. Pivot** | floor audio ASR → Azure OpenAI text translation | streaming floor ASR + incremental MT | translated floor vs PV |
| **C. Direct ST** | audio in → target **text** out, one model | measured in 1× streaming mode | model text vs PV |
| **D. Live interpretation** | audio in → target **audio** out | measured in 1× streaming mode (audio emission) | post-hoc ASR of output vs PV |

Arm A is the incumbent and the thing to beat. Arm B is the cheap production
next step. Arms C and D are the frontier.

Arm D needs an extra ASR pass to become scorable text, which adds an error
layer that arms B and C don't carry. That layer is real — a user of arm D
hears the audio, not the ASR — so it is measured separately and reported as
"ASR overhead" rather than silently charged against the model.

---

## Phase 1 — Human interpreter lag (the reference number)

Unchanged from rev. 1 and already in flight.

**Status**: floor tracks re-transcribed with Speechmatics Melia (6/7 cached,
$1.02) because the stored floor transcripts are Gemini-era and their
timestamps drift by tens of seconds — S/PV.10168's floor emits onsets at
8085 s in a 4898 s video. A second `--force` pass (~$1.02) picks up Melia's
per-word **language labels**, which the adapter was discarding; those labels
are how we recover each speaker's original language without a separate model.

**Method**: tokens → tempo-sized chunks → monotonic DTW over
`text-embedding-3-large` (validated: 5/5 cross-lingual retrieval on realistic
UN sentences, cos margin 0.51–0.59 incl. Arabic and Chinese) → Δ per matched
chunk, validated against a model-free anchor alignment (numbers, document
symbols, and official UN country names in all six languages) and against the
null test (Δ ≈ 0 when the floor language is English and the target is `en`).

**Reports**: Δ by source→target pair, turn-onset Δ vs steady-state Δ, and lag
drift within long turns.

---

## Phase 2 — Benchmark

### Corpus

Whole short sessions with PV in all six languages, so WER is computed over a
complete document with no excerpt-alignment problem. Pilot and expensive arms
run on **one** ~10 min session; cheap arms extend to three.

### Systems

**Arm B** — floor ASR (Melia, already cached, $0) → Azure OpenAI translation
into 6 languages. Token cost only, ~$1.

**Arm C** — KEY-HELD direct speech-translation, all six UN languages verified:
| Model | $/hr | Notes |
|---|---|---|
| Soniox real-time translation | 0.12 | translation bundled with transcription |
| Alibaba DashScope Gummy | ~0.075 | Beijing-region key may not match ours |
| Azure AI Speech Translation | 2.50 | expensive → 1 session only |
| OpenAI `gpt-realtime-translate` | 2.04 | **no Arabic output** → 5 languages |
| Gemini 3.5 Live Translate | ~2.21 | text is a sidecar channel; preview |
| Speechmatics RT translation | n/p | **no Arabic at all**; published 5 s finalization delay |

**Arm D** — live speech-to-speech, capped at 1 session × 2 target languages
(one Latin-script, one hard-script) with a hard spend cap:
OpenAI Realtime (native audio), Gemini Live (native audio). Output audio is
transcribed with our production per-language ASR to score it.

**NEEDS-KEY, implemented but skipped** until a key arrives: DeepL Voice
(real WebSocket API), Palabra.ai, Camb.ai, Wordly. Meta Seamless-Streaming is
CC-BY-NC and its repo is stale since Nov 2024 — documented, not benchmarked.

### Metrics

- **Quality**: WER/CER vs PV, plus chrF++ and an LLM adequacy judge over
  aligned segments. Reported *relative to the human-interpreter ceiling*
  (arm A's own score against PV), never in the absolute.
- **Latency**: median/p90 emission lag, plus Average Lagging and
  computation-aware AL, on the same axis as the Phase 1 human EVS.

### The methodological trap (unchanged, still the headline caveat)

A French PV is not a transcript of the French interpreter — it is the original
speech rendered by UN *translators* with unlimited time. Scoring arm A against
it penalizes exactly the compression simultaneous interpreting requires, while
arms B/C/D are scored against a translation reference, which is their home
game. Every table reports arm A's score alongside as the ceiling.

---

## Budget ($40 ceiling)

| Item | Est. |
|---|---|
| Phase 1 floor transcription (2 passes) | $2.05 |
| Phase 1 embeddings + adequacy judge | ~$1 |
| Arm B translation (6 langs × 3 sessions) | ~$1 |
| Arm C cheap (Soniox, Gummy — 3 sessions × 6 langs) | ~$0.6 |
| Arm C expensive (Azure, OpenAI, Gemini — 1 session × 6 langs) | ~$6.8 |
| Arm D (2 systems × 1 session × 2 langs) | ≤$8, hard-capped |
| Arm D post-hoc ASR | ~$0.4 |
| **Total** | **≈$20**, half the ceiling |

Every runner prints a dry-run cost estimate and refuses to exceed `--budget`.
