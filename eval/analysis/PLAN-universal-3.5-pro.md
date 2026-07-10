# Eval plan — AssemblyAI Universal-3.5 Pro

**Status:** executed 2026-07-10 — phases 0–1 plus a full S/PV.10156 metric pass.
**Results and verdict: [`SYNTHESIS.md`](SYNTHESIS.md) §11** (en stays on 3.5 Pro; floor
stays Gemini — hard disqualify; §1's bug is fixed in `lib/providers/assemblyai.ts`).
Still open: `keyterms_prompt` probe (§5.4), diarization calibration (§5.3), full sweep (§4).
Written 2026-07-09.
**Supersedes nothing** — extends [`SYNTHESIS.md`](SYNTHESIS.md), whose §7 routing decision
this eval is designed to re-open on three specific slots.

---

## 0. Headline: does it support all our languages? **No — Russian is missing.**

Universal-3.5 Pro covers **18 languages**. Against the six official UN languages:

| UN language  | U-3.5 Pro native | U-3 Pro (current prod, `en`) | Notes                                                     |
| ------------ | :--------------: | :--------------------------: | --------------------------------------------------------- |
| English      |        ✅        |              ✅              |                                                           |
| French       |        ✅        |              ✅              |                                                           |
| Spanish      |        ✅        |              ✅              |                                                           |
| Arabic       |      ✅ new      |              ❌              | new coverage                                              |
| Chinese (中) |      ✅ new      |              ❌              | "Mandarin"; new coverage                                  |
| **Russian**  |      **❌**      |            **❌**            | falls back to `universal-2` (99-language legacy model)    |

Full 18: English (Global/AU/GB/US), Spanish, French, German, Italian, Portuguese, Arabic,
Danish, Dutch, Finnish, Hebrew, Hindi, Japanese, Mandarin, Norwegian, Swedish, Turkish,
Vietnamese. ([supported-languages](https://www.assemblyai.com/docs/pre-recorded-audio/supported-languages))

### What this means for the floor track

The floor carries member statements in **all six** UN languages. Five of the six are now
native; Russian is not. And the fallback is **whole-file, dominant-language routing** —

> "Automatic language detection identifies the dominant language in your audio and routes
> the request to the best available model based on the detected language."
> ([language-detection](https://www.assemblyai.com/docs/pre-recorded-audio/language-detection))

There is **no documented per-segment model switching**. So on a floor track where English or
French dominates, the whole file routes to U-3.5 Pro — and what happens to the Russian
statements inside it is **undocumented**. That single unknown is the crux of this eval.

> **Do not assume "18 languages + code-switching" means the floor problem is solved.** It
> means five-sixths of it might be. The Russian sixth is the experiment.

---

## 1. The confound that must be fixed before any comparison

`lib/providers/assemblyai.ts` builds its request body as:

```ts
const body = {
  audio_url: audioUrl,
  speaker_labels: true,
  language_code: apiLanguage(opts?.language), // → undefined when language === "floor"
};
if (speechModels) body.speech_models = speechModels;
```

`apiLanguage()` maps `"floor"` → `undefined`, and `JSON.stringify` **drops undefined keys**.
So the floor request carries *neither* `language_code` *nor* `language_detection`. Per the
API schema, the defaults are:

- `language_code` → **`"en_us"`**
- `language_detection` → **`false`**

([api-reference/transcripts/submit](https://www.assemblyai.com/docs/api-reference/transcripts/submit))

**We have been telling AssemblyAI that the multilingual floor track is US English.**

SYNTHESIS §4's headline finding — *"AssemblyAI (both U2 and U3-pro) cannot handle a
multilingual floor … outputs ~100% Latin"* — was measured under that condition. A model
pinned to `en_us` producing 100% Latin script is **the correct behavior for the request we
sent**, not evidence of a model limitation. The finding is confounded and the conclusion
("disqualified for floor") is currently **unsupported**, though it may well survive a fair
re-test.

This does **not** mean the production routing was wrong — Gemini is on floor, AssemblyAI is
on `en`, and `en` was never affected (`language_code: "en"` is what we want there). It means
the *evidence* for excluding AssemblyAI from floor is invalid, and the exclusion has to be
re-earned or reversed.

**Action, before anything else:** add `language_detection: true` when no ISO language is
given, and re-run the *old* providers (`assemblyai-universal-2`, `assemblyai-universal-3-pro`)
on V5 floor as a **control arm**. Without that control we cannot attribute any 3.5 Pro floor
improvement to the new model rather than to the fixed request.

---

## 2. What else is new, and why we care

| Feature                    | Detail                                                                             | Why it matters here                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Native code-switching**  | 18 languages, enabled by `language_detection: true` alone. No `code_switching` flag | Directly targets the floor slot (SYNTHESIS §4)                                                                                  |
| **Better diarization**     | Claimed cpWER 30.17% avg vs Scribe v2 35.26%, Nova-3 37.92% (AMI/CallHome/DIPCO)   | U-3 Pro's diarization was **erratic** — 30 spurious speakers on V1, 2 on V3 (SYNTHESIS §3). This was its main weakness          |
| **`keyterms_prompt`**      | Up to 1,000 words/phrases, ≤6 words each. +$0.05/hr                                | **This is the external entity mitigation SYNTHESIS §6.1 and §10 asked for**, inside the provider                                |
| **`prompt`**               | Free-text context, ~20–50 words                                                     | Domain priming ("UN Security Council meeting, formal diplomatic register")                                                      |
| **Arabic + Chinese**       | Newly native (U-3 Pro had only en/es/pt/fr/de/it)                                   | Could contest the `ar` (azure) and `zh` (fun-asr) slots                                                                         |
| **U-3 Pro deprecation?**   | Still has a doc page; **no longer a separate pricing line item**                    | ⚠️ **Production `en` runs on `universal-3-pro`.** If it is being retired, this eval is not optional — it is a migration         |

Published WER claims (AssemblyAI's own, [benchmarks](https://www.assemblyai.com/docs/pre-recorded-audio/benchmarks)):
English mean 5.6% (vs U-2 6.1%); FLEURS multilingual avg 4.58% (vs U-2 7.42%); code-switching
normalized WER 7.69% vs **U-3 Pro 9.07%** — a 15% relative gain, the only published
3.5-vs-3 head-to-head. Treat as vendor marketing; our PV-based WER is the number that decides.

**Pricing:** $0.21/hr base, +$0.02/hr diarization, +$0.05/hr keyterms. U-2 is $0.15/hr.
Same order as today's spend; cost is not a decision factor.

---

## 3. Code changes required (small)

All in `lib/providers/assemblyai.ts`, plus one line in `registry.ts`.

1. **Fix the language handling** (§1). When `apiLanguage()` returns `undefined`, send
   `language_detection: true` instead of silently defaulting to `en_us`. This is a **bug fix
   that changes existing providers' behavior on floor** — gate it so U-2/U-3-Pro control runs
   can be reproduced both ways, or simply re-run both arms.
2. **Add `assemblyai-universal-3-5-pro`** via the existing `makeAssemblyai` factory:
   `speech_models: ["universal-3-5-pro", "universal-2"]`.
   - Keep `universal-2` in the array: it is what makes the `ru` fallback work at all, and
     what we are measuring in §5.2.
   - Also register a **no-fallback variant** `["universal-3-5-pro"]` for one probe (§5.2c) —
     we need to know whether a pinned request on `ru` errors or silently degrades.
3. **Record `speech_model_used`** from the response into `NormalizedTranscript.raw` (it is
   already spread into `raw`, but surface it in the summary) — this is the *only* way to know
   which model actually served a given floor/ru file.
4. **Optional params** plumbed through `opts` for the §6 probes: `prompt`, `keyterms_prompt`.
5. **`eval/analysis/compare.py`**: add the new key to the hardcoded `PROVIDERS` list (line 24).
   Nothing else — `script_counts()` / `off_script_pct` / `script_mix` already compute the
   non-Latin-% metric that produced SYNTHESIS §4.

---

## 4. Track A — metric eval (WER/CER vs PV ground truth)

The existing harness, unchanged in shape.

```bash
# Standing corpus: 20 sessions, 20.9 h per language track (eval/corpus/sessions.json)
pnpm eval -- --providers=assemblyai-universal-3-5-pro --languages=en,fr,es,ar,zh,ru
pnpm eval -- --providers=assemblyai-universal-3-5-pro --languages=floor
```

Run against the incumbent for each slot, on the **same sessions**, so the comparison is paired:

| Slot           | Incumbent                 | Challenger              |
| -------------- | ------------------------- | ----------------------- |
| `en`           | `assemblyai-universal-3-pro` | `assemblyai-universal-3-5-pro` |
| `fr/es/ar`     | `azure-gpt-4o-transcribe` | `assemblyai-universal-3-5-pro` |
| `zh`           | `alibaba-fun-asr`         | `assemblyai-universal-3-5-pro` |
| `ru`           | `azure-gpt-4o-transcribe` | `assemblyai-universal-3-5-pro` (→ served by U-2) |
| `floor`        | `gemini-3-flash`          | `assemblyai-universal-3-5-pro` |

Reuse cached incumbent results where present (`--cached-only` on the incumbent, fresh on the
challenger) to avoid re-billing ~100 h of audio.

**Read the WER table the way SYNTHESIS §2 says to read it:** 15–40% is "good" against a
professionally-edited PV; ar/zh/ru absolutes are inflated by editing + CJK scoring. Only
**within-language, cross-provider deltas** on the same sessions are meaningful.

> ⚠️ **AssemblyAI is slow on long audio.** Per the note in `analysis/README.md`, give it its
> own narrow-language run rather than letting it bottleneck a wide sweep.

**Statistical honesty:** SYNTHESIS §2's WER table is a single 9-minute meeting. With 20
sessions we can do better — report per-language **mean WER with a bootstrap 95% CI over
sessions**, and call a slot flip only when the CI excludes zero difference. The dashboard
already renders 95% CIs (`eval/dashboard/src/components/Leaderboard.tsx`); this run should
populate them rather than reasoning from a single meeting.

---

## 5. Track B — anecdotal / failure-mode eval (the SYNTHESIS.md style)

Reference-free, on the 5 hand-picked videos in `eval/corpus/manual-eval.json`, each chosen to
trigger a specific error mode (SYNTHESIS §9). This is where the decision actually gets made —
WER is blind to the hallucination class that matters most to us.

```bash
pnpm eval -- --corpus=eval/corpus/manual-eval.json \
  --providers=assemblyai-universal-3-5-pro,assemblyai-universal-3-pro,gemini-3-flash \
  --languages=floor            # V5 is the main event
python3 eval/analysis/compare.py
```

### 5.1 The floor test (V5, `S/PV.10153`) — **the primary experiment**

80-min Middle East SC debate, statements in all six UN languages on the floor track.

**Metric:** `script_mix` / non-Latin % from `compare.py`. The six-provider consensus in
SYNTHESIS §4 established the ground truth for this file: **~24–26% non-Latin** (Arabic ~10%,
Cyrillic ~13%, CJK ~3%). That is a *reference-free but well-corroborated* target, and it
decomposes by script — which is exactly what we need, because the Russian question is a
**Cyrillic-specific** question.

Four arms, and the decomposition is the whole point:

| Arm                                | Request                                            | Tests                                       |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| **A. U-3.5 Pro, detection on**     | `speech_models:[u35pro,u2]`, `language_detection:true` | The actual candidate                    |
| **B. U-3 Pro, detection on**       | `speech_models:[u3pro,u2]`, `language_detection:true`  | **Control for the §1 bug**              |
| **C. U-3 Pro, detection off**      | current code, defaults to `en_us`                      | Reproduces SYNTHESIS §4's 0%            |
| **D. gemini-3-flash**              | unchanged                                              | Incumbent baseline (~26% non-Latin)     |

**Predictions to falsify.** Writing these down first so the result cannot be rationalized after:

- If **A ≈ 24–26% non-Latin with ~13% Cyrillic** → 3.5 Pro handles the full floor, including
  Russian, despite `ru` not being on the 18-language list. Surprising; would mean the U-2
  fallback or the acoustic frontend generalizes. **Verify by reading the Russian passages** —
  Cyrillic characters present ≠ Russian correctly transcribed.
- If **A ≈ 11–13% non-Latin, Cyrillic ≈ 0%, Arabic + CJK present** → the documented behavior.
  Five of six languages transcribed as spoken; **Russian statements dropped or romanized.**
  This is the most likely outcome and it **disqualifies 3.5 Pro from the floor slot** as
  cleanly as before, but for a precise, understood reason rather than a confounded one.
- If **B ≈ A** → the §1 bug was the whole story and U-3 Pro was never the problem; the
  interesting comparison collapses to "which multilingual model", and SYNTHESIS §4 needs a
  correction notice.
- If **B ≈ C ≈ 0%** → U-3 Pro genuinely Latin-collapses even when asked to detect language;
  SYNTHESIS §4's conclusion stands as written (for U-3 Pro), and A is measured against it.

**Do not stop at the aggregate percentage.** Pull the six longest Russian and Arabic
statements from the PV (`S/PV.10153` has a verbatim record) and read the corresponding audio
window in each arm's transcript. A model that emits *plausible Cyrillic* on Russian audio it
does not support is a **worse** failure than one that drops it — it is the AssemblyAI-shaped
version of Gemini's hallucination class, and it would be invisible to `script_mix`.

### 5.2 Russian-track behavior (single-language `ru`)

Distinct from the floor test: here the audio is *entirely* Russian (the interpretation track).

a. **Default array** `["universal-3-5-pro","universal-2"]` + `language_code: "ru"` → expect
   `speech_model_used: "universal-2"`. Confirm, and compare WER against U-2's own row and
   against azure. If U-2-via-fallback is competitive with azure on `ru`, that is a mild
   consolidation win (one fewer vendor on that slot) — *not* a 3.5 Pro win, and it must be
   labelled as such in the writeup.
b. **`Nebenzia-Starobelsk` (V4)** — Russian-accented *English*, 40 min. This is a `ru`-adjacent
   test that 3.5 Pro *should* win: U-3 Pro's headline improvement over U-2 was exactly this
   ("appalling" not "polling"). Check the known probe words and whether 3.5 holds the gain.
c. **Pinned, no fallback** `["universal-3-5-pro"]` + `language_code: "ru"` → does the API
   reject the request, or silently transcribe Russian with an unsupported-language model?
   **Undocumented, and it determines whether our routing may ever pin the model.** One 5-minute
   clip answers it. Run this early — it is cheap and it constrains §3.2.

### 5.3 Diarization (V1/V3, ≈8 speakers; V2, 3 speakers)

AssemblyAI claims its "most accurate diarization yet". U-3 Pro's was **erratic** — 30 speakers
on V1, 2 on V3, where truth is ≈8 for both (SYNTHESIS §3).

Reuse the existing speaker-count-calibration proxy. **Be honest about what it measures:** it is
calibration + granularity, *not* attribution accuracy. AssemblyAI's cpWER claim is an
attribution metric we cannot reproduce without speaker-labeled ground truth.

We *could* now get closer: `S/PV.10153` and `S/PV.10156` have PV records with **named speaker
turns**. Aligning PV turns to transcript timestamps would yield a real cpWER. SYNTHESIS §3 and
§Implementation-notes both flag this as the missing piece, and `docs/realignment.md` already
describes PV↔audio alignment (`POST /api/pv/align`). **Scoped as a stretch goal** — if it slips,
fall back to the count proxy and say so. Do not silently substitute the proxy for cpWER.

Also test `speakers_expected` / `min_speakers_expected` / `max_speakers_expected`: for SC
meetings we often know the speaker count a priori from the PV. If bounding the range fixes the
erratic-count behavior, that is a production-relevant finding independent of which model wins.

### 5.4 Entity handling (V1, `UN80-Apr06-keita`) — the `keyterms_prompt` probe

The one genuinely novel capability, and it maps onto our two known entity failures:

- U-3 Pro mis-hears **"UN80" → "Haiti Initiative" ×9** (SYNTHESIS §5)
- Gemini **hallucinates "Natalia Kanem"** for Diene Keita, and *reinforces the error on
  self-review* (§6.1) — the reason §6.1 concludes mitigation must be **external**

Three arms on V1's `en` track:

| Arm | Config                                                                                       |
| --- | -------------------------------------------------------------------------------------------- |
| 1   | 3.5 Pro, no prompt — baseline                                                                |
| 2   | 3.5 Pro + `keyterms_prompt: ["UN80", "Diene Keita", "Sima Bahous", "Doreen Bogdan-Martin", …]` |
| 3   | 3.5 Pro + `keyterms_prompt` + `prompt: "Formal UN General Assembly briefing…"`                |

Score: exact hit-rate on the known entity list, plus **an insertion check** — does keyterms
biasing cause the model to *insert* listed terms where they were not spoken? That is the
failure mode of contextual biasing, and it would recreate the hallucination class we are trying
to escape. A keyterms win that trades misses for false positives is not a win.

If this works, it is reusable beyond AssemblyAI: it validates "inject a roster of current
officeholders at transcription time" as a strategy, which is what SYNTHESIS §10 wanted from
MAI-Transcribe-1.5's `phraseList`.

---

## 6. Decision rules (write these down before seeing results)

| Result                                                                       | Action                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 3.5 Pro `en` WER ≤ U-3 Pro, CI-confirmed, diarization not worse              | **Migrate `en`.** Low risk; also de-risks U-3 Pro deprecation                  |
| Floor arm A hits ~26% non-Latin **and** Russian passages read correctly      | Re-open the floor slot: 3.5 Pro vs Gemini on hallucination, not just script    |
| Floor arm A ≈ 13% non-Latin, Cyrillic ≈ 0                                    | **Floor stays Gemini.** Record the reason precisely; correct SYNTHESIS §4's confounded framing |
| Floor arm A emits plausible-but-wrong Cyrillic                               | **Hard disqualify**, and log it as a new AssemblyAI-side hallucination class   |
| 3.5 Pro `ar` beats azure, CI-confirmed                                       | Consider flipping `ar`; weigh vendor consolidation against azure's diarization |
| 3.5 Pro `zh` beats fun-asr (94.6)                                            | Unlikely; fun-asr is Mandarin-first. Would be a genuine surprise               |
| `keyterms_prompt` fixes UN80 with no insertions                              | Adopt for **all** AssemblyAI tracks; generalize the roster idea to other slots |
| U-3 Pro confirmed deprecated                                                 | Migration is mandatory regardless of the above; prioritize the `en` arm        |

**Bias to declare up front:** the incumbent `en` provider is the same vendor as the challenger,
so a vendor-favorable result on `en` is the path of least resistance. The floor and `ru` arms
are the ones that can actually embarrass the model, and they are the ones designed to.

---

## 7. Cost and sequencing

Audio volume: standing corpus 20.9 h/track; manual-eval corpus 7.85 h/track.
At $0.23/hr (base + diarization), the full plan is roughly:

| Phase                                                | Audio       | ~Cost | Gate                                        |
| ---------------------------------------------------- | ----------- | ----- | ------------------------------------------- |
| **0.** `ru` pinned-model probe (§5.2c), 5-min clip   | 0.1 h       | <$1   | Answers a blocking API question             |
| **1.** Floor arms A–D on V5 (§5.1)                   | ~5.3 h      | ~$2   | **The decision point for the floor slot**   |
| **2.** Manual-eval failure modes (§5.3, §5.4)        | ~16 h       | ~$4   |                                             |
| **3.** Full metric sweep, 7 tracks (§4)              | ~146 h      | ~$34  | Only worth it if phases 1–2 look promising  |
| **4.** cpWER via PV speaker alignment (stretch)      | —           | eng.  | Cut first if time-boxed                     |

Total under ~$45 in STT spend. **Wall-clock, not cost, is the constraint** — AssemblyAI is slow
on long audio and phase 3 is ~146 h of it.

Run phases 0 and 1 first. Phase 1 alone answers the question that prompted this eval, for about
two dollars.

---

## 8. Open questions the docs do not answer

1. **Mixed supported + unsupported language in one file** — no documented per-segment routing.
   §5.1 is the empirical answer.
2. **Per-word / per-utterance language labels** on 3.5 Pro — `code_switching_languages` is
   documented for **Universal-2**, not 3.5. If 3.5 exposes no per-span language, we cannot
   route or QA by language within the floor track.
3. **`keyterms_prompt` × `language_detection` compatibility** — examples show them together,
   but it is never stated. Test on V5.
4. **U-3 Pro lifecycle.** No pricing line item. **Ask AssemblyAI support directly** rather than
   inferring — production `en` depends on it.
5. Whether `speech_model_used` is returned on every response, including fallback.

---

## 9. Deliverables

- `eval/analysis/out/<symbol>/REPORT.md` — regenerated per-video, with the new provider
- **Correction notice in `SYNTHESIS.md` §4** — the AssemblyAI floor finding is confounded by
  §1 and must be restated with the control arm, whatever the outcome. This is required even if
  3.5 Pro loses.
- A `§11 Universal-3.5 Pro` section in `SYNTHESIS.md`, matching §10's watchlist format
- Updated `STT_ROUTING` in `lib/providers/config.ts` **only** if a decision rule in §6 fires
- Updated provider table in `eval/README.md` and the About/Methodology page copy

Note for whoever writes the user-facing copy: per `CLAUDE.md`, these are **automatic
transcripts**, never "AI-generated" — and any Methodology-page change touching a string means
all six locale catalogs in the same commit.
