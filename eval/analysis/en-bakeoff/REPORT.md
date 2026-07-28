# AssemblyAI Universal-3.5 Pro vs `azure-llm-speech` — the English track

**Run date:** 2026-07-28. **Scope:** English only. **Corpus:** 17 UN meetings with
matched PV ground truth, 15.2 h of audio, plus 4 diagnostic sessions.

> **Read §0 first.** The measurement instrument that produced the existing
> recommendation was defective, so several numbers in `SYNTHESIS.md` §14–§15
> should not be relied on. That is the most important thing on this page.

---

## 0. Three corrections to the existing record

### 0.1 Azure is not free, and it is not cheaper — it is 1.46× the price

`SYNTHESIS.md` §14.5 records `azure-llm-speech` as *"~gpt-4o class … **~$0 marginal**
… already procured"* and AssemblyAI at $0.23/h. Both are wrong.

| | source of the number | rate per audio-hour |
| --- | --- | ---: |
| Azure LLM Speech — list | Azure Retail Prices API, `Azure Speech`, northeurope | $0.36 |
| Azure LLM Speech — **what we are actually billed** | Cost Management, subscription `EOSG-DEV` | **$0.306** |
| AssemblyAI Universal-3.5 Pro | assemblyai.com/pricing | **$0.21** |

The effective rate is derived from our own invoice, not a price list:

```
Fast Transcription Speech To Text   227.914444 h   $69.741820   -> $0.30600/h
S1 Speech Translation                 0.680278 h   $ 1.448992   -> $2.13000/h
```

Both meters land at exactly **0.85× list** — a uniform 15% agreement discount.
Two independent meters agreeing to four decimal places is what makes this a
measurement rather than an inference.

**Consequences.** "Already procured" means *the bill moves from a personal credit
card to the UN's Azure subscription* — which may well be the decisive benefit —
but it is **not** a saving. On the 1,811 h English backlog: AssemblyAI $380,
Azure $554. Azure costs **$174 more** on the backlog and ~1.46× more per hour
thereafter. $69.74 of Azure Speech has already been spent on eval sweeps.

Billing is per **second of audio**, rounded up, and is exposed per request in the
`csp-billing-usage` response header — so it is exactly predictable in advance and
uses the same unit as AssemblyAI's.

### 0.2 The scorer that produced the §14/§15 verdict was broken, in two ways

Both were found by adversarial audit, both reproduce, both are fixed here.

**(a) The ground-truth normalizer was deleting real speech.** The speaker-label
patterns used `[^:]*`, which matches newlines. PV text is PDF-hard-wrapped, so
lines routinely *begin* mid-sentence with `Mrs. Izumi Nakamitsu,` — and the match
then ran to the next colon anywhere in the document. This is the same bug class
as §14.0, sitting in the block whose comment says it was fixed.

| | corpus words deleted as "non-spoken" | worst single session |
| --- | ---: | ---: |
| before | **15.73%** | 28.2% (S/PV.9718) |
| after `[^:\n]*` | **1.62%** | 12.7% (S/PV.10100) |

Every deleted word was being charged to providers as a phantom insertion. After
the fix, kept words-per-minute is uniformly plausible (100–130) on every session
except the two independently known to be broken.

**(b) `wer.ts` does not compute WER on long inputs.** `chunkedEditDistance` cuts
reference and hypothesis into *proportional index slices* above 3,000 words — 14
of 21 English references — and sums per-chunk distances. Uniformly scattered
errors score correctly; **localized** errors are inflated enormously:

| control on a 16.6k-word session | true | shipped scorer |
| --- | ---: | ---: |
| uniform random deletion of 30% | 30.0% | 30.5% ✅ |
| **contiguous deletion of 30%** | **30.0%** | **80.2%** ❌ |
| **first 10% missing** | **10.0%** | **57.1%** ❌ |
| **200 words prepended** | **1.20%** | **7.29%** ❌ |

This is not neutral between the two arms: AssemblyAI's documented defect is
whole-block behaviour on long files, Azure's is scattered substitution. The
scorer amplifies one and not the other, by far more than the 1.3-point effect
that decided §14/§15.

Replaced for this run by a full-alignment scorer (Python + rapidfuzz),
deliberately a **different implementation in a different language** so that
"scored twice" means two instruments rather than two agents running one.

**The negative controls are the point.** 22 controls including the contiguous and
prepend cases the previous design lacked. New scorer **22/22 pass**; shipped
scorer **fails 5 of 16**, every failure on the long session and every one in the
localized-damage class.

**(c) Bonus: the bootstrap RNG is degenerate.** `paired-wer.ts` uses an LCG whose
period is **10,466** while `bootstrapCI` draws 10,000 × n = 180,000 values — it
cycles ~17 times, over 15,824 distinct values, with non-uniform resampling
(max/min bucket ratio 1.24). Every CI in §14.1 and §15.1 is computed off a
degenerate empirical distribution. Reproducible, and wrong.

### 0.3 The drift guard had never been run

§15.6 built `regression-azure-llm.ts` precisely because the default enhanced-mode
model is unnamed and unpinnable, and told us to schedule it. `grep` over
`docker/crontab.template`, `.github/` and `package.json` finds no scheduled
invocation, and the committed baseline was captured 2026-07-14 — 14 days before
this run.

