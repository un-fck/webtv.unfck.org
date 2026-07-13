# Eval plan — the floor challengers on the English track (and the procurement question)

**Status:** Phases 1–2 executed 2026-07-13. **Results and verdict: [`SYNTHESIS.md`](SYNTHESIS.md) §14**
(`en` does not move to Speechmatics; `azure-llm-speech` is the strongest challenger; the incumbent
stops diarizing on long meetings). Phase 3 dropped; roster probe (§5) still not run.
Written 2026-07-13.
**Extends** [`SYNTHESIS.md`](SYNTHESIS.md) §13 (the floor bake-off) and §11 (AssemblyAI 3.5 Pro).
**Question:** should one of the floor challengers — Speechmatics above all — take the `en` slot
from AssemblyAI?

---

## 0. Two facts that reshape the question

### 0.1 English is 96 % of the product

Production volume, all completed transcripts to date (`webtv.transcripts ⋈ videos`, queried
2026-07-13):

| track | transcripts | audio hours | share of hours |
| --- | ---: | ---: | ---: |
| **en** | **883** | **1 811.4** | **95.6 %** |
| floor | 33 | 37.6 | 2.0 % |
| es | 8 | 13.0 | 0.7 % |
| fr | 7 | 10.7 | 0.6 % |
| ar | 5 | 8.9 | 0.5 % |
| zh | 6 | 6.5 | 0.3 % |
| ru | 5 | 5.7 | 0.3 % |
| **total** | **947** | **1 893.8** | |

Everything that is not English is a **rounding error**: the five non-English language tracks
together are 44.8 h — *ever*. At any provider's rate that is **under $20 of lifetime spend**.

This has sharp consequences:

- **The English slot is the only STT decision that carries real money or real quality risk.**
  1 811 h × $0.23 ≈ **$417** of AssemblyAI to date, and growing.
- **Do not trade English quality for consolidation.** Consolidating the five minor languages
  onto one vendor saves on the order of **$20 over the project's life**. It buys operational
  tidiness, nothing more. English quality is 96 % of the product.
- **Phase 3 (the other five languages) is correctly dropped.** Running it would cost ~$130 of
  eval audio to optimize tracks that have consumed ~45 h ($11–18) of production audio in total —
  **the eval would cost ~7× the thing it optimizes.** Revisit only if that volume grows.

### 0.2 "Speechmatics for English" is a different model than the one we picked for the floor

