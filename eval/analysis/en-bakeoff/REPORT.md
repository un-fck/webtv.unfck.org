# AssemblyAI Universal-3.5 Pro vs `azure-llm-speech` — the English track

**Run:** 2026-07-28. **Scope:** English only. **Corpus:** 17 UN meetings with matched
PV ground truth (15.2 h), 4 diagnostic sessions, 3 battery clips.
**Arms:** 4 — both vendors on matched audio, plus codec controls.

---

## The short version

Of the three pillars that supported "move English to `azure-llm-speech`" in
`SYNTHESIS.md` §14–§15, **one shrank, one inverted, and one did not reproduce.**

| §14/§15 said | this run finds |
| --- | --- |
| azure-llm better by 1.0–1.3 WER points (macro) | **confirmed, similar magnitude**: 0.88 macro on production configs, 0.64 once AssemblyAI gets the same mono audio. The *absolute* level was badly wrong though — 27% not 43.5% |
| azure-llm is "~$0 marginal, already procured" | azure-llm costs **$0.306/audio-hour** against AssemblyAI's **$0.21** — it is **1.46× dearer**, verified against our own invoice |
| the incumbent stops diarizing on long meetings | **does not reproduce** — 0 of 10 sessions degenerate, both arms; 14 vs 15 speakers on 60–120 min |

And the measurement instrument that produced those conclusions was defective in
two independent ways (§2 below).

**None of this makes AssemblyAI the answer either.** The strongest finding in the
whole exercise is not about transcription quality: **the out-of-pocket
arrangement is itself the least reliable component in the pipeline.** It caused
15 production failures in July, more than either vendor did, and the personal
burden is ~$1,500–3,000/yr and roughly doubling.

---

## 1. Cost — the §14.5 procurement math was wrong

| | source | rate / audio-hour |
| --- | --- | ---: |
| Azure LLM Speech, list | Azure Retail Prices API, northeurope | $0.36 |
| Azure LLM Speech, **our actual rate** | Cost Management, subscription `EOSG-DEV` | **$0.306** |
| AssemblyAI Universal-3.5 Pro | assemblyai.com/pricing | **$0.21** |

Derived from the invoice, not a price list:

```
Fast Transcription Speech To Text   227.914444 h   $69.741820  ->  $0.30600/h
S1 Speech Translation                 0.680278 h   $ 1.448992  ->  $2.13000/h
```

Both meters land at exactly **0.85 × list** — a uniform 15% agreement discount.
Two independent meters agreeing to four decimals is what makes this a
measurement. Billing is per **second of audio**, rounded up, and is returned in
the `csp-billing-usage` response header, so it is exactly predictable.

**What it costs at the real run-rate.** AssemblyAI serves English only in
production, so its usage table *is* the English volume:

| | h/yr | AssemblyAI | azure-llm | difference |
| --- | ---: | ---: | ---: | ---: |
| June rate | 7,016 | **$1,473** | $2,147 | +$674 |
| July rate (projected) | 14,064 | **$2,953** | $4,304 | +$1,350 |

*(July may include backfill as well as new meetings, so treat the upper figure as
an upper bound on the organic rate.)*

"Already procured" therefore means **the bill moves from a personal card to the
UN's Azure subscription** — which may well be the decisive benefit — but it is
**not** a saving. It is ~1.46× the cost, paid by someone else.

## 2. The instrument was broken — read this before trusting any §14/§15 number

Found by adversarial audit; both reproduce; both fixed here.

**(a) The ground-truth normalizer was deleting real speech.** Speaker-label
patterns used `[^:]*`, which matches newlines. PV text is PDF-hard-wrapped, so
lines routinely begin mid-sentence with `Mrs. Izumi Nakamitsu,` and the match ran
to the next colon anywhere in the document — the same bug class as §14.0, in the
block whose comment says it was fixed.

| | corpus words deleted as "non-spoken" | worst session |
| --- | ---: | ---: |
| before | **15.73%** | 28.2% |
| after `[^:\n]*` | **1.62%** | 12.7% |

