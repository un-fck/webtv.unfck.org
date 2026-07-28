# Recommendation

> **VERDICT — MOVE ENGLISH TO `azure-llm-speech`, after four cheap fixes.**
> It is the more accurate engine on the only pre-registered endpoint (+0.81 micro
> WER on byte-identical audio, +0.98 against production as configured, winning
> **17 of 17** sessions), and it is the only option that removes the personal-card
> failure mode from **90% of production audio with no procurement at all** — the
> resource is already on the UN's invoice and already serves four languages. The
> vendor cost delta is **~$657/yr**. Required first: set `profanityFilterMode`,
> raise `maxSpeakers` to 35, schedule the drift regression, and clear the §14.2
> hallucination gate.
>
> **This reverses my own first draft.** That draft recommended procuring
> AssemblyAI, resting on a reliability number whose denominator was inflated ~7×
> by counting polling ticks, and a cost projection that counted archive backfill
> as growth. Both are corrected below.

## What changed under adversarial review

| my first draft | corrected | how |
| --- | --- | --- |
| AssemblyAI 0.046% failures, n=8,662 | **0.284%, n=704** — and *raw* rates are tied (6.77% vs 6.82%) | 7,153 of those rows were `transcribe_poll` ticks from an old logging pattern, not attempts |
| "$1,500–3,000/yr **and doubling**" | **~$1,436/yr**, growing 3.7%/month | 46% of July's processing was backfill of meetings back to June 2025; organic went 549 h → 570 h |
| cost delta $674–1,350/yr | **~$657/yr** | follows from the above |
| "no quality case for switching" | **the quality case is real** | the WER pillar held; only 1 of 3 §14/§15 pillars actually reversed |

## The evidence, corrected

| | AssemblyAI U-3.5 Pro | azure-llm-speech |
| --- | --- | --- |
| **WER, byte-identical input (n=17)** | 27.55% | **26.74%** — better by 0.81 micro / 0.64 macro, CI [+0.27,+1.09], wins 15/17 |
| **WER vs production as configured** | 27.72% | **26.74%** — better by 0.98, wins **17/17**, sign test p≈8e-6 |
| errors shared with the other arm | — | **86% co-located, 78% the identical wrong token** |
| arm-unique errors | 2,607 | 1,734 — a **1.5 : 1** residue against the incumbent |
| vendor-attributable failures | **0.284%** (n=704) | 6.8% (n=44, all on day one) |
| raw production failure rate, matched window | 6.77% | 6.82% — **tied** |
| cost / audio-hour | **$0.21** | $0.306 |
| cost / year at organic run-rate | **$1,436** *(personal card)* | $2,093 *(UN invoice)* |
| speed, production config | 93× realtime | 66× — but mono input makes AssemblyAI 138× |
| diarization, 60–120 min | 14 spk / 42 turns | 15 spk / 34 turns — equivalent |
| entity slots correct | 4/11 | 3/11 — **not significant** (Fisher p=1.0) |
| acronym recall | 69% | 66% — small; the script itself warns the absolute rate is not meaningful |
| entity biasing | `keyterms_prompt`, `word_boost`, `custom_spelling` — **but untested** | **none that work** |
| model identity | named, versioned | **unnamed, unpinnable** |
| content filter | none | **profanity mask destroys UN entity names by default** |
| serving region | **not measured** | North Europe, in-region |

## Why the conclusion flips

**1. Accuracy is the best-instrumented axis, and Azure wins it.** It is the only
pre-registered endpoint, measured on the whole corpus with a scorer that passes
22 of 22 negative controls. Every other axis is n=11, n=44, or an unaudited
denominator. Azure wins 17 of 17 sessions against production as it stands.

