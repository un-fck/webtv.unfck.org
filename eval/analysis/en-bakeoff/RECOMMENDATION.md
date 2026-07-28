# Recommendation

> **VERDICT — KEEP ENGLISH ON ASSEMBLYAI, AND TURN ON `keyterms_prompt`. Solve the
> payment problem institutionally, not by switching engine.**
>
> One experiment decided this. AssemblyAI's keyterm biasing takes "UN80" — the
> error class §15.5a called *"the single most decision-relevant thing"* — from
> **10 correct / 25 mangled to 61 correct / 2 mangled** on a 171-minute meeting,
> with no false positives. Azure renders it correctly **6** times and mangles it
> into a real-but-wrong UN body **33** times, and has **no working mechanism to
> fix it**: `phraseList` is accepted-and-ignored, the documented `prompt`
> substitute returns `400`.
>
> Azure is genuinely the better raw engine — +0.98 WER, winning 17 of 17 sessions.
> But that is a diffuse 3% relative gain, and it is bought at the cost of ~50
> wrong UN institution names per long meeting that **cannot be corrected at
> source**. In a UN record the institution being discussed *is* the content.
>
> Cost: **~$1,436/yr**. That is a funding problem with a funding solution, not a
> reason to accept a materially worse record.

### I changed my mind twice. Here is the audit trail.

Recording it because the reversals were caused by errors worth knowing about.

| draft | said | why it changed |
| --- | --- | --- |
| 1st | procure AssemblyAI | rested on a reliability figure whose denominator was inflated ~7× (polling ticks counted as attempts) and a cost projection that read archive backfill as growth |
| 2nd | **move to Azure** | with those corrected, Azure won accuracy and solved the payment problem with zero procurement — the evidence genuinely pointed there |
| **final** | **keep AssemblyAI + `keyterms_prompt`** | the entity-biasing capability had never been *tested*. It works, decisively, and it is available on exactly one vendor. That was the missing variable in draft 2. |

## The measurement that decided it

Full 171-minute clip, "UN80" spoken ~56 times:

| arm | UN80 correct | → a **real** UN body (UNAT/UNAIDS) | → non-existent |
| --- | ---: | ---: | ---: |
| AssemblyAI, baseline | 10 | 22 | 3 |
| **AssemblyAI + `keyterms_prompt`** | **61** | **0** | 2 |
| AssemblyAI + `custom_spelling` | 25 | 7 | 2 |
| AssemblyAI + `word_boost` | 11 | 21 | 3 |
| **azure-llm-speech** | **6** | **33** | 16 |
| azure + `phraseList` | *no effect — accepted and ignored* | | |
| azure + `prompt` | *HTTP 400 — schema rejection* | | |

**False-positive control:** all 61 renderings are legitimate in context —
`UN80 initiative` ×32, `UN80 reform` ×5, `UN80 process` ×4, `UN80 steering`,
`UN80 task force`. The biasing is not hallucinating the term into places it does
not belong.

§15.5a's original numbers were AssemblyAI 11 correct, Azure 6. Mine, 15 days
later: 10 and 6. This is a stable property of the models, not noise.

## Everything else, measured

| | AssemblyAI | azure-llm-speech |
| --- | --- | --- |
| WER, byte-identical input (n=17) | 27.55% | **26.74%** (better by 0.81 micro / 0.64 macro, CI [+0.27,+1.09]) |
| WER vs production as configured | 27.72% | **26.74%** (better by 0.98, wins **17/17**) |
| **UN80 entity rendering** | **61 correct / 2 mangled** *(with keyterms)* | 6 / 49 — **unfixable** |
| errors shared with the other arm | — | **86% co-located, 78% identical token** |
| hallucination gate (§14.2, Kanem) | **PASS** (0) | **PASS** (0) |
| diarization, 171-min meetings | **1 and 2 speakers — fails** | 28 and 30 — fine |
| diarization, ≤2h33m (n=12) | fine — 19 spk / 70 turns | fine |
| vendor-attributable failures | **0.284%** (n=704) | 6.8% (n=44, all day one) |
| raw failure rate, matched window | 6.77% | 6.82% — tied |
| this run | 59/59 ok | 59/59 ok |
| cost / audio-hour | **$0.21** | $0.306 |
| cost / yr at organic run-rate | **$1,436** | $2,093 |
| speed | **93× RT** (138× on mono) | 66× |
| latency consistency (repeat CV) | 15.2% | **5.4%** |
| determinism (identical request twice) | differs | **byte-identical** |
| model identity | **named, pinnable** | unnamed, unpinnable |
| content filter | none | **profanity mask destroys UN names by default** |
| accented English (§14.4) | appalling ✓, Starobelsk 13 ✓ | — |