`model: "melia-1"` **requires `language: "multi"`**. Single language codes are rejected, and so
is `auto`. Verified directly against the docs
([models](https://docs.speechmatics.com/speech-to-text/models)):

> "Melia 1 does not support the `auto` language value, which returns an error. Set `language` to `multi`."

> **"Melia for English" is not a configuration that exists.**

Speechmatics-on-English means their **monolingual stack** (Standard or Enhanced — the Ursa 2
family): a different model, price, and feature set.

| | Melia 1 (our floor) | Standard | Enhanced |
| --- | --- | --- | --- |
| accuracy (vendor's own table) | "High" | "High" | **"Highest"** |
| language | `multi` **only** | one ISO code | one ISO code |
| batch price | $0.129/hr | $0.24/hr | **$0.40/hr** |
| `additional_vocab` (word boost) | ❌ "not yet" | ✅ | ✅ |
| confidence scores | ❌ | ✅ | ✅ |
| diarization | ✅ | ✅ | ✅ |
| status | production **preview** | GA | GA |

**Every §13 result about Melia transfers to English at exactly zero strength.** The 73.6/10.3/
13.0/3.0 script mix, the 17/17 speaker calibration, the zero Kanem hallucinations, the 40 s per
80 min — all of it describes `melia-1`, a model we *cannot run* on `en`. Speechmatics-on-English
is, today, **completely unmeasured**. The provider we settled on for the floor is the one
candidate whose floor performance says nothing about its English performance.

The other three challengers use the *same* model on both tracks (different language parameter),
so their floor priors do partially transfer. Speechmatics is the sole exception — and it is the
one we'd assumed was safest.

---

## 1. The procurement lattice (replacing the pre-registered WER margin)

Constraint (from the user): **Azure is institutionally procured. Roughly one *other* provider can
be procured. Everything else comes out of pocket** — acceptable for low-volume languages.

The tempting inference is "the floor needs a non-Azure provider, so floor claims the one slot."
**That is wrong, and §0.1 is why:** floor is 37.6 h ≈ **$5 of Melia, lifetime**. Floor is
trivially affordable out of pocket. It does not need the procured slot.

> **The procured non-Azure slot should go to whoever transcribes English**, because English is
> 96 % of the hours. Everything else can be expensed.

That yields three end-states worth costing (English lifetime-to-date, 1 811 h):

| config | `en` provider | procurement | `en` cost to date | note |
| --- | --- | --- | --- | --- |
| **A** (status quo) | AssemblyAI 3.5 Pro | AssemblyAI takes the slot; floor+zh out of pocket (~$10) | ~$417 | works today; best-measured en WER (15.5, §11.2) |
| **B** | Speechmatics Standard | Speechmatics takes the slot (en + floor) | ~$435 | one vendor for en+floor; price ≈ parity with A |
| **B′** | Speechmatics Enhanced | as B | ~$724 | pay ~1.7× for the vendor's "highest accuracy" tier |
| **C** | **azure-llm-speech** | **Azure — already procured** | **~$0 marginal** | frees the non-Azure slot entirely. *If* it passes the hallucination gate |

**Config C is the highest-leverage outcome in the whole plan** and it was buried in Phase 2 of
the previous draft. Azure is already paid for; if `azure-llm-speech` is competitive on
*monolingual* English, English procurement cost goes to zero and the spare slot can go to floor.
Its floor defect was **statement-boundary language leakage** (§13.1) — which has *nothing to leak
into* on a monolingual track. Its real risk is the §6.1 LLM hallucination family, which is exactly
what the V1 Kanem probe tests. **Therefore `azure-llm-speech` moves into Phase 1.**

### What replaces the pre-registered margin

You were right that the WER threshold can't be fixed in advance — it depends on numbers we won't
have until the results land. So only the **binary gate** is pre-registered; the rest is an
explicit decision meeting with named inputs.

**Pre-registered, non-negotiable — the hallucination gate.** Any arm that produces a
**Kanem-class substitution** (a *different real person's* name confidently substituted) on V1 is
**disqualified for `en`, whatever its WER**. This is §6.1's error class; WER is structurally blind
to it; it is the reason Gemini was confined to the floor and then removed from it. No cost or
procurement argument overrides this.

**Decided at results time, with these inputs on the table:**
per-arm paired WER + CI · error-family profile · diarization calibration · $/hr × 1 811 h and
growing · which arm the procured slot is spent on · whether Config C frees the slot · Melia's
"production preview" status as a vendor risk on `en`.

---

## 2. Phase 0 — fix these before spending a cent on audio

### 2.1 `lib/providers/speechmatics.ts` silently runs **Standard** on single-language tracks

The single-language path sends:

```ts
transcription_config: { language: lang, diarization: "speaker" }   // no `model` field
```

Speechmatics' default when `model` is omitted is **`standard`** — the *lower*-accuracy tier
("If you do not set it, the `standard` model is used"). So today:

- we would benchmark Speechmatics' **second-best** English model without knowing it;
- the registry entry is named `speechmatics-melia-1` and reports `model: "melia-1"`, which on a
  single-language track is **factually wrong** — Melia never ran;
- `lib/usage-tracking.ts` keys pricing on `${vendor}/${model}` → `speechmatics/melia-1` →
  **$0.129/hr**, while a Standard request actually costs **$0.24/hr**. Cost rows would
  under-report by ~2×, silently.

No live impact today (only `floor` routes to Speechmatics, and that path genuinely *is* Melia).
It becomes a real bug the moment English routes there — i.e. the moment this plan succeeds.

**Fix** — split into honest registry entries so name/model/pricing can never drift from what ran:

| registry key | request | slot |
| --- | --- | --- |
| `speechmatics-melia-1` | `model: melia-1`, `language: multi`, six-language `language_hints` | floor (unchanged, production) |
| `speechmatics-standard` | `model: standard`, `language: <iso>` | English challenger |
| `speechmatics-enhanced` | `model: enhanced`, `language: <iso>` | English challenger |

Add `speechmatics/standard` ($0.24/hr) and `speechmatics/enhanced` ($0.40/hr) to
`lib/providers/pricing.ts`. Use `model`, not the now-deprecated `operating_point`
([changelog](https://speechmatics.featurebase.app/en/changelog), 2026-07-01).

*(The `zh → cmn` code mapping Speechmatics needs is a Phase-3 concern only — deferred with it.)*

### 2.2 Serialization — **don't fix it. It isn't the bottleneck for Phases 1–2.**

Answering the question directly, from the harness code rather than from §13.3's lesson note:

`eval/run.ts` runs **providers in parallel** (`Promise.all(providerNames.map(runProvider))`) and
**sessions and languages serially**. Crucially, it already caches two things:

- **audio** per `(symbol, language)` in `eval/corpus-data/audio/` — downloaded once, reused by
  every provider *and every later run*;
- **raw provider output** per `(symbol, provider, language)` — so a crash or a re-run resumes free.

Wall-clock estimate for the 20-session corpus (mean 63 min/session, `en` only), using measured
provider speeds from §13 (Melia 80 min → 40 s; azure-llm 80 min → 58 s; AssemblyAI 3.5 Pro
80 min → ~2.5 min; ElevenLabs ≈ 5× Melia):

| phase | arms | audio downloads | slowest arm | est. wall-clock |
| --- | --- | --- | --- | --- |
| **1** | 4 | 20 (first run) | AssemblyAI ~2 min | **~1 h** |
| **2** | +2 | **0** (cache hit from Phase 1) | ElevenLabs ~3 min | **~1 h** |

**~2 hours total, unattended and resumable.** Parallelizing sessions would roughly halve that
while adding real risk: Speechmatics' free tier already 403'd mid-sweep once (§13.3), provider
rate limits are unmapped for Soniox/ElevenLabs, and interleaved failures are harder to diagnose.
**Not worth it.** The serialization pain §13.3 logged was a **Phase 3** problem — 6 languages ×
20 sessions = 120 downloads and 6× the arms — and Phase 3 is dropped.

If Phase 3 is ever revived, it is a ~5-line change: `parallelMap` already exists in
`lib/providers/utils.ts`; add `--session-concurrency=N` defaulting to 1 (behavior unchanged) and
raise it only for the big sweep.

**One operational note:** run Phase 1 before Phase 2 and **do not clear `eval/corpus-data/audio/`**
between them — Phase 2's zero-download estimate depends on that cache. Disk cost ≈ 800 MB.

---

## 3. Phase 1 — English: Speechmatics + azure-llm-speech vs AssemblyAI

### Arms (all on the `en` track)

| arm | why it's here |
| --- | --- |
| **`assemblyai-universal-3-5-pro`** (incumbent) | current production; best en WER measured to date (15.5, §11.2). The bar |
| **`speechmatics-enhanced`** | the vendor's "highest accuracy" tier — the real Speechmatics contender |
| **`speechmatics-standard`** | what our code would silently have run; also the price-competitive option ($0.24 ≈ parity with AssemblyAI's $0.23) |
| **`azure-llm-speech`** | **procurement-privileged** (Config C → $0 marginal). Pulled forward from Phase 2 |

Both Speechmatics tiers are needed: Standard alone under-sells the vendor; Enhanced alone hides
whether we'd get most of the benefit at 60 % of the price.

### Corpus

- **Metric:** all 20 standing sessions (`eval/corpus/sessions.json`), `en` track, ~20.9 h/arm.
- **Anecdotal:** `en` tracks of V1 (`UN80-Apr06-keita` — entity trap), V4
  (`Nebenzia-Starobelsk` — accented English), V3 (`UN80-Apr29` — structure/timestamps).

### Measurements

- **WER/CER**, paired per session, with a **bootstrap 95 % CI** over the 20 sessions. Every
  headline WER in SYNTHESIS §2/§11.2 still rests on *one 9-minute meeting*; this is the run that
  finally fixes that. The dashboard already renders CIs
  (`eval/dashboard/src/components/Leaderboard.tsx`).
- **Hallucination gate** (V1, via `bakeoff-entities.py`): Keita hits, **Kanem substitutions —
  must be 0**, UN80 correct/miss-form. AssemblyAI's own known en failure is "UN80" → "Haiti
  Initiative" ×9 (§5); does Speechmatics do better or worse?
- **Accented English** (V4): the historical probes — "appalling" not "polling", "cold blood",
  the patronymic "Alexeyevich". All five floor arms passed in §13.2; confirm the monolingual
  stack does too.
- **Diarization** vs PV speaker count. *(Correction to the previous draft: since most UN speakers
  speak English, the `en` track carries mostly original voices, not interpreters — so the PV count
  is a fair truth here. The interpreter-collapse hazard applies to `fr`/`es`/`ar`/`ru`, and is
  deferred with Phase 3.)*
- **Cost and wall-clock** per hour of audio → feeds the §1 decision meeting.

**→ Report, then decide.**

---

## 4. Phase 2 — the remaining challengers on English

| arm | prior from §13 | what English tests |
| --- | --- | --- |
| `soniox-stt-async-v5` | best floor text ever measured (32.0 norm, V2 floor); **under-diarizes badly** (≤8 labels regardless of truth) | Its *true* en WER has **never** been measured — every Soniox number we hold is floor-vs-English-PV. Cheapest arm ($0.10/hr) |
| `elevenlabs-scribe-v2-tuned` | cleanest Russian of any provider; calibrated diarization ≥60 min | Its known weakness **is** English (worst en WER of the serious set, 21.1, §5). Does the tuned config change that? Coarse turns (25 utterances / 80 min) |
| *(optional)* `deepgram-nova-3` | ruled out for floor (`multi` = 10 langs, no ar/zh) | Those reasons don't apply to English. Doesn't serve consolidation, but it's registered and ~$5. Reference arm |

Same corpus, same metrics, same gate. Audio is already cached from Phase 1 → downloads free.

**→ Report, then decide.**

---

## 5. Cross-cutting probe — the vocabulary roster (run alongside Phase 1, ~$7)

Open since §6.1, still unrun (§11.4). Now testable on three providers with three mechanisms:

| provider | mechanism | limit |
| --- | --- | --- |
| AssemblyAI 3.5 Pro | `keyterms_prompt` (+ `prompt`) | 1 000 phrases, ≤6 words; +$0.05/hr |
| Speechmatics Standard/Enhanced | `additional_vocab` (with `sounds_like`) | ✅ |
| Speechmatics **Melia** | — | ❌ **"not yet"** |

Probe on V1's `en` track — three arms per provider (no roster / roster / roster + domain prompt) —
scored on the known entity list (Keita, Bahous, Bogdan-Martin, UN80) **plus an insertion check**:
does biasing cause the model to *insert* listed terms where they were not spoken? A roster that
trades misses for false positives recreates the very hallucination class we are escaping and is
not a win.

**Strategic payoff:** if the roster works, English gets a real entity fix — and the floor (Melia)
**cannot have it**. That asymmetry becomes a standing argument about the floor slot, and it is why
this belongs in *this* plan rather than being deferred a third time.

---

## 6. Cost and sequencing

Corpus ≈ 20.9 h (`en`, standing) + ~7.9 h (manual-eval). Rates: AssemblyAI $0.23 (incl.
diarization) · SM Standard $0.24 · SM Enhanced $0.40 · Soniox $0.10 · ElevenLabs $0.22 ·
azure-llm ≈ gpt-4o class.

| phase | audio | ~cost | wall-clock | gate |
| --- | --- | --- | --- | --- |
| **0.** Provider split + pricing rows (§2.1) | — | eng. | — | **Blocking** |
| **1.** Speechmatics ×2 + azure-llm vs AssemblyAI, `en` | ~84 h | **~$25** | ~1 h | **The decision point** |
| **5.** Roster probe (V1 `en`) | ~26 h | ~$7 | ~15 min | Run with Phase 1 |
| **2.** Soniox + ElevenLabs (+Deepgram), `en` | ~63 h | ~$12 | ~1 h | After the Phase-1 decision |
| ~~3.~~ Other five languages | — | — | — | **Dropped** — §0.1: eval would cost ~7× the production spend it optimizes |

**Total ≈ $45 and ~2 hours of unattended runtime.** Neither cost nor time is a constraint; the
only thing that matters is getting the English answer right, because English is the product.

---

## 7. Open questions

1. **Does Melia's benign error family (zero hallucinations across every §13 probe) carry over to
   Speechmatics' monolingual stack?** Different model — genuinely unknown, and it is Phase 1's
   core content.
2. **Is `speaker_sensitivity` (0–1, default 0.5) the Speechmatics analogue of ElevenLabs'
   `diarization_threshold`?** Untuned. First knob to reach for if diarization disappoints.
   `max_speakers` is documented for **realtime only**; batch support is **NOT DOCUMENTED** —
   worth a probe, since the PV gives the true count a priori.
3. **Melia is a vendor-declared "production preview"** and is already live on our floor. Its
   Standard/Enhanced siblings are GA — so a Speechmatics `en` win would rest on GA models even
   though our floor does not. Worth stating plainly rather than discovering later.
4. **`azure-llm-speech` returns `confidence: 0` always** and is an unnamed Microsoft preview —
   its results carry a reproducibility asterisk even if it wins.

---

## 8. Deliverables

- **`SYNTHESIS.md` §14** — "The English track: floor challengers vs AssemblyAI", in the house
  format: paired WER table with CIs, error-family verdicts, diarization table, per-provider
  profiles, and a routing decision with the procurement math shown.
- **A one-line correction to §13's framing** — §13.3's "a routing flip to Melia is now defensible"
  is about the **floor**. Nothing in §13 licenses any claim about Speechmatics on single-language
  tracks; this plan nearly over-extended it, and the next reader will too.
- Two new registry entries + two pricing rows (§2.1).
- `STT_ROUTING` update in `lib/providers/config.ts` **only** if the §1 decision meeting says so.
- Updated provider tables in `eval/README.md`, `docs/eval.md`, `docs/ai.md`.

Reminder for any user-facing copy: per `CLAUDE.md` these are **automatic transcripts**, never
"AI-generated"; and any Methodology/About string change means **all six locale catalogs in the
same commit**.