Every deleted word was charged to providers as a phantom insertion. After the
fix, kept words-per-minute is plausible (100–130) on every session except the two
independently known to be broken.

**(b) `wer.ts` does not compute WER on long inputs.** `chunkedEditDistance` cuts
both texts into *proportional index slices* above 3,000 words — 14 of 21
sessions — and sums per-chunk distances. Scattered errors score correctly;
localized errors are inflated enormously:

| control, 16.6k-word session | true | shipped scorer |
| --- | ---: | ---: |
| uniform random deletion of 30% | 30.0% | 30.5% ✅ |
| **contiguous deletion of 30%** | **30.0%** | **80.2%** ❌ |
| **first 10% missing** | **10.0%** | **57.1%** ❌ |
| **200 words prepended** | **1.20%** | **7.29%** ❌ |

This is not neutral between the arms — AssemblyAI's alleged defect was whole-block
behaviour, Azure's is scattered substitution.

Replaced with a full-alignment scorer (Python + rapidfuzz), deliberately a
**different implementation in a different language** so "scored twice" means two
instruments. **22 negative controls, 22 pass; the shipped scorer fails 5 of 16**,
every failure on the long session and in the localized-damage class.

**(c) The bootstrap RNG is degenerate.** `paired-wer.ts` uses an LCG of period
**10,466** while drawing 180,000 values — it cycles ~17× over 15,824 distinct
values with non-uniform resampling. Every CI in §14.1/§15.1 is computed off a
degenerate distribution: reproducible, and wrong.

**(d) The drift guard had never been run.** §15.6 built it precisely because the
model is unpinnable, and nothing schedules it. Run today: **0.2% drift, no model
swap** — so this comparison is against the same model §14/§15 measured. That was
luck, not process.

## 3. Accuracy

Pre-registered primary endpoint: **A0 vs A2** — the only comparison where both
arms receive the **byte-identical** file (verified by sha256 on every run).

**n = 17 sessions**, all four arms complete.

| arm | micro WER | 95% CI | macro WER |
| --- | ---: | --- | ---: |
| A0 AssemblyAI @ 64k mono mp3 | 27.55% | [25.80, 29.78] | 28.42% |
| A1 AssemblyAI @ original AAC *(production today)* | 27.72% | [25.88, 30.06] | 28.66% |
| **A2 azure-llm @ 64k mono mp3** | **26.74%** | [25.22, 28.77] | 27.77% |
| A3 azure-llm @ 128k mono mp3 | 26.72% | [25.16, 28.77] | 27.80% |

| comparison | Δ micro | Δ macro | 95% CI (macro) | wins | verdict |
| --- | ---: | ---: | --- | ---: | --- |
| **A0 vs A2 — PRIMARY** | **+0.81** | **+0.64** | [+0.27, +1.09] | 2/17 | **azure-llm better** |
| A1 vs A2 (production as it stands) | +0.98 | +0.88 | [+0.54, +1.30] | 0/17 | azure-llm better |
| A2 vs A3 | +0.02 | −0.03 | [−0.22, +0.16] | 9/17 | tied |

**Comparability with §14/§15, stated carefully.** Those sections reported a
*macro* delta of −1.0 (§14.1) and −1.3 (§15.1). The like-for-like figure here is
**−0.88 macro** on the same production configs — so the direction and rough
magnitude of §14.1 **are confirmed**, and §15.1's 1.3 was somewhat larger than
reproduces. About 0.24 of the gap is the codec asymmetry (below). What was badly
wrong was not the delta but the **absolute level**: 27–28% here against §14's
43.5%, a 16-point difference that is entirely the scorer and normalizer fixes.

Micro-average is the headline: the corpus spans 92 → 17,700 reference words, and
an unweighted session mean would give a 92-word procedural clip the same vote as
a 2h33m debate.