**Run today: 0.2% drift. No model swap.** So this comparison is against the same
model §14/§15 measured. But that was luck, not process: had Microsoft swapped the
model, every number in §14/§15 would have described something that no longer
exists and nothing would have noticed.

---

## 1. What `azure-llm-speech` actually is (measured, not read)

- **Unnamed and unpinnable.** `enhancedMode.model` accepts only
  `mai-transcribe-1.5` / `mai-transcribe-1`; `"default"`, `"latest"`,
  `"speech-llm"` are all rejected — *"Requested MAI transcription model 'X' is
  not supported."* There is no version identifier anywhere in the response.
- **Only two api-versions answer**: `2025-10-15` and `2024-11-15`. Both 200; the
  preview-looking versions 404. And the two live versions **do not agree** — on
  the same 81 s file they returned 8 and 9 phrases respectively, identical text.
  So pinning the api-version pins the contract, not the weights.
- **GA, not preview** (Build 2026, 2026-06-04) — so it *is* covered by Azure's
  99.9% SLA. Our notes implied otherwise; this is a point in Azure's favour.
- The model was swapped once ("renewed speech-LLM model", Build 2026) — that was
  **announced**, but shipped with no api-version change and no version string, so
  it was silent *to the API*. The governance risk is real; "silent" was imprecise.
- **`confidence` is `0` on every phrase.** Confirmed on live output. No
  per-segment quality signal exists, permanently and by design.
- **`maxSpeakers` caps at 35**, not 20 — production is capping itself below the
  ceiling on large open debates for no reason. One-line fix.
- **Region**: `x-ms-region: North Europe`, matching the resource. No evidence of
  out-of-region processing.
- Our resource is kind **AIServices** (Foundry), which is the likely reason
  enhanced mode answers only on the `services.ai.azure.com` hostname while
  Microsoft's docs show `cognitiveservices.azure.com`. Our note is right for our
  resource kind; it is not a universal vendor fact.

### The entity-biasing blocker is confirmed, and worse than documented

§15.5a's "UN80" → "the UNAT initiative" defect would be fixed by keyterm biasing.
There is none available:

| attempt | result |
| --- | --- |
| `enhancedMode.phraseList` | HTTP 200, output **byte-identical** to no phrase list — accepted and ignored |
| top-level `phraseList` | **HTTP 400** `"Definition": ["Invalid JSON format."]` |
| `enhancedMode.prompt` (Microsoft's *documented* substitute) | **HTTP 400** `"Definition": ["Invalid JSON format."]` |

Microsoft's own recommended workaround for the missing phrase list on enhanced
mode is the `prompt` field, and the live API at `2025-10-15` rejects it as a
schema violation. **There is currently no working way to tell this model that
"UN80" is a word.** AssemblyAI exposes `keyterms_prompt`, `word_boost`,
`boost_param` and `custom_spelling` as first-class fields.

---

## 2. Reliability — from production, not from this eval

An eval of ~50 attempts per arm with zero failures bounds the failure rate at
~6.6%; the prior anecdote was 2/26 ≈ 7.7%. It cannot tell those apart. So
reliability is taken from `webtv.processing_usage_events`, which has a real
denominator — and failures are classified, because Kaltura 404s and our own
over-length submissions are not vendor failures.

| vendor | attempts | all failures | **vendor-attributable** | rate | 95% Wilson |
| --- | ---: | ---: | ---: | ---: | --- |
| assemblyai | 8,711 | 53 | **4** | **0.046%** | [0.018%, 0.119%] |
| azure-speech¹ | 44 | 3 | **3** | **6.818%** | [2.346%, 18.225%] |

¹ `azure-speech` is the vendor token `azure-llm-speech` logs under; it entered
production 2026-07-14 for fr/es/ar/ru, so every row is the challenger.

The intervals do not overlap. But read Azure's honestly: **n = 44, and all three
failures landed on its first production day** (2026-07-14, "connection
terminated"), with 33 consecutive successes since. That is "unproven, with a bad
first day", not "6.8% forever". What can be said is that AssemblyAI has a
0.046% record over 8,662 attempts and Azure has nothing comparable.

### The out-of-pocket arrangement has already cost transcripts

Of AssemblyAI's 53 production failures:

| cause | n | period |
| --- | ---: | --- |
| Kaltura download failed (upstream, vendor-agnostic) | 26 | Jun 01 – Jul 17 |
| **prepaid account balance went negative** | **15** | **Jul 13 – Jul 21** |
| audio longer than the plan allows (our limit) | 8 | Jul 08 – Jul 22 |
| connection terminated (vendor) | 4 | Feb 13 – Jun 05 |

**15 production transcriptions failed because the personal card funding the
account ran out.** That is not a vendor-quality problem, it is a
funding-arrangement problem — and it is the strongest concrete argument in this
whole document for changing *something*, whether that is procuring AssemblyAI
properly or moving the workload to the Azure subscription.

---

*(Sections 3–7 — accuracy, speed, diarization, the three-way qualitative diff,
and the recommendation — follow once the full run completes.)*
