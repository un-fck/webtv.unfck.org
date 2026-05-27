# STT cross-provider synthesis — 10 providers, 5 videos

Reference-free analysis (the ensemble of providers is the pseudo-reference; where one
diverges from a ≥4-provider majority it's the likely error). Built from the per-video
reports in `eval/analysis/out/<symbol>/REPORT.md` and the deterministic signals/anomalies
from `compare.py`. **WER is available for S/PV.10156** (its PV record published mid-project);
the others have no verbatim record, so they're judged on content/structure/consensus.

Videos: **V1** UN80-Apr06-keita (GA80 UN80 briefing, 171m) · **V2** S/PV.10156 (SC
draft-report adoption, 9m) · **V3** UN80-Apr29 (GA80 UN80 briefing, 171m) · **V4**
Nebenzia-Starobelsk (RU press conf, accented English, 40m) · **V5** S/PV.10153 (Middle
East SC debate, 80m, **floor-only** multilingual test).

Providers: `assemblyai` (Universal-2), `assemblyai-u3-pro` (Universal-3 Pro), `mistral`
(voxtral-mini), `gemini` (gemini-3-flash-preview, eval), `gemini-3.5-flash`, `azure-openai`
(gpt-4o-transcribe), `alibaba` (now qwen3-asr-flash-**filetrans**), `fun-asr`,
`qwen3.5-omni-plus`, `elevenlabs` (Scribe v2). `voxtral-small` dropped (Mistral token-rate
tier makes audio-chat transcription impractical — a 60s clip exceeds the per-minute budget).

> **Data status:** `fun-asr` numbers are **pending one clean re-run** — its cache was cleared
> for the spacing-fix re-run, which crashed on a transient DNS/network blip (not quota/code).
> en reflects the verified spacing fix (27.2); non-English values are the pre-fix `sentence.text`
> figures, which the _conditional_ fix leaves unchanged. Everything else is final.

---

## 1. The two error families (core structural insight)

- **LLM-based (gemini, gemini-3.5, azure-openai, omni):** fail by **hallucination** — invent
  plausible names, terms, whole sentences over noise/accents; gemini also _drops_ audio;
  omni _summarizes_ instead of transcribing. Fluent, confident, semantically corrupting,
  **invisible to WER**. The dangerous class.
- **Classic ASR (assemblyai/U3, alibaba, fun-asr, elevenlabs):** fail by **acoustic
  mishearing** — wrong words on accents/names — but stay complete and don't invent entities.
  Localized, WER-detectable.

---

## 2. WER — S/PV.10156 (normalized WER %, lower is better)

| provider              |       en |       fr |   es |       ar |        zh |       ru |
| --------------------- | -------: | -------: | ---: | -------: | --------: | -------: |
| gemini                | **15.7** | **52.7** | 59.7 |     83.2 |      96.4 |     61.9 |
| assemblyai-u3-pro     |     16.3 |     54.2 | 59.5 |     87.0 |     100.0 |     62.7 |
| gemini-3.5-flash      |     16.3 |     57.2 | 59.5 | **81.8** |  **95.2** | **61.7** |
| assemblyai            |     16.4 |     53.7 | 59.6 |     86.6 |     100.0 |     62.7 |
| mistral               |     16.6 |     54.4 | 59.8 |     83.4 |      99.4 |     62.4 |
| azure-openai          |     17.7 |     54.1 | 60.7 |     84.3 | **159.9** |     62.8 |
| alibaba _(filetrans)_ |     20.3 |     53.6 | 59.5 |     82.7 |      96.4 |     62.8 |
| elevenlabs            |     21.1 |     56.6 | 61.1 |     83.3 |      99.4 |     66.3 |
| fun-asr _(pending)_   |     ~28† |     56.9 | 60.8 |     85.7 |      95.2 |     66.3 |
| qwen3.5-omni-plus     |     97.2 |     79.7 | 79.0 |     85.1 |     107.2 |     75.8 |

† fun-asr en: was 46.6 (spacing defect), verified **27.2** after the word-rejoin fix; awaiting
the clean re-run for the final figure. Caveats: vs a heavily-edited PV (15–40% is "good"), on a
9-min meeting, so directional. High ar/zh/ru = edited-PV + CJK scoring, not raw failure.

- **gemini and gemini-3.5 lead**; gemini-3.5 best on ar/zh/ru. **u3-pro ≈ assemblyai** on bulk
  WER (its win is accented _words_, not aggregate).
- **alibaba 15.2→20.3**: slightly higher after switching to the filetrans API, but now it
  actually carries timestamps (see §6).
- **azure zh 159.9%** (>100% = net insertions): the Chinese-gavel-leak hallucination.
- **qwen3.5-omni-plus 97.2% en**: it transcribed the English audio **in Chinese** and
  _summarizes_ (see §5) — unusable as a transcriber.

---

## 3. Speaker diarization

Separate from accuracy and from utterance granularity. Measured as **distinct speaker labels**

- granularity on the `en` track. Anchor: S/PV.10156 = **3** (from PV); UN80 briefings ≈8;
  Nebenzia ≈3. **Caveat:** count is a calibration proxy — _not_ attribution accuracy (DER/cpWER
  needs speaker-labeled ground truth we don't have).

| provider                        | V1(≈8) | V2(3) | V3(≈8) | V4(≈3) | behavior                                           |
| ------------------------------- | -----: | ----: | -----: | -----: | -------------------------------------------------- |
| **mistral / qwen3.5-omni-plus** |      1 |     1 |      1 |      1 | **no diarization** (single label)                  |
| **alibaba**                     |      1 |     1 |      1 |      1 | **no diarization** (Qwen-ASR can't, any interface) |
| azure-openai                    |      9 | **3** |      9 |      8 | **best calibrated**                                |
| gemini                          |     11 |     2 |      7 |     11 | reasonable on long videos; over-splits V4          |
| fun-asr                         |     20 | **3** |     14 |      5 | real `speaker_id`s; over-splits long videos        |
| assemblyai (U2)                 |      4 |     2 |      2 |      4 | conservative under-counter                         |
| assemblyai-u3-pro               | **30** |     2 |      2 |      4 | **erratic** (30 spurious on V1, 2 on V3)           |
| elevenlabs                      |     41 |     2 |     34 |      9 | **over-splits badly** on long audio                |

- **Three providers don't diarize at all** (mistral, alibaba, omni — single label).
- **azure-openai is best-calibrated**; **fun-asr** has genuine speaker_ids (nails V2) but
  over-splits long videos.
- **AssemblyAI is the weak diarizer of the accurate transcribers** — U2 under-counts, **U3-pro
  is erratic** (not uniformly coarser — _inconsistent_).
- Granularity is a third axis: on V2, gemini/azure/fun-asr/mistral give 60–78 short utterances;
  assemblyai/elevenlabs/omni lump into ~3. (alibaba, now filetrans, gives **fine** segmentation
  — 1327 sentences on the 171-min V1 — but still no speaker labels.)
- Production note: our pipeline re-derives **named** speakers downstream, so zero-diarization
  providers just give that stage worse hints.

---

## 4. Multilingual floor (V5, S/PV.10153) — the standout new finding

The floor track carries member statements in **all six UN languages** (en/fr/es/ar/zh/ru). A
faithful transcript must be **mixed-script**. Measured % of letters that are non-Latin:

| provider                                                       | non-Latin % | reading                                                                                 |
| -------------------------------------------------------------- | ----------: | --------------------------------------------------------------------------------------- |
| azure-openai, fun-asr, gemini, gemini-3.5, mistral, elevenlabs |  **24–26%** | transcribe each language **as spoken** (Arabic ~10%, Cyrillic ~13%, CJK ~3%) — faithful |
| qwen3.5-omni-plus                                              |         39% | CJK-heavy; but it summarizes, so untrustworthy                                          |
| **assemblyai-u3-pro**                                          |      **0%** | 99% Latin — **fails multilingual**                                                      |
| **assemblyai**                                                 |      **0%** | 100% Latin — **fails multilingual**                                                     |

(alibaba/filetrans also completed the floor and handles multiple scripts; exact % not re-measured.)

**Headline:** **AssemblyAI (both U2 and U3-pro) cannot handle a multilingual floor** — it outputs
~100% Latin, dropping or romanizing the Arabic/Chinese/Russian speakers entirely (consistent with
the garbled French/Spanish seen on V1's floor: `Gracias Senora Presienta por organiza`). Every
other engine transcribes the six languages as-spoken; the **~26% non-Latin consensus across six
independent providers** is a reliable estimate of the floor's true language mix. This matters
because AssemblyAI is otherwise a top pick (U3-pro fixed the accent errors) — **but for
multilingual floor audio it's disqualified.**

---

## 5. Per-provider profiles (all 10)

| Provider                                | Strengths                                                                                                   | Characteristic failures                                                                                                                                                                     | Verdict                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **gemini** (3-flash)                    | Best hard-word accuracy; clean CJK; reasonable diarization; low WER; multilingual floor OK                  | **Name hallucination** (Keita→"Natalia Kanem"); "UN80"→"UN 2.0" ×29; paraphrases over noise; drops content                                                                                  | High value, but the only one that corrupts _meaning_ with confident inventions                    |
| **gemini-3.5-flash**                    | Complete (after the chunking fix I added); best ar/zh/ru WER; multilingual floor OK                         | **Still hallucinates "Natalia Kanem"** — newer model, same failure                                                                                                                          | Not a fix for the core Gemini risk                                                                |
| **assemblyai** (U2)                     | Clean, ~100% coverage; accurate recoverable word timestamps                                                 | Worst accented words ("polling"); under-counts speakers; **fails multilingual floor**                                                                                                       | Reliable English text only                                                                        |
| **assemblyai-u3-pro**                   | **Fixes accent errors** ("appalling"✓, "cold blood"✓); **~6.5× faster**; clean CJK                          | Erratic diarization; **mis-hears "UN80"→"Haiti Initiative" ×9**; **fails multilingual floor**                                                                                               | Best AssemblyAI; English/Latin only                                                               |
| **mistral** (voxtral-mini)              | Clean Latin text, good granularity; multilingual floor OK                                                   | **CJK corruption** (176→3606 U+FFFD); "polling"; over-generates; no diarization                                                                                                             | Never on CJK                                                                                      |
| **azure-openai** (gpt-4o)               | Good granularity; **best-calibrated diarization**; multilingual floor OK                                    | **Cross-language leakage** (Chinese gavel; zh WER 159.9%); "p p p" loops; hallucinates over noise                                                                                           | Capable but unstable on multilingual/noisy audio                                                  |
| **alibaba** (qwen3-asr-flash-filetrans) | Top-tier WER; clean CJK; **now real sentence+word timestamps** (1327 sentences/171m); multilingual floor OK | **No diarization** (Qwen-ASR limit); spells numbers in entities ("UN80"→"Eighty Initiative")                                                                                                | Strong text + timestamps; no speaker labels                                                       |
| **fun-asr**                             | **Real diarization + fine timestamps**; **best Chinese** (zh 95.2); multilingual floor OK                   | English **spacing** (fixed via conditional word-rejoin) + **word truncation** ("Madam"→"Mad"); over-splits diarization                                                                      | Excellent for Chinese / timestamped diarization; weak English text                                |
| **qwen3.5-omni-plus**                   | (chat model)                                                                                                | **Summarizes, doesn't transcribe** — emits section headers ("Overview/Key Themes/Next Steps/Conclusion") + timestamp-number junk; transcribed English as Chinese; no timestamps/diarization | **Drop for transcription**                                                                        |
| **elevenlabs** (Scribe v2)              | **Best accented-English**; ~98% coverage; marks self-repairs; clean CJK; multilingual floor OK              | Worst en WER of serious set (21.1); turn-lumping (coarse timestamps); **over-splits diarization** (34–41 spk); spells numbers ("Gulf Corporation Council")                                  | **Specialist** for accented-English press conferences; not a general workhorse — not in the stack |

---

## 6. Cross-cutting findings

1. **Name hallucination is Gemini-only, family-persistent, and prior-driven.** Both gemini-3-flash
   and gemini-3.5-flash substitute a _different real person_ ("Natalia Kanem", the former UNFPA ED,
   for the current ED Diene Keita) or rename a concept ("UN 2.0"). Latin-script only, intermittent.
   No AssemblyAI/Alibaba/ElevenLabs model invents "Kanem" — it's unique to LLM transcription that
   pattern-matches a role to a name it "knows". Upgrading the model does not fix it.
   **Self-review experiment (both models):** given the audio + Gemini's own transcript (which
   correctly said "Diane Keita") and asked to flag errors, both models flagged the _correct_ name as
   wrong and "corrected" it to the hallucinated "Natalia Kanem". The prior overrides the audio even
   in a dedicated verification task — yet the same review caught real grammar errors and a diarization
   mislabel, so it's a capable reviewer blind only on the high-prior name. **An LLM self-check
   reinforces the error; mitigation must be external** (roster of current officeholders). Script:
   `gemini-selfcheck.ts`.
2. **AssemblyAI fails multilingual floor** (§4) — outputs ~100% Latin, dropping non-Latin speakers.
3. **CJK corruption is mistral-only**, scaling with length (176→3606 U+FFFD); all others clean.
4. **qwen3.5-omni-plus summarizes** (section headers, formatted names) rather than transcribing —
   the definitive reason it's unusable, beyond the language-control failure.
5. **"Off" timestamps are usually _lumping_, not drift.** AssemblyAI's word-level `raw.words` are
   accurate but grouped into few turns; fine-grained providers (gemini/mistral/azure/fun-asr, and
   now alibaba-filetrans) agree within ~1–3s. Azure's "non-monotonic" was 2 sub-second overlaps —
   negligible.
6. **Number/ITN handling diverges:** alibaba/elevenlabs spell numbers out, even inside entity names
   ("UN80"→"Eighty Initiative", G77→"Seventy-Seven"); fun-asr spells meeting numbers
   ("ten thousand…" vs "10,156th"). High-stakes for resolution symbols and figures.
7. **Proper nouns are everyone's weak spot** (no provider got the patronymic "Alexeyevich").
8. **Coverage % is unreliable per-provider** (gemini low = timestamp compression; old alibaba 100% =
   chunk padding). Cross-check char counts.

---

## 7. FINAL DECISION — production routing by track

A 4-provider stack, each role justified by the evidence above:

| Track                    | Provider                   | Why                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **en**                   | **assemblyai-u3-pro**      | best non-Gemini en WER (16.3), fixes accent errors ("appalling"/"cold blood"), 6.5× faster than U2, accurate word-level timestamps                                                                                                                                                                                                       |
| **fr / es / ar / ru**    | **azure-openai**           | one provider for all four; best-calibrated diarization; solid WER; handles every script. Its instability (gavel-leak, cross-lang hallucination) only shows on the _mixed floor_ — single-language interpretation tracks are clean                                                                                                        |
| **zh**                   | **fun-asr**                | best Chinese WER (95.2) + real diarization + word/sentence timestamps; Mandarin-first. _(Alternative if dropping fun-asr: **alibaba** / qwen3-asr-flash-filetrans — ~equal WER 96.4, clean CJK, timestamps, but no diarization; or **paraformer-v2** for diarization. Off-DashScope alternative: gemini, with name-hallucination risk.)_ |
| **floor (multilingual)** | **gemini-3-flash-preview** | the only clean all-script option with reasonable diarization (AssemblyAI Latin-collapses; azure leaks; fun-asr's English suffers). See Gemini caveats below                                                                                                                                                                              |

**Gemini version — use `gemini-3-flash-preview`, not 3.5-flash.** Accuracy is a wash and mixed
(3-flash better en/fr, 3.5 marginally better ar/zh/ru, all within noise); **name hallucination is
identical** (both flip Keita→Kanem, even on self-review); and 3.5 is heavier (timed out / needed
chunking on long audio) and **~3× the cost** (audio in $1.50 vs $1.00/M; output $9 vs $3/M). 3-flash
is cheaper, faster, and equal-or-better on the Latin-dominant floor.

**Gemini is confined to the floor on purpose** — its name-hallucination prior is so strong it
overrides the audio and even "corrects" the right name to the wrong one on self-review (§6.1). Keeping
it off the per-language records limits that blast radius; the floor still needs an external roster
cross-check for named officials.

## 8. Other recommendations

- **ElevenLabs — specialist, not a workhorse.** It's the best on _accented/messy conversational
  English_ (press conferences, interviews): nailed accent words others missed, marks self-repairs.
  But broadly it's middling — worst en WER of the serious set (21.1), coarse turn-level timestamps,
  and **wildly over-split diarization** on long meetings (34–41 speakers). Use only as a fallback for
  accented-English press conferences; it does **not** earn a slot in the main stack.
- **Don't adopt** qwen3.5-omni-plus (summarizes instead of transcribing) or voxtral-small (tier-blocked).
- **alibaba (qwen3-asr-flash-filetrans)** is the go-to when you want max text accuracy + timestamps and
  _don't_ need speaker labels (it can't diarize).
- **Gemini name hallucination** needs an **external** mitigation (roster lookup of current
  officeholders / non-LLM cross-check) — an LLM self-check reinforces the error (§6.1).

## 9. High-error-potential criteria for the rigorous eval corpus

- **Role-holders who succeeded a famous predecessor** → Gemini name hallucination _(V1)_.
- **Non-Latin script, esp. Chinese** → mistral CJK collapse, azure leakage _(V2)_.
- **Multilingual floor** (many national statements) → AssemblyAI Latin-collapse, routing/leak _(V5)_.
- **Heavily accented / non-native English** → assemblyai-U2/mistral acoustic substitution _(V4)_.
- **Noisy/disfluent segments, embedded clips, applause** → LLM hallucination-over-noise _(V4)_.
- **Long meetings, many short turns** → lumping + diarization miscount _(V1/V3)_.
- **Dense proper nouns / numbers / resolution symbols** → spelling/ITN drift, misheard figures.

## Implementation notes

- Shared async helper `lib/providers/dashscope-asr.ts` backs fun-asr + alibaba. Request shapes
  differ: qwen filetrans uses `input.file_url` (string) + `output.result`; fun-asr uses
  `input.file_urls` (array) + `output.results`. Word-rejoin is **conditional** — only sentences
  with a long run-together Latin token are rebuilt from `words[]`, else `sentence.text` is kept
  (rebuilding everything inserted spurious spaces in fun-asr ar/ru → >100% WER).
- Eval Gemini provider now **chunks** long audio (gemini-3.5-flash timed out / truncated otherwise).
- Diarization here = calibration + granularity, not attribution accuracy (no speaker-labeled GT;
  DER/cpWER would need aligning the PV's speaker turns).
- Full per-video evidence: `eval/analysis/out/<symbol>/REPORT.md`.
- **Outstanding:** one clean fun-asr re-run to finalize its WER row (failure was network, not quota).