**The codec confound resolved, and it ran the opposite way to my assumption.**
Azure 64k vs 128k is equivalent (Δ −0.05, CI inside the pre-registered ±0.5
margin) — the transcode costs Azure nothing. But AssemblyAI is *significantly
better* on the 64 kbps **mono** MP3 than on its own original 190 kbps stereo AAC
(Δ −0.27, CI [−0.46, −0.11]). §14/§15 handicapped the **incumbent**. Feeding
AssemblyAI mono audio is a free improvement worth about a third of the gap.

**Absolute WER is ~27%, not §14's 43.5%.** The 16-point drop is the scorer and
normalizer fixes, not a change in either provider.

## 4. Speed — measured for the first time

§14/§15 contain no latency number at all.

| arm | median RTF | basis |
| --- | ---: | --- |
| AssemblyAI | **101× realtime** | job leg, *directly observed* |
| azure-llm | **67× realtime** | upload removed via a paired estimator |

Azure's upload sits inside a single synchronous POST and cannot be timed
directly. The pooled regression disagreed with itself across vendors (23.9 vs
71.1 Mbit/s on the same uplink), so instead the **64k↔128k pair** — same audio,
2× the bytes — isolates the upload slope with duration held exactly constant:
**0.163 s/MB (49 Mbit/s)**, median over 15 sessions.

**AssemblyAI is ~1.5× faster, and it does not matter.** On a two-hour meeting
that is ~48 s versus ~73 s. Both are far faster than realtime, both scale
linearly, neither degrades on long files.

## 5. Reliability — from production, not from this eval

54 eval attempts with zero failures bounds the rate at ~6.6% and cannot
distinguish "fine" from the 2-in-26 the §15 sweep saw. Production has a real
denominator, and failures are classified because Kaltura 404s are not vendor
failures.

| vendor | attempts | all failures | **vendor-attributable** | rate | 95% Wilson |
| --- | ---: | ---: | ---: | ---: | --- |
| assemblyai | 8,711 | 53 | **4** | **0.046%** | [0.018%, 0.119%] |
| azure-speech¹ | 44 | 3 | **3** | **6.818%** | [2.346%, 18.225%] |

¹ the vendor token `azure-llm-speech` logs under; in production for fr/es/ar/ru
since 2026-07-14, so every row is the challenger.

The intervals do not overlap — but read Azure's honestly: **n = 44, and all three
failures landed on its first production day**, with 33 consecutive successes
since. That is "unproven, with a bad first day", not "6.8% forever".

### The most reliable finding in this report is about the payer

AssemblyAI's 53 production failures, by cause:

| cause | n | period |
| --- | ---: | --- |
| Kaltura download failed (upstream, vendor-agnostic) | 26 | Jun 01 – Jul 17 |
| **prepaid account balance went negative** | **15** | **Jul 13 – Jul 21** |
| audio longer than the plan allows (our limit) | 8 | Jul 08 – Jul 22 |
| connection terminated (vendor) | 4 | Feb 13 – Jun 05 |

**The funding arrangement caused more production failures than either vendor.**

## 6. What `azure-llm-speech` is, measured

- **Unnamed and unpinnable.** `enhancedMode.model` accepts only
  `mai-transcribe-1.5`/`-1`; `"default"`, `"latest"`, `"speech-llm"` are rejected.
  No version identifier anywhere in the response.
- **Only two api-versions answer** (`2025-10-15`, `2024-11-15`) and they
  **disagree** — 8 vs 9 phrases on the same 81 s file, identical text. Pinning the
  api-version pins the contract, not the weights.
- **GA since Build 2026**, therefore *inside* Azure's 99.9% SLA. Our notes implied
  preview; this is a point in Azure's favour.
- `confidence` is **0** on every phrase — no per-segment quality signal, by design.
- `maxSpeakers` caps at **35**; production sends 20, capping itself for no reason.
- Region `North Europe`, matching the resource. No out-of-region processing.

**Entity biasing — the fix for the known entity weakness — does not exist here:**

| attempt | result |
| --- | --- |
| `enhancedMode.phraseList` | HTTP 200, output **byte-identical** — accepted and ignored |
| top-level `phraseList` | **400** `"Invalid JSON format."` |
| `enhancedMode.prompt` — Microsoft's *documented* substitute | **400** `"Invalid JSON format."` |