## Why the entity result outweighs the WER result

They are not commensurable, and WER treats them as if they were.

- The WER gap is **0.98 points on a 27% base** — a 3% relative improvement,
  spread thinly across function words and ordinary mishearings.
- The entity gap is **~50 occurrences per long meeting** where a reader is told
  the *UN Appeals Tribunal* was discussed when the *UN80 reform initiative* was.
  That is 0.2% of tokens — **invisible to WER**, which is exactly why §14/§15
  reached the opposite conclusion.

A diplomat searching the archive for "UN80" finds 61 hits in one transcript and
6 in the other. That is the product.

## The payment problem — solve it, don't trade quality for it

The strongest operational finding stands: **15 production transcriptions failed
in July because the personal card ran out**, more than either vendor caused. But:

- the organic run-rate is **~6,840 h/yr → ~$1,436/yr**, growing **3.7%/month**
  (July looked like doubling only because **46%** of it was archive backfill);
- switching to Azure would move that bill to the UN **and cost ~$657/yr more**,
  while giving up the entity fix;
- AssemblyAI is **pay-as-you-go, no minimum, no commitment** — there is nothing
  to be locked into, which directly addresses the "don't want to lock in" worry.
  The lock-in risk is a property of *procurement processes*, not this vendor.

**If institutional funding genuinely cannot be arranged**, Azure is a defensible
fallback — it is the better raw engine and it is already invoiced — but the
decision should be recorded as *accepting a worse UN-entity record to solve a
funding problem*, not as a quality choice.

## Do these regardless

1. **Turn on `keyterms_prompt`** in `lib/providers/assemblyai.ts`, seeded from a
   UN roster (current officeholders, body acronyms, initiative names, document
   symbols). Measured: **+51 correct entity renderings, −23 wrong-institution
   renderings on one meeting.** Highest-value change in this report.
2. **Feed mono audio.** −0.27 WER points *and* 93× → 138× realtime. Free.
3. **Detect degenerate diarization at the pipeline boundary.** AssemblyAI returned
   1 speaker across 22,784 words of a 171-minute meeting, verified at the API
   level. One speaker on >10 minutes of audio is always wrong; nothing notices
   today. Re-run or fall back when it fires.
4. **Set `profanityFilterMode`** in `lib/providers/azure-llm-speech.ts` — the
   default is destroying UN entity names **in production right now on fr/es/ar/ru**
   (`SCAD` → `****`). `Removed` is worse. This is unrelated to the English
   decision and should ship immediately.
5. **`maxSpeakers: 35`**, not 20.
6. **Schedule `regression-azure-llm.ts`** — Azure still serves four languages on an
   unpinnable model, and the guard has never run on a schedule.
7. **Land the scorer fixes on `main`** (`[^:\n]` normalizer, chunked-WER
   replacement, bootstrap RNG) or every future eval inherits a 16-point error.
8. **Build the entity glossary / symbol validator anyway.** 86% of errors are
   shared between vendors; only an external check touches those. One reading
   agent: it removes 8 of 15 reader-harming errors in its session, on both arms.

## What would change this again

- **Azure shipping working entity biasing.** It would erase the deciding
  argument. Watch `enhancedMode.phraseList` (ignored today) and `prompt` (400).
- **`keyterms_prompt` not generalising** beyond UN80 — it was tested on one term
  set, on one meeting. Re-test on a full roster across several meetings before
  relying on it in production.
- **AssemblyAI's diarization collapse spreading** beyond long GA-style debates.
- **Volume past ~15,000 h/yr**, where the cost delta stops being trivial.