**2. The funding fix points at Azure, not away from it.** The 15 balance-negative
failures are the strongest finding in this exercise. English is **89.7% of
production audio**. `AZURE_SPEECH_ENDPOINT` already points at
`foundry-transcripts-notheurope` — the exact resource on the UN's `EOSG-DEV`
invoice, serving fr/es/ar/ru in production since 2026-07-14. Moving English is a
one-line change to `STT_ROUTING`. The personal card then disappears from 90% of
the workload **today, with no procurement action**. Procuring AssemblyAI requires
an institutional process that has not started *and* leaves Speechmatics and
Alibaba on the same card.

**3. The cost objection is ~$657/yr.** Less than the staff time of the
procurement it would fund, and it moves the burden from an individual to an
institution — which is the entire point of the exercise.

**4. The governance objections are already accepted in production.** "Unnamed and
unpinnable" and "the profanity mask destroys UN body names" are true, and are the
conditions under which **four of the six official languages** have been served
since 2026-07-14, with no proposal to change them. If they disqualify English
they disqualify French, and the honest recommendation would then be to move
fr/es/ar/ru *off* Azure — a much larger claim this evidence does not support.

## The case against, stated fairly

- **Entity biasing exists on exactly one vendor.** `keyterms_prompt` /
  `word_boost` / `custom_spelling` work on AssemblyAI; on Azure `phraseList` is
  accepted-and-ignored and the documented `prompt` substitute returns `400`. This
  is the only *structural* fix for the entity weakness both vendors share. But it
  is **untested** — nobody has shown it fixes the UN80 class. **Testing it is the
  highest-value hour left in this exercise**, and if it works decisively this
  recommendation should be revisited.
- **Reliability still favours the incumbent** on vendor-attributable failures
  (0.284% vs 6.8%), though on n=753 vs n=44 and with raw rates tied.
- **Azure's failure mode at entity slots is a non-word; AssemblyAI's is a
  plausible wrong institution** — 3 cases vs 1 across ten meetings. Directional,
  not significant, and it is the one axis where the incumbent's errors are more
  dangerous rather than merely more numerous.
- **Migration is not free**, though it is small: one line in `STT_ROUTING` plus
  the four fixes below.

## Required before the switch

1. **`profanityFilterMode: "None"` or `"Tags"`** in `lib/providers/azure-llm-speech.ts`.
   The default is destroying UN entity names *right now, in production, on four
   languages*. **Fix this regardless of the English decision.**
2. **`maxSpeakers: 35`** — production caps itself at 20 for no reason.
3. **Schedule `regression-azure-llm.ts`.** The model is unpinnable; drift can only
   be detected, and the guard has never run on a schedule.
4. **Clear the §14.2 hallucination gate** — pre-registered as binary and
   non-negotiable. *The verdict above is conditional on it.*

## Worth more than the vendor choice

**86% of the errors are shared**, so no swap touches them. The highest-value work
is external to both vendors:

1. **A UN entity glossary + document-symbol/resolution-number validator.** One
   reading agent's estimate: removes **8 of 15** reader-harming errors in its
   session, *on both arms*. Every symbol has a checkable form; every officeholder
   is on a published roster.
2. **Feed whichever vendor mono audio** — worth −0.27 WER points and a third of
   the latency on AssemblyAI, free.
3. **Land the scorer fixes on `main`** (`[^:\n]` and the chunked-WER
   replacement), or every future eval inherits a 16-point error and CIs from a
   degenerate RNG.

## What would reverse this again

- **AssemblyAI's keyterm biasing demonstrably fixing the UN80 class.** One hour of
  work; the strongest remaining argument for the incumbent.
- **A Kanem-class failure by Azure** on the hallucination gate — disqualifying on
  its own pre-registered terms.
- **Azure model drift.** Unpinnable means this validation has a shelf life.
- **Evidence that UN procurement of AssemblyAI is genuinely cheap.** "Pay-as-you-go
  avoids lock-in" is true of the *vendor*; nobody has checked what the
  *institution* requires. And AssemblyAI's processing region was never measured —
  for a UN record that matters, and it is a real gap in this report.
