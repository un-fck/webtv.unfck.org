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
| fun-asr               |     21.7 |     56.2 | 62.1 |     85.8 |  **94.6** |     66.0 |
| qwen3.5-omni-plus     |     97.2 |     79.7 | 79.0 |     85.1 |     107.2 |     75.8 |

Caveats: vs a heavily-edited PV (15–40% is "good"), on a 9-min meeting, so directional. High
ar/zh/ru = edited-PV + CJK scoring, not raw failure. (fun-asr en was 46.6 before the word-rejoin
spacing fix → **21.7**; **zh 94.6 is now the best of all providers**.)

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

> **Correction (2026-07-10):** the 0%-non-Latin measurement above was **confounded**. Our
> request sent neither `language_code` nor `language_detection`, so the API silently defaulted
> to `language_code: "en_us"` — 100% Latin was the correct behavior for the request we sent,
> not evidence about the model (see `PLAN-universal-3.5-pro.md` §1; the provider now sends
> `language_detection: true` when no language is given). The re-test with detection enabled
> (§11) does **not** rescue AssemblyAI — it fails differently and worse: detection picks one
> dominant language for the whole file and misfired to "ru" (confidence 0.33) on V5,
> routing the entire 80-min six-language floor to universal-2-as-Russian, which emitted
> **98.7% Cyrillic** — fluent hallucinated Russian over the French/English/Arabic/Chinese
> statements. The **conclusion stands, for a corrected reason**: whole-file dominant-language
> routing (plus no Russian in the Pro models), not Latin-collapse.

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
| **fun-asr**                             | **Real diarization + fine timestamps**; **best Chinese of all** (zh 94.6); multilingual floor OK            | English **word truncation** ("Madam"→"Mad") — spacing was fixed via conditional word-rejoin (en 46.6→21.7); over-splits diarization                                                         | Excellent for Chinese / timestamped diarization; English now usable but mid                       |
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

