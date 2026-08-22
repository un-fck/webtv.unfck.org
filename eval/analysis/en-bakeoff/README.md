# English bake-off — AssemblyAI Universal-3.5 Pro vs `azure-llm-speech`

Run 2026-07-28 on branch `eval/en-assemblyai-vs-azurellm`. English track only.

## Read in this order

| file | what it is |
| --- | --- |
| **`RECOMMENDATION.md`** | the decision, options with trade-offs, and what would change it |
| **`REPORT.md`** | the full evidence: cost, accuracy, speed, reliability, diarization |
| `CRITERIA.md` | every criterion `SYNTHESIS.md` §9/§14/§15 defines, applied, with prior claims that did not survive marked ⚠️ |
| `FACTS-probes.md` | what was measured against the live APIs and our own invoice, as opposed to read in docs |
| `threeway/SYNTHESIS-first-six.md` | the qualitative three-way comparison, **as corrected by adversarial review** |
| `PLAN-en-assemblyai-vs-azurellm.md` | the pre-registration, written before any run |

## Headline

Three pillars carried "move English to Azure" in §14/§15. **One shrank** (WER
advantage 1.0–1.3 → 0.48 points), **one inverted** (Azure is 1.46× *dearer*, not
free), **one did not reproduce** (the incumbent's long-file diarization collapse).
The instrument that produced them was defective in two independent ways.

And **86% of the two vendors' errors are the same error**, so the vendor choice
can only touch ~11% of what is wrong with these transcripts.

## The code

| script | purpose |
| --- | --- |
| `sessions.ts` | the pre-registered session manifest — headline / diagnostic / battery / short |
| `run-bakeoff.ts` | the 4-arm runner. Does **not** reuse `eval/run.ts`, whose cache key cannot distinguish two arms of the same provider |
| `prep-references.ts` | builds the scored reference + a **conservation ledger** (denominator = raw `en.txt`, residue reported not rounded) |
| `make-hyps.ts` | raw → scorable, with integrity gates (model-served assertion, truncation tripwire, words/min floor) |
| `score.py` | the WER scorer — full alignment, no chunking, 5 normalization variants. Deliberately a different language from `eval/metrics` so "scored twice" means two instruments |
| `negative-controls.py` | 22 controls **including contiguous and prepend damage** |
| `negative-controls-ts.ts` | the same controls through the shipped scorer, which fails 5 of 16 |
| `test-normalize.py` | 25 tests for normalization symmetry |
| `analyse-wer.py` | micro + macro, correct bootstrap, pre-registered primary endpoint, TOST codec equivalence |
| `analyse-speed.py` | RTF with the upload leg regressed out, and a validation check on the regression |
| `analyse-shared-errors.py` | the error-overlap census — the 86% figure |
| `analyse-diarization2.py` | speakers/turns under **identical** semantics for both vendors |
| `analyse-entities.py` | entity and symbol fidelity, with two loud caveats about what it does *not* measure |
| `production-reliability.ts`, `failure-causes.ts` | reliability from `processing_usage_events`, classified by root cause (read-only) |
| `probe-api.ts`, `probe-api2.ts`, `probe-profanity.ts`, `probe-phraselist.ts` | live API probes: billing meters, model pinnability, entity biasing, the profanity mask |
| `battery.ts` | the §14.2 hallucination gate and the accented-English probes |

Artifacts (transcripts, references, packets, logs) are on
`/Volumes/SSDAStorage/un-en-bakeoff/` — deliberately off the internal disk, which
was at 95% capacity.

## Two production fixes this turned up

1. **`lib/providers/azure-llm-speech.ts` never sets `profanityFilterMode`.** The
   service default is `Masked`, and it is destroying UN entity names — "SCAD"
   (Security Council Affairs Division) is heard as "SCAT", which is on Microsoft's
   profanity list, and comes back as `****`. `Removed` is worse (silent deletion);
   use `None` or `Tags`.
2. **`maxSpeakers: 20`** where the documented ceiling is **35**.

## Two eval fixes that should reach `main`

1. `eval/metrics/ground-truth-normalizer.ts` — `[^:]*` → `[^:\n]*` in all six
   languages. It was deleting **15.7%** of the corpus's reference words as
   "non-spoken". Now guarded by a test proven to fail against the old regex.
2. `eval/metrics/wer.ts` — `chunkedEditDistance` is not WER on inputs over 3,000
   words, which is 14 of 21 English sessions. And `eval/analysis/paired-wer.ts`'s
   bootstrap LCG has period 10,466 while drawing 180,000 values.

Until both land, every future eval inherits a ~16-point error and invalid CIs.