AssemblyAI exposes `keyterms_prompt`, `word_boost`, `boost_param`,
`custom_spelling` as first-class fields.

**A live production bug found by the qualitative read.** Azure mishears **SCAD**
(Security Council Affairs Division) as **"SCAT"**, which is on Microsoft's
profanity list, and the service's **default** filter is `Masked`. Our provider
never sets the option, so real output reads *"I would like to thank the \*\*\*\*
for the contributions they made."* Two occurrences in nine sessions,
deterministic. `Removed` is **worse** (silent deletion); `None` or `Tags` fixes
it. One line.

## 7. The three-way qualitative comparison

Ten meetings read end to end by independent agents — PV, AssemblyAI, Azure — every
difference enumerated, with a conservation check against the PV word count. Then
an adversarial agent tried to refute the result, and **materially corrected it**.

**What a total census shows** (every substitution, not the highlighted ones):

| | AssemblyAI | azure-llm |
| --- | ---: | ---: |
| substitutions vs PV (hand census, 6 meetings) | 101 | 104 |
| identical substitution in BOTH arms | 71 (70%) | 71 (68%) |
| visible garble / non-words | 6 | 7 |
| entity slots correct | 4/11 | 3/11 |

The hand census was then **measured in code over the whole corpus** (73,251
reference words, 15 sessions, all three error types rather than substitutions
only — insertions matter because that is where fabrications live):

| error overlap, A1 vs A2 | share |
| --- | ---: |
| substitutions + deletions at the same reference position | **89.2%** |
| insertions at the same point | **81.1%** |
| **all error types combined** | **86.3%** |
| AssemblyAI-only | 6.7% |
| azure-llm-only | 4.1% |

**Eighty-six per cent of the two vendors' errors are the same error** — and the
figure is 90.4% on byte-identical input, so it is not a codec artifact. Accuracy
at entity slots is a wash. **No vendor swap can address the overwhelming majority
of the errors in these transcripts.**

**The one real asymmetry** is failure *mode*, not rate: at ambiguous entity slots
AssemblyAI snaps to a real in-vocabulary entity, Azure emits a non-word.

- AssemblyAI: `UNRWA` for `UNDOF` inside an operative quotation; "the **High
  Representative**" for the SRSG; "Thank you, **President Barroso**"; "Thank you,
  Mr. **Ban Ki-moon**"; "report **to** the Secretary-General" ×2; and on S/PV.9649
  a dropped governing phrase that has Algeria's vote *"uphold the legitimacy of
  Daesh and al-Qaeda"*.
- Azure: `INDOF`/`Ndoff`/`ANDOF` for UNDOF (0 of 4); "the **sanctuary**" for "the
  sanctions regime"; but also **"the panel of expert regional partners"**, which is
  fluent and invisible — so the pattern is not clean.

**This is 3-vs-1 across ten meetings, two of them the same acoustic token.**
Directionally real, worth acting on, **not** strong enough to decide a procurement.

**Neither is usable unreviewed.** The shared failures are the ones most likely to
mislead: both reverse who confirmed the parties' positions, both flatten
"positions" to the singular, both misname a Permanent Representative in every
mention and contradict themselves within one meeting.

## 8. What would actually fix the quality problem

Not a vendor change. The cheapest, largest win is **external to both**:

1. **A UN entity glossary + document-symbol/resolution-number validator.** One
   reading agent's estimate: it removes **8 of 15** reader-harming errors in its
   session, on both arms. Every symbol has a checkable form; every officeholder is
   on a published roster. *A validator you can build beats a hallucination you
   cannot detect.*
2. **Feed AssemblyAI mono audio** — measured worth −0.27 WER points, free.
3. **Set `profanityFilterMode`** if Azure is used at all — it is currently
   destroying UN body names.
4. **Schedule the drift regression.** It exists, it costs 10 s, nobody runs it.

---

*Sections 9 (battery / hallucination gate) and 10 (recommendation) follow.*