| Track                    | Provider                   | Why                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **en**                   | **assemblyai-u3-pro**      | best non-Gemini en WER (16.3), fixes accent errors ("appalling"/"cold blood"), 6.5× faster than U2, accurate word-level timestamps                                                                                                                                                                                                                        |
| **fr / es / ar / ru**    | **azure-openai**           | one provider for all four; best-calibrated diarization; solid WER; handles every script. Its instability (gavel-leak, cross-lang hallucination) only shows on the _mixed floor_ — single-language interpretation tracks are clean                                                                                                                         |
| **zh**                   | **fun-asr**                | best Chinese WER of all providers (94.6) + real diarization + word/sentence timestamps; Mandarin-first. _(Alternative if dropping fun-asr: **alibaba** / qwen3-asr-flash-filetrans — ~equal WER 96.4, clean CJK, timestamps, but no diarization; or **paraformer-v2** for diarization. Off-DashScope alternative: gemini, with name-hallucination risk.)_ |
| **floor (multilingual)** | **gemini-3-flash-preview** | the only clean all-script option with reasonable diarization (AssemblyAI Latin-collapses; azure leaks; fun-asr's English suffers). See Gemini caveats below                                                                                                                                                                                               |

> **Update (2026-07-10):** `en` now runs on **assemblyai-universal-3-5-pro** (see §11 —
> best measured en WER, 15.5). All other slots unchanged; the floor re-test in §11.3
> re-confirms Gemini for the floor.

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

## 10. Watchlist — MAI-Transcribe-1.5 (assessed 2026-06, not yet evaluated)

Microsoft AI's in-house STT (preview, version 2026-06-02), served via the **LLM Speech API
on the Azure Speech resource we already have** (`AZURE_SPEECH_KEY`/`AZURE_SPEECH_ENDPOINT`
— same creds as `azure-speech-batch`; synchronous multipart REST, ≤300 MB WAV/MP3/FLAC).
Being on Azure is a real plus: no new vendor or billing relationship, and integration is
~80 lines next to `lib/providers/azure-speech.ts`.

- **Claims:** best-in-class WER across 43 languages (FLEURS), #3 on Artificial Analysis
  (2.4%), ~1 h of audio in <15 s (≈5× faster than gemini/scribe/gpt-4o-transcribe),
  $0.36/hr (standard-audio SKU, ≈ gpt-4o-transcribe).
- **Disqualified from the §7 stack today: no diarization** (docs are explicit — it joins
  the mistral/alibaba/omni zero-diarization bucket) and **segment-level timestamps only**
  (Azure's feature matrix marks word-level ❌ for MAI). Diarization is on Microsoft's
  public roadmap — **re-assess when it ships**; combined with the WER claims it would
  challenge azure-openai's fr/es/ar/ru slot, and possibly en.
- **Genuinely novel for us: `phraseList` entity biasing** (1.5 only) — inject a roster of
  current officeholders / "UN80" / resolution symbols at transcription time, applied
  contextually (Microsoft claims up to 30% WER gain on keyword-heavy audio). This is
  exactly the _external_ hallucination mitigation §6.1 calls for, but inside the provider.
  Worth a targeted test against the §9 entity criteria.
- **Open questions for an eval run:** (a) `zh` is missing from the model's language table
  despite the "43 languages" claim — smoke-test before any Chinese conclusions; (b) it's
  LLM-family with a "readability-optimized" default (i.e. it edits — set
  `transcribeStyle: "verbatim"`), so check the Keita→Kanem trap (V1); (c) multi-lingual
  mode is the default — check floor behavior (V5), though no diarization rules out the
  floor slot for now.
- Docs: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe>
  (model page) and `.../llm-speech` (API + feature matrix).

## 11. AssemblyAI Universal-3.5 Pro (evaluated 2026-07-10)

Ran phases 0–1 of [`PLAN-universal-3.5-pro.md`](PLAN-universal-3.5-pro.md) plus a full
S/PV.10156 metric pass. Production `en` had already been flipped to 3.5 Pro on 2026-07-09;
this eval confirms that flip and settles the floor question. **18 native languages** — five
of the six UN languages; **Russian is not among them** (confirmed against the current
supported-languages docs) and falls back to universal-2.

**Verdict per slot: keep `en` on 3.5 Pro (best en WER measured); everything else stays.
The floor stays Gemini — hard disqualify, two distinct failure modes (11.3).**

### 11.1 Pinned-model probe (§5.2c): you cannot pin

`speech_models: ["universal-3-5-pro"]` (no fallback) + `language_code: "ru"` is **not
rejected**: HTTP 200, a `metadata.warnings` note ("'ru' is not supported in universal-3-pro
— transcription is handled by universal-2"), and the job is silently served by
`universal-2` (`speech_model_used` confirms; it is populated on every response and is the
only reliable signal of which model ran). Routing can never rely on pinning; the fallback
happens with or without universal-2 in the array.

### 11.2 WER, S/PV.10156 (normalized WER %, paired with the §2 table)

| track | u3.5-pro | best in §2 | reading |
| ----- | -------: | ---------------- | ------- |
| en    | **15.5** | gemini 15.7      | **new best**; beats u3-pro (16.3) — confirms the prod flip |
| fr    | **52.7** | gemini 52.7      | ties best (u3-pro was 54.2) |
| es    | **59.2** | u3-pro/alibaba 59.5 | new best by a hair |
| ar    | 83.9     | gemini-3.5 81.8  | mid-pack (azure 84.3); newly-native ar does not win |
| zh    | 97.0     | fun-asr 94.6     | behind; no reason to touch `zh` |
| ru    | 62.7     | gemini-3.5 61.7  | **served by universal-2** (fallback), ≈ azure 62.8 |
| floor | **32.3** | gemini 32.9      | 9-min mostly-English floor; detection picked en → 3.5 Pro, and it **code-switched the Chinese passages natively** (9.5% CJK) — vs 0% under the old bugged request |

Single 9-min meeting — same caveats as §2. `ru` at 62.7 means U-2-via-fallback is
*competitive* with azure on the interpretation track (a mild vendor-consolidation option,
**not** a 3.5 Pro win), and the Russian text reads as fluent, correct Russian.

### 11.3 The floor experiment (V5, S/PV.10153) — hard disqualify

The §4 correction re-run, with `language_detection: true` now actually sent. Consensus
target: ~75% Latin / ~10% Arabic / ~13% Cyrillic / ~3% CJK.

| arm | request | result |
| --- | ------- | ------ |
| A. detection on, `[u3.5-pro, u2]` | detection → **"ru"** (confidence 0.33) → whole file to **universal-2** | **98.7% Cyrillic**: the entire 80-min floor rendered as Russian. France's *French* statement becomes fluent-but-wrong Russian ("его выставку" for his briefing, "Агенции Национальной Атомности" for the IAEA), with looping artifacts over the Chinese opening |
| B. same, u3-pro (control) | identical route | **byte-identical output** to arm A — the model version never mattered; routing decides everything |
| A′. `language_code: "en"` forced (true dominant language), pinned u3.5-pro | file actually reaches 3.5 Pro | script mix **86.2 / 11.0 / 0.0 / 2.9** — zh/ar/fr transcribed natively and well (code-switching is real for the 18 languages), but **Cyrillic 0%**: Nebenzia's Russian statement comes out as **hallucinated English** ("NATO and Pony was a very global chase… he addressed Brazil's Barack Obama") — not dropped, not romanized: invented content |

Both routes hit the §6.1 hallucination class, at larger scale than Gemini ever showed:
arm A hallucinates over *the whole file*, arm A′ over *every Russian statement*. Per the
plan's pre-registered decision rules ("emits plausible-but-wrong text → hard disqualify"):
**the floor slot stays `gemini-3-flash`**, now for a precise, understood reason — one-model-
per-file routing + no Russian — rather than the confounded §4 one. Also note the floor's
"ground truth" here is the English PV (documents.un.org ignores the unknown `l=floor`
param), so floor WER *penalizes* faithful as-spoken transcription — script mix plus reading
the passages is the metric that decides, and WER on multilingual floors should not be
trusted at all.

### 11.4 Not yet run (from the plan)

- **`keyterms_prompt` entity probe** (§5.4, the UN80/Keita roster test) — the one genuinely
  novel capability still untested; would also validate the external-roster idea for other slots.
- **Diarization calibration** (§5.3, V1/V3) — 3.5 Pro claims its best diarization yet;
  u3-pro was erratic (30 spurious speakers on V1).
- **Full 20-session metric sweep** (§4 of the plan) — only worth it to contest `ar`
  (83.9 vs azure 84.3 is within single-meeting noise) or to CI-confirm the `en` win.

## 12. Google Chirp 3 floor probe (evaluated 2026-07-10)

Chirp 3 (`google-chirp-3`) was in the original standing-corpus metric sweep (mid-pack on
every language, best on none, second-worst `ar`) but was never floor-tested and dropped out
of the 2026-05 manual study. Its docs say `languageCodes: ["auto"]` transcribes "in the
dominant language" — probed on V5 (S/PV.10153) to see what that means in practice.
**Disqualified for the floor slot; four independent reasons:**

1. **60-minute hard cap.** `BatchRecognize` rejects the 80-min floor file outright
   ("Only audio files up to 60 minutes long are supported"). Many SC meetings run longer;
   any production use would need a chunking layer. The probe split the file into two
   <60-min halves.
2. **Silent whole-statement deletion.** On the halves, Nebenzia's 5-min Russian statement
   and Bahrain's Arabic statement are **completely absent** — the transcript jumps from
   "…the Russian Federation to make his statement." straight to "I thank the representative
   of the Russian Federation for his statement." Combined output is 38k chars vs the ~57k
   six-provider consensus: roughly a third of the meeting is gone, with no error or marker.
3. **Cross-language rendering.** The President's *Chinese* opening comes out as fluent
   **English** ("I announce the Security Council's 10,153rd meeting is now open…") —
   translation/hallucination, not transcription. French statements, by contrast, survive
   natively. Script mix on the halves: **100.0% Latin** (consensus: ~75/10/13/3).
4. **No diarization with `auto`** — each half returns a single utterance.

Inconsistent with length: on the 9-min V2 floor (S/PV.10156) Chirp *did* keep the Chinese
opening in native script (8.6% CJK — with per-character spacing artifacts and a garbled
meeting number, normalized WER 44.0 vs 32.3 for u3.5-pro on the same track). So short files
get per-segment behavior, long files get dominant-language flattening plus deletions —
either way it cannot be trusted on multilingual floor audio. Floor stays `gemini-3-flash`;
the floor now has three distinct architecture-level failure modes on record (AssemblyAI
whole-file routing §11.3, Chirp deletion/translation, azure gavel-leak §4).

## 13. Watchlist — floor-slot challengers (researched 2026-07-10, none yet evaluated)

Web research for "handles mixed-language audio like Gemini, hallucinates less". Requirements:
per-segment code-switching across all six UN languages (not whole-file routing — §11.3),
diarization + timestamps, classic-ASR error family, 80–180 min files. Ranked:

| candidate | code-switching | six langs | diarization | price | risk / unknown |
| --- | --- | --- | --- | --- | --- |
| **Speechmatics Melia** (melia-1, 2026-06-17) | documented, per-word lang labels, batch `language: "multi"` | ✅ all six | ✅ (no speaker-count hint) | $0.129/hr | 3 weeks old, "production preview"; accuracy pegged to their *Standard* (not Enhanced) tier; mixed-script fidelity undocumented |
| **Soniox v5** (stt-async-v5, 2026-06-11) | documented mid-sentence, per-**token** `language` + `speaker` | ✅ (60+) | ✅ | $0.10/hr | architecture undisclosed; zero non-English public benchmarks; 300-min cap is fine |
| **Azure LLM Speech enhanced mode** (non-MAI; same `AZURE_SPEECH_*` creds as azure-speech-batch) | docs *demonstrate* en→zh→fr mixed-script sample with per-phrase `locale` | ✅ | ✅ with `maxSpeakers` + word timestamps | ~gpt-4o-transcribe class | LLM-family (unnamed Microsoft multimodal) → hallucination risk unquantified; `confidence` always 0; preview rate limits; 5 h/500 MB cap is ample |
| **ElevenLabs Scribe v2 re-test** | already proven faithful on V5 (§4 consensus row) | ✅ (90+) | ✅ — and the §3 over-split (34–41 spk) has two documented knobs we never used: `diarization_threshold` (default ~0.22) and `num_speakers` (PV gives the true count) | $0.22/hr (2026-05 price cut) | en WER still worst of serious set; language labels only chunk-level |
| **Qwen3-ASR-1.7B open stack** (2026-01, Apache 2.0) + pyannote community-1 | per-utterance LID; unproven mid-sentence | ✅ (30) | via pyannote (3-component pipeline) | GPU self-host | best anti-hallucination evidence of any candidate (38× fewer insertions than whisper-small, defined empty-on-non-speech); but 20-min chunks, aligner lacks Arabic, real infra lift. API cousin = our `alibaba-qwen3-asr` (floor-faithful, no diarization) |

Ruled out: **Deepgram** (Nova-3/Flux `multi` = 10 langs, still no ar/zh), **OpenAI**
(gpt-4o-transcribe-diarize: 25-min/25 MB cap, documented language-leaking, no
prompt/logprobs on the diarize variant; no Whisper v4 exists), **Gladia Solaria-1**
(real per-utterance switching but Whisper-family, 135-min cap, ~$0.61/hr — only if the
above fail), **MAI-Transcribe-1.5** (§10: diarization *still* "What's next" as of
2026-07; re-check when it ships), **NVIDIA Canary/Parakeet open checkpoints** (no ar/zh),
**Meta Omnilingual ASR** (no code-switching, 40 s chunks), **vanilla Whisper**
(romanizes/translates off-window).

Pattern worth noting: every proprietary candidate that *documents* per-segment
code-switching (Melia, Soniox, Gladia) shipped it in 2025–2026 — the capability barely
existed when §7 was decided. Suggested experiment: a 4-arm V5 floor bake-off
(melia-1, soniox-v5, azure-llm-speech, scribe-v2 with `diarization_threshold`≈0.35 +
`num_speakers` from PV), scored on script mix vs the ~75/10/13/3 consensus, a read of the
Nebenzia (ru) and Bahrain (ar) passages, and speaker count vs the PV's 17 — total cost
<$2, ~4 new provider entries in `lib/providers/`.

### 13.1 Bake-off results (run 2026-07-10, V5 floor, 80 min) — two viable challengers

All four arms ran (Soniox after the account was funded; Azure LLM Speech after a new
Foundry resource `foundry-transcripts-notheurope` was deployed in northeurope — tenant
policy `DenyNotAllowedLocations` allows northeurope/centralus/eastus2/southeastasia/
eastasia/westeurope, and of those only northeurope + southeastasia have enhanced mode).
Two gotchas cost real time and look like other errors: **enhanced mode only answers on
the `<resource>.services.ai.azure.com` hostname** — the same request on the same
resource's `cognitiveservices.azure.com` hostname returns the *same* "Enhanced mode is
currently not supported yet" 400 as a wrong region does; and `lib/load-env` uses
`override: true`, so `.env` silently beats CLI-provided env vars (`AZURE_SPEECH_*`
overrides on the command line do nothing).

| arm | script mix L/A/C/CJK (target 75/10/13/3) | speakers (≈15–16 true) | coverage | Nebenzia (ru) passage |
| --- | --- | ---: | ---: | --- |
| **soniox-stt-async-v5** (six-language `language_hints`) | **73.6 / 10.1 / 13.1 / 3.2** | **5** ⚠️ | **98.3%** | near-verbatim vs the PV, correct "Гросси"; per-token labels clean (ru 12.9, no uk) |
| **azure-llm-speech** (enhanced mode, northeurope) | **74.8 / 10.0 / 12.5 / 2.6** | **14** | **98.4%** | body is PV-grade Russian — but the opening sentence leaked into **Spanish**, and Bahrain's Arabic opens in **English**: statement-boundary language leakage, the §5 azure class in mild form |
| **speechmatics-melia-1** (+ six-language `language_hints`) | **73.6 / 10.3 / 13.0 / 3.0** | **17** | 97.4% | correct Russian tracking the PV; residual Ukrainian-tinged spellings ("апарата", "енергии") + acoustic slips (МГАТЭ, "Гроссе") |
| **elevenlabs-scribe-v2-tuned** (`diarization_threshold: 0.35`) | **73.1 / 10.9 / 12.7 / 3.3** | **14** | 93.2% | **flawless Russian**, near-verbatim vs the PV, correct МАГАТЭ |
| gemini-3-flash (incumbent, §4) | 75.3 / 9.5 / 12.1 / 3.1 | — | 75.7% | good; name-hallucination class remains |

Both challengers transcribe all six languages natively in-script (President's Chinese
opening, Bahrain's Arabic, France's French all read correctly against the PV), and both
fail in the **classic-ASR family** — no invented content observed in any sampled passage.
Findings that change standing judgments:

- **ElevenLabs' §3/§8 disqualification is fixed by one parameter.** `diarization_threshold`
  0.35 → **14 speakers** where the default gave 34–41. (The two knobs are mutually
  exclusive — the API rejects `num_speakers` + `diarization_threshold` together.) Its
  Russian was the cleanest of any provider we have ever run on this file. Remaining
  weaknesses: coarse utterances (25 for 80 min; one spans ~8 min) and the known en-WER gap.
- **Melia is the structural best-fit**: per-word language labels, 17 well-calibrated
  speakers, 80 min processed in ~40 s, $0.129/hr (free 10 h/mo). One real defect found:
  **unhinted**, it rendered the first ~half of the Russian statement in **Ukrainian**
  (labels split uk 6.4 / ru 6.3) — correctly-heard content, wrong East-Slavic orthography.
  Six-language `language_hints` (now the provider default; unhinted run preserved as
  `speechmatics-melia-1-nohints`) eliminate the uk labels and most, not all, of the
  orthography bleed. Melia smoke WER on V2 floor: 33.5 norm (leaders 32.3–32.9).
- **Soniox has the best text, worst diarization.** Cleanest per-token language labels
  (ru 12.9%, no uk confusion — unlike unhinted Melia), highest coverage (98.3%),
  PV-grade Russian and Arabic, native zh with real punctuation, and the best V2-floor
  WER **of any provider ever run on that track** (32.0 norm vs u3.5-pro's 32.3, gemini's
  32.9). But it merged the meeting into **5 speakers** (truth ≈15–16) — the inverse of
  ElevenLabs' old failure. French had one notable acoustic slip ("l'Agence internationale
  de la **détermination** atomique"). No speaker-count/threshold knob is documented;
  under-diarization matters less for us than over-splitting since the downstream
  speaker-ID stage re-derives named speakers from context, but it is the weakest hint
  quality of the three.
- **Azure LLM Speech is the accuracy leader with the LLM-family asterisk.** Best V2-floor
  WER ever measured (**30.9** norm, ahead of Soniox 32.0), fastest wall-clock (80 min in
  58 s), 14 speakers, 98.4% coverage, clean per-phrase locale labels (ru-RU 12.4, no uk).
  But both sampled non-Latin statements open with **cross-language leakage** — Nebenzia's
  first sentence in Spanish, Bahrain's in English — before snapping into the correct
  language. That is the §5 azure-openai fingerprint (milder), i.e. exactly the error
  family the floor slot is trying to leave; the three classic-ASR arms showed nothing
  comparable. Also note `confidence` is always 0 and the model is an unnamed preview.
- On V2's 9-min floor all four arms matched or beat the leaders (30.9–33.5 norm WER vs
  English PV).

**Floor verdict update:** Gemini is no longer the only clean all-script option — four
challengers now pass the script test, each with a different weak axis (Soniox:
diarization; Melia: ru orthography bleed; ElevenLabs: en WER + coarse turns;
azure-llm-speech: boundary language leakage + LLM class). The three **non-LLM** arms are
the strategically interesting ones; azure-llm-speech is the accuracy benchmark to beat
but carries the hallucination-family risk. §13.2 runs the §9 anecdotal battery on all
four. Analyzer: `eval/analysis/bakeoff-floor.py`; raw arms under
`eval/results/raw/S_PV.10153/`.

### 13.2 Anecdotal battery on the challengers (run 2026-07-10, floor tracks of V1/V3/V4)

Ran V1 (Keita entity trap, 171 m), V3 (timestamps/structure, 171 m), V4 (accented
English, 40 m) — **floor tracks** rather than the study's original `en` tracks, so the
arms are tested in their exact floor configuration (Melia `multi` is a different model
than Speechmatics' monolingual `en`). `gemini-3-flash` ran as a paired incumbent arm on
the same audio. Scorer: `eval/analysis/bakeoff-entities.py`.

**Headline: the Kanem hallucination reproduced on the incumbent and on none of the
challengers.** On V1, gemini-3-flash wrote "Kanem" ×6 — including *"I give now the floor
to Ms. Diane Kanem, Executive Director of the United Nations Population Fund"* — plus
"UN 2.0"-class UN80 misses ×57 and heavy fragmentation (2,076 utterances, ~12% fewer
chars on V4). All four challengers: **Kanem ×0**; their entity errors are misses or
acoustic mishears, never substitutions of a different real person.

| probe (V1, floor) | melia | soniox | 11labs-tuned | azure-llm | gemini |
| --- | ---: | ---: | ---: | ---: | ---: |
| Keita (good) | 6 | 7 | 4 | 5 | 4 |
| **Kanem (hallucination)** | **0** | **0** | **0** | **0** | **6** ⚠️ |
| UN80 correct / miss-form | 3 / 19† | **27 / 1** | 16 / 4 | 4 / 1 | 2 / 57 |
| speakers (≈8 true) | 46 ⚠️ | **8** | 44 ⚠️ | 19 | 10 |

† Melia's miss-form is "Eighty Initiative" — §6.6 number-spelling drift, not invention.

V4 (accented English): **all five arms** got the historical probe words right
("appalling" not "polling", "cold blood") — the U-2-era acoustic weakness is gone across
the board. Soniox writes "Starobilsk" (the standard Ukrainian transliteration, ×14 —
counted as correct); only ElevenLabs and gemini caught the patronymic "Alexeyevich".
One Soniox mishear worth remembering: "UNFPA–UN Women **merger** assessment" →
"UN Women **Murder** Assessment" — classic-ASR class, loud but not a fabrication.

V3/V1 structure: challenger coverage is uniformly ~97–98% vs gemini's 79–82% (gemini's
coverage metric is deflated by timestamp compression per §6.8, but its char counts also
run ~5–12% short). **Long-audio diarization re-shuffles the §13.1 ranking**: Soniox —
5 speakers on the 80-min V5 — hit **exactly 8 on the 171-min V1** and 18 on V3, while
Melia (46/39) and tuned ElevenLabs (44/39) both **over-split at 171 min** (the
`diarization_threshold: 0.35` fix does not hold at that length). Azure-llm stayed ~19.
No knob is length-aware; whichever arm wins needs a per-duration diarization check.

**Bottom line:** the challengers clear the hallucination gate that keeps Gemini confined
to the floor slot. Remaining decision inputs: a paired multi-session floor sweep and a
diarization-vs-length characterization for the chosen arm. On today's evidence Soniox
has the best overall profile (entities, coverage, V1 diarization, price) with Melia
second (labels, speed) — both strictly better than Gemini on the error class that
matters most. *(§13.3's sweep partially revises this: Soniox's V1 "exactly 8" was its
under-diarization ceiling, not calibration.)*

### 13.3 Multi-session floor sweep + diarization-vs-length (run 2026-07-10)

Seven standing-corpus SC/GA sessions stratified by duration (4/13/22/36/62/114/192 min),
floor tracks, 5 arms (4 challengers + gemini incumbent), paired. WER is floor-vs-English-
PV — absolutes are only meaningful when the floor is mostly English and the PV matches
the video; S/PV.9606 (46% non-Latin), 9614 and 9686 (resumed/continued meetings, PV↔video
mismatch, >94% for every arm) carry no absolute meaning but stay valid as paired deltas.
Roll-up: `eval/analysis/bakeoff-sweep.py`.

**Paired mean normalized WER over all 7 sessions — the incumbent comes last:**

| azure-llm | soniox | elevenlabs-tuned | melia | **gemini-3-flash** |
| ---: | ---: | ---: | ---: | ---: |
| **66.5** | 67.3 | 69.1 | 69.8 | **71.5** |

Gemini loses the paired comparison to every challenger, and by the most on the sessions
with real interpretation-style content: 9578 (Ukraine, 114 m) gemini 60.5 vs azure 45.1 /
soniox 45.4; 9532 (62 m) gemini 83.0 vs azure 74.5. Two structural gemini findings:
coverage 56–94% across the sweep (timestamp compression §6.8 at scale) while its char
counts run ~10% *over* the challengers on long sessions (102k vs ~92k on 9578; 155k vs
~136k on 9686) — over-generation, consistent with its worst-of-all 113.9 on 9686. Script
mix stays consistent across all five arms on every session (e.g. 9578: 14.2–17.0%
non-Latin) — nobody Latin-collapses.

**Diarization vs length (detected / PV-truth), the decisive axis:**

| session (min) | melia | soniox | 11labs | azure | gemini | true |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10100 (4) | 1 | 2 | 2 | 1 | 1 | 1 |
| 9722 (13) | 4 | 5 | 4 | 4 | 4 | 4 |
| 9606 (22, rapid votes) | 5 | 4 | 5 | 5 | 4 | 25 |
| 9614 (35) | 9 | 6 | 9 | 9 | 5 | 24 |
| 9532 (62) | **16** | 3 | 15 | **16** | 6 | 16 |
| 10153 (80) | 17 | 5 | 14 | 14 | 5 | 15 |
| 9578 (114) | **22** | 7 | 21 | 20 | 9 | 22 |
| 9686 (191) | **26** | 6 | **26** | 20 | 12 | 26 |

- **Melia and tuned ElevenLabs are near-perfectly calibrated on formal SC meetings at
  every length ≥60 min** (melia: 16/16, 22/22, 26/26). §13.2's "over-split at 171 min"
  needs re-reading: the UN80 videos are informal briefings with member-state Q&A, and
  the "≈8" truth there was an estimate — 39–46 labels may be closer to the real speaker
  count than 8. Treat the §3-era over-split verdicts with suspicion generally.
- **Soniox under-diarizes systematically**: ≤8 labels regardless of truth (3/16, 5/15,
  7/22, 6/26). §13.2's "exactly 8 on V1" was this ceiling coinciding with the estimate,
  not calibration. Best-in-class text, worst-in-class speaker signal — and no knob.
- Everyone collapses on rapid-fire procedural turns (9606: 25 one-liner speakers → 4–5
  labels for all arms; 9614 similar). Vote-heavy meetings are diarization-hostile.
- Gemini under-diarizes at length too (6/16, 9/22, 12/26).

**Sweep verdict:** every challenger beats the incumbent on paired floor WER; the
non-LLM pick is between **Melia** (calibrated diarization at all lengths, per-word
language labels, ~40 s per 80 min, $0.129/hr paid tier — ru-orthography bleed §13.1 is
its known defect, mostly fixed by hints) and **ElevenLabs tuned** (equally calibrated,
cleanest Russian, but no per-word language labels, ~5× slower, $0.22/hr, historical en
WER gap). Soniox drops to "best raw text, unusable speaker hints"; azure-llm-speech
wins raw WER but stays in the LLM/leakage class (§13.1). A routing flip to Melia (with
`language_hints`) is now defensible on the evidence; the remaining honest gap is a
verbatim-reference WER comparison (interpretation tracks, not floor-vs-English-PV) if
we want a number the §2 table can absorb.

**Harness lessons from this sweep:** sessions serialize (only providers parallelize),
audio downloads dominate wall-clock on long sessions, and the Gemini provider re-downloads
audio the harness already fetched — three cheap fixes before the next big sweep.
Free-tier note: Melia's 10 h/month cap 403s mid-sweep (billing added 2026-07-10).

### 13.4 Silence-dominated audio (V6, SC-Stakeout-Jul13, run 2026-07-13) — new probe class

Discovered in production the day the floor flipped to Melia: a **186-min Security Council
Media Stakeout** — a corridor feed that is hours of ambience with minutes of speech —
produced a junk transcript on the live site (repetition loops, `<unk>`, noise detected as
ar/fa; ~25 chars/min where real speech runs ~700). Transcript deleted; the video is now
corpus entry **V6** (`SC-Stakeout-Jul13`), probing **hallucination-over-non-speech** — a
content class no §9 video covered (V4's "noise" was disfluent *speech*, not silence).

| arm | chars | chars/min | speakers | behavior on ambience |
| --- | ---: | ---: | ---: | --- |
| azure-llm-speech | 3,782 | 20 | 9 | sparsest; locale labels churn across he/pl/el/fi on noise; one Hebrew junk passage |
| speechmatics-melia-1 | 7,296 | 44 | 3 | the production failure: sparse junk, 4 `<unk>`, noise as Arabic |
| elevenlabs-tuned | 7,365 | 54 | 3 | sparse; one Persian-ish junk passage where azure emitted Hebrew |
| soniox | 9,371 | 57 | 5 | sparse junk early; **correctly transcribes the real corridor small talk** at 141 m |
| **gemini-3-flash** | **98,560** | **529** | **284** ⚠️ | **fabricates a full meeting**: loops ("Yes, yes, yes. I'm sorry, I'm sorry." ×dozens), an invented Persian *news broadcast naming Dujarric and Guterres*, a fabricated formal Turkish speech ("Sayın Başkan, değerli üyeler…") — 13× everyone's volume, spread over 284 fake speakers |

Window-paired reads (9–11 m, 60–62 m, 100–102 m): where challengers are silent, gemini
writes coherent invented content. **The switch away from Gemini made this failure
smaller, not larger** — the incumbent would have published a 98k-char fabricated meeting
where Melia published 7k of visible junk.

**Standing issue for ALL providers:** even the challengers' sparse junk reaches the site
as a "completed" transcript. Mitigation is pipeline-level, not provider-level: a
**junk gate** on chars/min + repetition + script-churn signals (mark low-speech
transcripts as error instead of publishing), ideally plus an ffmpeg `silencedetect`
pre-check that skips or trims silence-dominated recordings before spending on
transcription. Melia cannot filter server-side (audio filtering unsupported).

## 14. The English track — floor challengers vs AssemblyAI (run 2026-07-13)

Phases 1–2 of [`PLAN-single-vendor-consolidation.md`](PLAN-single-vendor-consolidation.md).
**20 standing-corpus sessions × the `en` track × 6 arms**, plus the §9 anecdotal battery on
the `en` tracks of V1/V3/V4. Motivation: English is **96% of production audio** (1 811 h of
1 894 h, queried 2026-07-13) — it is the only STT slot where quality or money is at stake —
and the one procurable non-Azure vendor slot should go to whoever serves it.

**Verdict: `en` does NOT move to Speechmatics. The strongest challenger is
`azure-llm-speech` — better WER, passes the hallucination gate, and is already procured.
The incumbent has a newly-found defect: it stops diarizing on long meetings.**

### 14.0 A harness bug invalidated absolute WER on every vote-bearing meeting

`normalizeGroundTruth` ends its vote-roll-call match with a lookahead for the next speaker
label (`^The President`), but stripped **speaker labels first** — destroying that terminator.
The lazy `[\s\S]*?` then ran to the end of the document, deleting every line after
"In favour:" from the reference, *including genuinely-spoken content* (the President's closing
remarks). Providers transcribe that speech correctly and were charged phantom **insertions**.

On S/PV.10100 the reference was 261 words instead of 378, and AssemblyAI scored **82.5%
instead of 30.6%** — 187 of its 221 "errors" were insertions of words that were actually said.
Fixed by reordering (`eval/metrics/ground-truth-normalizer.ts`), guarded by
`ground-truth-normalizer.test.ts`. **Absolute WERs in §2/§11.2/§13.3 for any meeting with a
recorded vote are inflated and should not be quoted;** paired rankings largely survive.

### 14.1 Paired WER (16 sessions; 4 PV↔video-mismatch sessions excluded)

Bootstrap 95% CI over per-session paired deltas vs the incumbent. Excluded 9606/9614/9732/9686
— every arm scores >85% there, so the record does not match the recording. **The ranking is
identical with them included** (n=20).

| arm | mean WER | Δ vs incumbent | 95% CI of Δ | sessions won | verdict |
| --- | ---: | ---: | --- | ---: | --- |
| **azure-llm-speech** | **43.8** | **−1.0** | **[−2.0, −0.2]** | **13/16** | **better** |
| soniox-stt-async-v5 | 44.2 | −0.6 | [−1.7, 0.3] | 10/16 | tied |
| **assemblyai-universal-3-5-pro** *(incumbent)* | 44.8 | — | — | — | — |
| speechmatics-enhanced | 45.8 | +1.0 | [−0.3, 2.0] | **2/16** | consistently, slightly worse |
| speechmatics-standard | 46.4 | +1.6 | [0.5, 2.6] | 2/16 | worse |
| elevenlabs-scribe-v2-tuned | 48.2 | +3.4 | [1.9, 5.3] | 1/16 | clearly worst |

**Read Speechmatics Enhanced carefully.** Its mean-delta CI includes zero, so the CI test says
"no significant difference" — but it wins **2 of 16** sessions (sign test p≈0.002). The honest
statement is *consistently* worse than AssemblyAI by a *small* margin (~1 WER point), not
equivalent. Standard is worse still, exactly as the vendor's own accuracy table predicts
(enhanced "Highest" > standard "High").

ElevenLabs confirms §5/§8: tuning its diarization did nothing for its English text — it remains
the worst of the serious set.

### 14.2 Hallucination gate (V1, `en`) — **all six arms pass**

Pre-registered as the one binary, non-negotiable rule: any Kanem-class substitution (a
*different real person's* name, confidently) disqualifies an arm for `en` regardless of WER.

| probe (V1 `en`, 171 m) | assemblyai | azure-llm | sm-enh | sm-std | soniox | 11labs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Keita (good) | 6 | 3 | 5 | 6 | 8 | 2 |
| **Kanem (hallucination)** | **0** | **0** | **0** | **0** | **0** | **0** |
| UN80 correct | 11 | 6 | 9 | 6 | **48** | 21 |
| UN80 miss-form | 1 | 1 | 1 | 5 | 1 | 3 |
| speakers | **1** ⚠️ | 20 | 43 | 42 | 22 | 39 |

**Nobody hallucinates on the English track** — including `azure-llm-speech`, the LLM-family arm.
Its floor defect was *cross-language leakage* (§13.1), and on a monolingual track there is
nothing to leak into. That hypothesis held. (It was also the *sparsest*, best-behaved arm on the
V6 silence probe — §13.4 — so it is not a Gemini-style confabulator.)

### 14.3 **The incumbent stops diarizing on long meetings** — new finding

| file | assemblyai | azure-llm | sm-enh | sm-std | soniox | 11labs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V1 (171 m, 147 k chars) | **1 speaker / 1 utterance** ⚠️ | 20 | 43 | 42 | 22 | 39 |
| V3 (171 m, 141 k chars) | **2 speakers** (longest utterance **15.9 min**) ⚠️ | 17 | 35 | 35 | 30 | 35 |

Confirmed at the API level, not a parsing artifact: AssemblyAI's own response carries
`utterances: 1` and a single word-level speaker `"A"` across **22 837 words** of a 171-minute
meeting. It diarizes fine on shorter files (mean 9.6 speakers over the standing corpus, whose
sessions are ≤90 min) and **collapses on the long ones**. Both 171-min files fail.

This matters in production: our pipeline feeds provider diarization to the GPT-5.4 speaker-ID
stage **as hints**. On long meetings — routine for GA briefings — AssemblyAI supplies *no
speaker signal at all*. Every challenger handles the same audio. This is a real, previously
undocumented quality defect in the slot carrying 96% of our audio.

### 14.4 Accented English (V4) — Speechmatics fails the historical probe

| probe | assemblyai | azure-llm | sm-enh | sm-std | soniox | 11labs |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| "appalling" (not "polling") | ✅ | ✅ | ❌ **"polling"** | ✅ | ✅ | ✅ |
| "cold blood" | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| "Starobelsk" | 12 | 13 | 7 | **0** ❌ | 14 | 14 |
| patronymic "Alexeyevich" | 0 | 0 | 0 | 0 | 0 | **2** |

**Speechmatics Enhanced reproduces the U-2-era mishear** that every other arm now passes:
*"Equally, **polling** was the statement…"* for *"Equally **appalling** was the statement…"*.
Standard gets that one right but misses the place name "Starobelsk" entirely (0 of ~13). Only
ElevenLabs caught the patronymic — unchanged since §6.7.

### 14.5 Decision — and the procurement math

**English = 1 811 h to date and growing.** Lifetime cost at each arm's rate:

| arm | $/hr | 1 811 h | procurement |
| --- | ---: | ---: | --- |
| **azure-llm-speech** | ~gpt-4o class | **~$0 marginal** | **already procured (Azure)** |
| soniox-stt-async-v5 | 0.10 | ~$181 | new vendor |
| assemblyai-3.5-pro *(today)* | 0.23 | ~$417 | new vendor |
| speechmatics-enhanced | 0.40 | ~$724 | shares the floor's slot |
| speechmatics-standard | 0.24 | ~$435 | shares the floor's slot |

- **Speechmatics does not take `en`.** It is consistently (if slightly) worse on WER, it fails
  the accented-English probe, and Enhanced costs 1.7× the incumbent. §0.2 of the plan predicted
  this and the data confirmed it: **`melia-1` cannot run monolingual** (it requires
  `language: "multi"`), so Speechmatics-on-English is the Ursa 2 stack — a *different model*
  from the one that won the floor. The §13 floor evidence transferred at zero strength, exactly
  as feared. **Floor stays Melia; that decision is untouched.**
- **`azure-llm-speech` is the strongest candidate for `en`**: best paired WER, passes the
  hallucination gate, diarizes long meetings the incumbent cannot, and is **already procured** —
  which would free the one non-Azure slot for Speechmatics on floor (Config C of the plan).
  Caveats before flipping: it is an **unnamed Microsoft preview**, `confidence` is always 0, and
  it threw one HTTP 500 and one hard failure across ~26 runs (retry needed). Reliability, not
  accuracy, is its open question.
- **Soniox is the value option** — statistically tied with the incumbent, $0.10/hr, passes the
  gate, diarizes long files (30 speakers on V3). Its floor-track under-diarization (§13.3) does
  not appear on `en`.
- **The incumbent is not safe by default.** §14.3 means staying on AssemblyAI has a real,
  quantified cost on long meetings, not just an opportunity cost.

### 14.6 Not run

- The **vocabulary-roster probe** (`keyterms_prompt` / `additional_vocab`) — deferred again.
- **Phase 3** (fr/es/ar/ru/zh) — deliberately dropped: those five tracks are 45 h of production
  audio *in total*; the eval would cost ~7× the spend it optimizes. Revisit if their volume grows
  (the user notes an unrelated failure mode is currently suppressing non-English usage).

## 15. azure-llm-speech across all six languages (run 2026-07-13/14)

Scoped Phase 3: the §14 winner against each language's incumbent. **azure-llm-speech beats or
ties every incumbent on every language**, and is the only provider that could plausibly serve
all six from a slot we already pay for.

### 15.0 What `azure-llm-speech` actually is — read this before trusting it

**"Enhanced mode" is a serving surface, not a model.** Omitting `enhancedMode.model` — which is
what we do — routes to Microsoft's **unnamed default speech-LLM** ("multimodal model" /
"renewed speech-LLM model" in the docs; never identified). It is **not** MAI-Transcribe (§10):
that is a separate, named model you opt into via `enhancedMode.model: "mai-transcribe-1.5"`.

Three consequences, all material for a slot carrying 96% of production audio:

1. **The model is unnamed and unpinnable, and Microsoft has already silently swapped it once**
   ("renewed speech-LLM model", Build 2026) under the same request shape. There is no version
   identifier. What we validated here is not guaranteed to be what runs next month.
2. **`confidence` is always 0 — documented and intentional**, removing the cheapest
   hallucination tripwire. Any junk gate (§13.4) needs a different signal.
3. **No retry on 5xx.** Microsoft's own docs prescribe 5 retries with exponential backoff
   (2/4/8/16/32 s) on 429/500/502/503/504 and note the API "might accept a request but time out
   while generating the response". Our provider has none, and this sweep saw both HTTP 500s and
   timeouts.

### 15.0a "Verbatim" is a non-issue — I had this backwards

An earlier draft of this section listed "no configuration gives verbatim + diarization together"
as a blocker. **That was wrong, twice over.** Recording the correction because the reasoning
generalizes.

The docs say of `mai-transcribe-1.5`: *"By default, the model returns a readability-optimized
transcript. You can set the value to `verbatim` to preserve the original spoken content,
**including filler words and disfluencies**."* So "readability-optimized" means *fillers and
disfluencies are removed* — and `transcribeStyle` exists only on mai-transcribe, which cannot
diarize.

Why that does not matter:

1. **We do not want fillers.** "Verbatim record" in the UN sense means *not a summary record* —
   it does not mean "transcribe every 'uh'". The PV itself is professionally edited with
   **fillers removed and grammar cleaned** (this is exactly why our WER floor is 15–40%, see
   `eval/README.md`). A model that drops fillers moves *toward* the reference, not away from it.
   Filler-stripping would be a small WER *win*, not a fidelity loss.
2. **The model we actually use doesn't strip anything anyway.** Verified on cached transcripts
   at zero cost — 7 arms on identical `en` audio:

   | arm | words (S/PV.9578) | fillers /1k words |
   | --- | ---: | ---: |
   | azure-llm-speech | 14 869 | 0.5 |
   | assemblyai-3.5-pro | 14 913 | 0.2 |
   | speechmatics-enhanced | 15 011 | 0.1 |
   | soniox | 14 899 | 0.1 |
   | azure-gpt-4o | 15 079 | 0.6 |
   | elevenlabs-tuned | 15 229 | **6.6** ← the only arm that really marks disfluencies |

   azure-llm's word count sits within **0.3%** of classic ASR and it keeps *more* fillers than
   AssemblyAI. Side-by-side passage reads are word-for-word identical apart from ordinary ASR
   noise (capitalization, comma-vs-period, "Ruhans"/"Luhansk"). **It is not paraphrasing,
   compressing, or summarizing** — "readability-optimized" on the default model is display
   formatting (punctuation, casing, ITN), not content rewriting.

The real content risk was never fillers; it was *paraphrase*. That is what was tested, and it
is absent. The remaining blockers are governance (unpinnable model) and plumbing (no retry, no
confidence) — not fidelity.

Config fix found while running this: **`locales` requires full BCP-47**. A bare ISO code is
rejected (`400 InvalidLocale`); `zh-Hans` is rejected too (must be `zh-CN`). Omitting `locales`
entirely leaves the service in **multi-lingual auto-detect**, which is how §14's English numbers
were produced — i.e. the challenger ran *handicapped* and still won. All §15 numbers (and a
re-run of `en`) pin the locale. On Arabic, pinning produced byte-identical output to
auto-detect, so the handicap was nominal.

### 15.1 Paired WER vs each incumbent

Bootstrap 95% CI over per-session paired deltas. Each language is scored on the **identical
session set** across its arms; four PV↔video-mismatch sessions (9606/9614/9686/9732 — the record
does not match the recording) are excluded by a **fixed session list**, not a WER threshold.

> **Methodological correction:** an *absolute* WER floor for detecting mismatch is invalid across
> languages. Arabic and Chinese WER against an edited PV is intrinsically 80–100% for **every**
> provider (§2) — morphology, orthography, CJK scoring — so an 85% floor calibrated on English
> silently excluded 13/15 Arabic sessions and **all 20** Chinese ones. Mismatch is a property of
> the *session*, not the language.

| track | incumbent | incumbent WER | azure-llm WER | Δ | 95% CI | won | verdict |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| **en** | assemblyai-3.5-pro | 43.5 | **42.2** | **−1.3** | [−2.3, −0.6] | 12/14 | **better** |
| **fr** | azure-gpt-4o | 75.0 | **70.5** | **−4.4** | [−6.0, −3.0] | **10/10** | **better** |
| **es** | azure-gpt-4o | 68.7 | **65.2** | **−3.5** | [−6.6, −1.4] | **10/10** | **better** |
| **ru** | azure-gpt-4o | 72.9 | **71.1** | **−1.7** | [−2.5, −1.0] | 11/12 | **better** |
| **ar** | azure-gpt-4o | 89.5 | 89.7 | +0.2 | [−0.8, 1.1] | 3/12 | tie |
| **zh** | alibaba-fun-asr | 97.5 | 98.0 | +0.5 | [−0.0, 1.0] | 4/16 | tie |

Absolute values across languages are **not comparable** (ar/zh are inflated by PV editing and
CJK scoring); only the within-language deltas mean anything.

Note the incumbent it displaces: **azure-gpt-4o-transcribe is a weak holder of fr/es/ar/ru.**
Run on the English track for reference it came **last of seven** (45.4, +1.9 vs AssemblyAI) —
worse than every challenger we tested.

### 15.2 Cross-language leakage — the challenger is *cleaner* than the incumbent

The §5 `azure-openai` fingerprint (Chinese gavel-leak, wrong-language runs) shows up in the
**incumbent**, not the challenger. Off-script % = letters not in the track's expected script:

| track | azure-llm | incumbent | |
| --- | ---: | ---: | --- |
| ar | **0.1%** | **4.4%** (gpt-4o) | gpt-4o leaks Latin into Arabic |
| ru | **0.1%** | 1.7% (gpt-4o) | |
| zh | 1.7% | 1.6% (fun-asr) | wash; zero U+FFFD either side |
| fr / es | 0.0% | 0.0–0.1% | clean both |

No U+FFFD anywhere (the mistral CJK-collapse class, §6.3, is absent).

### 15.3 Coverage — azure-llm transcribes more of the audio

Matched sessions, share of audio duration covered by utterances:

| track | azure-llm | incumbent |
| --- | ---: | ---: |
| fr | **96%** | 81% |
| es | **98%** | 83% |
| ar | **97%** | 87% |
| ru | **97%** | 85% |
| zh | **97%** | 79% |

Content volume is within ±3% of the incumbent on matched sessions for fr/es/ar/ru (zh: 0.93×,
slightly less text than fun-asr). *(An apparent 35% French shortfall vanished once the arms were
compared on the same session set — a reminder to always intersect before comparing volumes.)*

### 15.4 Verdict

**On the evidence, one already-procured provider could serve all six tracks**: strictly better on
en/fr/es/ru, tied on ar and zh, cleaner on cross-language leakage, higher coverage, and it passed
the §14.2 hallucination gate on English.

It also **passes the §14.2 hallucination gate** under the pinned-locale config (V1: Kanem ×0,
18 speakers, 97.5% coverage) — so the one binary, pre-registered disqualifier is cleared.

**But do not flip on this alone.** The blockers (§15.0) are *governance and plumbing*, not
accuracy or fidelity:

1. **Model drift is the real risk.** Unnamed, unpinnable, already silently swapped once. This is
   the one thing that cannot be fixed by code — it needs a **standing regression test** (§15.6)
   so a silent model swap shows up as a diff instead of a quiet quality regression.
2. **Add retries** before any production use — 5x exponential backoff on 429/5xx per Microsoft's
   own guidance. The provider currently has none.
3. **The ar/zh ties buy nothing.** Those tracks are ~15 h of production audio *combined*. Moving
   them adds risk for no measurable gain — leave `zh` on fun-asr.
4. `confidence: 0` means the §13.4 junk gate must key on chars/min + repetition + script churn,
   not provider confidence.

### 15.5a Entity rendering — **the metric winner is the worst at proper nouns**

The single most decision-relevant thing the anecdotal battery found, and it is **invisible to
WER**. On V1, "UN80" is spoken ~56 times (every arm independently hears ~41 instances of the
following word "initiative", so they are all listening to the same mentions). How they render it:

| arm | "UN80" correct | substituted with a **real** UN acronym | non-existent acronym |
| --- | ---: | --- | --- |
| soniox | **48** | UNAIDS ×15 | — |
| elevenlabs-tuned | 21 | — | UNAT ×4 |
| assemblyai-3.5-pro | 11 | UNAIDS ×4 | UNAT ×14, UNAD ×1 |
| speechmatics-enhanced | 9 | — | UNAT ×1 |
| speechmatics-standard | 6 | UNAids ×1 | — |
| **azure-llm-speech** | **6** ⚠️ | — | **UNAT ×36, UNAD ×14** |

**"UN80" is a systematic failure for every provider** — it is a novel initiative name that sounds
like an acronym — but **azure-llm is the worst of all of them**, rendering it correctly 6 times
and mangling it ~50 times into "the UNAT initiative" / "the UNAD initiative". (UNAT *is* a real
UN body — the Appeals Tribunal. UNAIDS is a real UN programme. So both classes put a wrong-but-
real institution in front of a reader.)

WER cannot see this: ~50 mangled tokens in a 22 837-word transcript is **0.2%** of the text. It
does not move the number that decided §14/§15, and it is precisely the kind of error that matters
most in a UN record, where the institution being discussed *is* the content.

This does **not** reverse the WER verdict, but it means:

- **The roster / entity-biasing probe is no longer optional** — it is the top open item. AssemblyAI
  has `keyterms_prompt`, Speechmatics Standard/Enhanced have `additional_vocab`, and
  `mai-transcribe-1.5` has `phraseList`. The **unnamed default speech-LLM we benchmarked has
  neither** — only soft `prompt` steering. A provider that cannot be told "UN80" is a word may be
  structurally unfit for this corpus regardless of its WER.
- **Soniox looks materially better on entities** (48 vs 6) at statistically indistinguishable WER
  and $0.10/hr. It deserves a closer look than its §14 "tied" verdict suggested.

### 15.6 Drift regression test (`regression-azure-llm.ts`)

The unpinnable-model risk (§15.0) cannot be fixed in code — it can only be *detected*. A silent
model swap would otherwise surface as a quiet quality regression across 96% of our audio with no
signal at all.

`eval/analysis/regression-azure-llm.ts` transcribes one short fixed clip (S/PV.10100 `en`,
4.5 min), diffs it against a committed baseline
(`eval/analysis/baselines/azure-llm-speech.en.json`), and exits non-zero if drift exceeds 5%.
Drift is WER **against the baseline transcript**, not against ground truth — we are detecting
*change*, not correctness.

```bash
npx tsx eval/analysis/regression-azure-llm.ts            # check
npx tsx eval/analysis/regression-azure-llm.ts --update   # re-baseline after an accepted change
```

Measured back-to-back: **0.2% drift, 10 s wall clock, ~5 MB audio** — cheap enough to run weekly.
(Speaker count wobbles 1↔2 on this clip and is *not* part of the pass/fail criterion; on 4.5 min
of near-monologue it is noise.)

**Scheduling — a cloud/Claude routine will NOT work.** Two blockers: the check needs
`AZURE_SPEECH_KEY`/`AZURE_SPEECH_ENDPOINT`, which live in gitignored `.env` and are invisible to
a cloud agent; and it needs the code, which lives on a local branch. Run it somewhere that has
the credentials:

- **Local (simplest)** — a weekly `launchd`/cron entry on the dev machine:
  `cd <repo> && npx tsx eval/analysis/regression-azure-llm.ts`
- **Production cron (most robust)** — the app container already holds the Azure creds and has
  cron infrastructure (`docker/crontab.template`, `CRON_SECRET`). This is the right home **if and
  when** `azure-llm-speech` is actually routed in production; until then it guards a provider we
  do not use.

Re-baseline (`--update`) only after *verifying* a change is an improvement — otherwise the
baseline silently absorbs the drift it exists to catch.

### 15.5 Coverage gaps in this run

Interrupted at the disk limit (the audio cache reached 6.9 GB). Sessions scored per language:
en 14, fr 10, es 10, ar 12, ru 12, zh 16 — of 20. fr/es are the thinnest; their CIs are
correspondingly wider, though both show **10/10 clean sweeps**, so the direction is not in doubt.
Nothing was re-transcribed to produce these numbers — `eval/analysis/rescore-cached.ts` rebuilds
`summary.json` from cached transcripts offline (`run.ts --cached-only` would still hit the
network for the unfinished sessions).

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
- fun-asr WER row is **final** (clean re-run done): en 46.6→21.7 after the conditional word-rejoin
  fix; zh 94.6 best of all. (Long-video fun-asr raw is being repopulated in the background for the
  harness; conclusions unaffected.)
