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
matters most.

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
