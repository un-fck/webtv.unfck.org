# STT cross-provider synthesis — 10 providers, 4 videos

Reference-free analysis (the ensemble of providers is the pseudo-reference; where
one diverges from a ≥4-provider majority it's the likely error). Built from the
per-video reports in `eval/analysis/out/<symbol>/REPORT.md` and the deterministic
signals/anomalies from `compare.py`. **WER is now available for S/PV.10156** (its
PV record published mid-project); the other three videos have no verbatim record,
so they're judged on content/structure/consensus only.

Videos: **V1** UN80-Apr06-keita (GA80 UN80 briefing, 171m) · **V2** S/PV.10156 (SC
draft-report adoption, 9m) · **V3** UN80-Apr29 (GA80 UN80 briefing, 171m) · **V4**
Nebenzia-Starobelsk (RU press conf, accented English, 40m).

Providers: `assemblyai` (Universal-2), `assemblyai-u3-pro` (Universal-3 Pro),
`mistral` (voxtral-mini), `gemini` (gemini-3-flash-preview, eval), `gemini-3.5-flash`,
`azure-openai` (gpt-4o-transcribe), `alibaba` (qwen3-asr-flash), `fun-asr`,
`qwen3.5-omni-plus`, `elevenlabs` (Scribe v2). `voxtral-small` was dropped (Mistral's
token-rate tier makes audio-chat transcription impractical — a 60s clip exceeds the
per-minute token budget). **gemini-3.5-flash is preliminary** — still completing its
long-video tracks at time of writing; its headline checks are from finished tracks.

---

## 1. The two error families (the core structural insight)

Providers split by architecture:

- **LLM-based (gemini, gemini-3.5, azure-openai, the omni/chat models):** fail by
  **hallucination** — invent plausible names, terms, and whole sentences over
  noise/accents, and gemini also *drops* audio. Errors are fluent, confident,
  semantically corrupting, and **invisible to WER** (one token). The dangerous class.
- **Classic ASR (assemblyai/U3, alibaba, fun-asr, elevenlabs):** fail by **acoustic
  mishearing** — wrong individual words on accents/names — but stay complete and
  never invent entities. Errors are localized and WER-detectable.

---

## 2. WER — S/PV.10156 (normalized WER %, lower is better)

| provider | en | fr | es | ar | zh | ru |
|---|--:|--:|--:|--:|--:|--:|
| alibaba | **15.2** | **52.5** | 59.7 | 82.9 | 96.4 | **61.6** |
| gemini | 15.7 | 52.7 | 59.7 | 83.2 | 96.4 | 61.9 |
| assemblyai-u3-pro | 16.3 | 54.2 | 59.5 | 87.0 | 100.0 | 62.7 |
| assemblyai | 16.4 | 53.7 | 59.6 | 86.6 | 100.0 | 62.7 |
| mistral | 16.6 | 54.4 | 59.8 | 83.4 | 99.4 | 62.4 |
| azure-openai | 17.7 | 54.1 | 60.7 | 84.3 | **159.9** | 62.8 |
| elevenlabs | 21.1 | 56.6 | 61.1 | 83.3 | 99.4 | 66.3 |
| fun-asr | 46.6 | 56.9 | 60.8 | 85.7 | **95.2** | 66.3 |
| qwen3.5-omni-plus | 97.2 | 79.7 | 79.0 | 85.1 | 107.2 | 75.8 |

Caveats: vs a heavily-edited verbatim record (15–40% is "good"), on a ~9-min meeting,
so directional only. High ar/zh/ru reflects edited-PV + CJK scoring, not raw failure.
- **alibaba and gemini lead** across languages; **u3-pro ≈ assemblyai** on bulk WER (its
  win is on accented *words*, not aggregate).
- **azure zh 159.9%** (>100% = net insertions): the Chinese-gavel-leak + verbose
  hallucination, confirmed.
- **fun-asr en 46.6%** is a *tokenization* artifact — it **drops spaces between English
  words** ("Ambassadorwillmakeastatement") — not a content failure; its **zh is best (95.2)**.
- **qwen3.5-omni-plus en 97.2%**: it transcribed the English audio **in Chinese**
  (`我宣布，安全理事会…`) — ignores language control; unusable as a transcriber.

---

## 3. Speaker diarization

A *separate* axis from transcription accuracy and from utterance granularity. Measured
here as **distinct speaker labels** and **segmentation granularity** per provider on the
`en` track. Anchor truth: S/PV.10156 = **3 speakers** (from its PV); the two UN80
briefings have ~8 (chair + several briefers + delegates); Nebenzia ~3 (PR + moderator + press).

**Caveat:** distinct-speaker *count* is a calibration proxy. It does **not** measure
attribution accuracy (whether the right words go to the right speaker) — that needs
speaker-labeled ground truth (DER/cpWER), which we don't have. So this section assesses
*does it diarize, and is the speaker count in the right ballpark*, plus segmentation.

| provider | V1 (≈8) | V2 (3) | V3 (≈8) | V4 (≈3) | behavior |
|---|--:|--:|--:|--:|---|
| **mistral** | 1 | 1 | 1 | 1 | **no diarization** (always one label) |
| **alibaba** | 1 | 1 | 1 | 1 | **no diarization** |
| **qwen3.5-omni-plus** | 1 | 1 | 1 | 1 | **no diarization** |
| azure-openai | 9 | **3** | 9 | 8 | **best calibrated** — nails V2, ~right on V1/V3, over on V4 |
| gemini | 11 | 2 | 7 | 11 | reasonable on long videos; over-splits V4 |
| fun-asr | 20 | **3** | 14 | 5 | real `speaker_id`s; nails V2, over-splits long videos |
| assemblyai (U2) | 4 | 2 | 2 | 4 | **conservative under-counter** |
| assemblyai-u3-pro | **30** | 2 | 2 | 4 | **erratic** — 30 (spurious) on V1, 2 on V3 |
| elevenlabs | 41 | 2 | 34 | 9 | **over-splits badly** on long audio |
| gemini-3.5-flash | (partial) | 2 | — | — | partial run |

Segmentation granularity is a third, independent axis — e.g. on V2 (9 min):
gemini/azure/fun-asr/mistral emit 60–78 short utterances (~5–8s each), while
assemblyai/U3/alibaba/omni/elevenlabs lump the whole meeting into ~3 long utterances
(~180–244s). Few utterances ≠ good or bad on its own.

**Diarization findings:**
- **Three providers don't diarize at all** — mistral, alibaba (qwen3-asr-flash), and
  qwen3.5-omni-plus return a single speaker label for everything.
- **azure-openai is the best-calibrated diarizer** — it matched V2 exactly (3) and landed
  ~8–9 on the multi-briefer videos (truth ~8), over-counting only on the noisy press conf.
- **fun-asr** has genuine `speaker_id`s and also nailed V2 (3), but over-splits long
  videos (14–20).
- **gemini** is reasonable on long videos (7–11) but over-splits the press conf.
- **AssemblyAI is the weak diarizer of the accurate transcribers**: U2 under-counts
  (2–4 everywhere); **U3-pro is erratic** — 30 spurious speakers on V1, only 2 on V3.
  (Correcting an earlier overstatement: U3 is not uniformly "coarser" than U2 — it's
  *inconsistent*, sometimes over-splitting, sometimes lumping.) Possibly tied to the
  universal-3-pro↔universal-2 fallback switching mid-audio.
- **elevenlabs over-splits** long audio dramatically (34–41 speakers).
- Production note: our pipeline re-derives **named** speakers downstream (GPT speaker-ID),
  so raw provider diarization matters more for the eval than the final product — but a
  provider that emits *zero* diarization (mistral/alibaba/omni) or wildly wrong counts
  gives that stage worse hints.

---

## 4. Per-provider profiles (all 10)

| Provider | Strengths | Characteristic failures | Verdict |
|---|---|---|---|
| **gemini** (3-flash) | Best hard-word accuracy; clean CJK; reasonable diarization; low WER | **Name hallucination** (Keita→"Natalia Kanem"); "UN80"→"UN 2.0" ×29; paraphrases over noise; drops content (V3 78% cov, V4 70%); compressed word-timestamps | High value, but the only one that corrupts *meaning* with confident inventions |
| **gemini-3.5-flash** *(prelim)* | Content complete (after chunking fix); same family strengths | **Still hallucinates "Natalia Kanem"** — newer model, same failure | Not a fix for the core Gemini risk |
| **assemblyai** (U2) | Clean, ~100% coverage, no fffd/loops; accurate recoverable word timestamps | Worst on accented words ("polling", "miners in crime"); under-counts speakers; coarse | Reliable text, weak accents+diarization |
| **assemblyai-u3-pro** | **Fixes accent errors** ("appalling"✓, "cold blood"✓); **~6.5× faster** (117s vs 761s/171min); clean CJK | Erratic diarization (30 vs 2 speakers); ar/zh/ru fall back to U2 | **Straight upgrade over U2** for accuracy+speed |
| **mistral** (voxtral-mini) | Clean Latin text, good granularity | **CJK corruption** (176→3606 U+FFFD, scales w/ length); "polling"; over-generates; **no diarization** | Never use on CJK; mid otherwise |
| **azure-openai** (gpt-4o) | Good granularity; **best-calibrated diarization**; recovers hard words | **Cross-language leakage** (Chinese gavel into every track; zh WER 159.9%); "p p p" loops; hallucinates over noise; worst name inventions | Capable but unstable on multilingual/noisy audio |
| **alibaba** (qwen3-asr-flash) | **Best/joint-best WER** (en 15.2); clean CJK; accurate accented words | Fixed 4-min windows → fake "100% coverage", 3–43 utts, **no diarization** | Strong text engine, useless timestamps/diarization |
| **fun-asr** | **Only new provider with real diarization + fine timestamps**; **best Chinese** (zh WER 95.2) | **Breaks English word spacing** (en WER 46.6); over-splits long-video diarization | Excellent for Chinese / timestamped diarization; not for English text |
| **qwen3.5-omni-plus** | (chat model) | Transcribed English **as Chinese** (en WER 97%); no real timestamps; ignores language hints; no diarization | **Drop for transcription** |
| **elevenlabs** (Scribe v2) | **Best accented-English** accuracy; ~98% coverage; marks self-repairs; clean CJK; no inventions | Turn-level lumping; **over-splits diarization** on long audio | Most trustworthy all-round content engine; coarse timing |

---

## 5. Cross-cutting findings

1. **Name hallucination is Gemini-only and family-persistent.** Only Gemini (both 3-flash
   and 3.5) substitutes a *different real person* ("Natalia Kanem" for Diene Keita) or
   renames a concept ("UN 2.0" for UN80). Latin-script only, intermittent. No
   AssemblyAI/Alibaba/ElevenLabs model ever invents "Kanem". **Upgrading the model does not fix it.**
2. **CJK corruption is mistral-only** and scales with length (176 → 3606 U+FFFD). All
   other providers are clean on Chinese.
3. **"Off" timestamps are almost always *lumping*, not drift.** AssemblyAI exposes accurate
   word-level timestamps (`raw.words`) but groups them into few turn-utterances (a word can
   sit 23 min past its utterance stamp); gemini/mistral/azure/fun-asr are fine-grained and
   agree within ~1–3s. Azure's only "non-monotonic" timestamps were 2 sub-second overlaps in
   1190 utterances — negligible, not a real defect.
4. **Multilingual/interpretation audio breaks language routing.** Azure leaks the floor
   language into other tracks; omni transcribed English as Chinese; on V4 only gemini
   transcribed the Russian floor in Cyrillic (others did the English overlay). The floor
   feed is a systematic hazard.
5. **Proper nouns are everyone's weak spot** — no provider rendered the patronymic
   "Alexeyevich" correctly; place/person names drift across all.
6. **Coverage % is an unreliable per-provider metric:** gemini's low coverage = timestamp
   compression (text complete); alibaba's 100% = chunk padding. Cross-check char counts.

---

## 6. Headline answers

- **Best overall text accuracy:** **alibaba** (qwen3-asr-flash) and **gemini**, with
  **U3-pro the best AssemblyAI** and best on accented English.
- **Best diarization:** **azure-openai** (calibration) and **fun-asr** (real speaker_ids,
  fine timestamps) — but trust fun-asr's text only for non-English.
- **Best accented-English:** elevenlabs and U3-pro (both fixed "appalling").
- **Three providers don't diarize:** mistral, alibaba, qwen3.5-omni-plus.
- **Adopt Universal-3 Pro** over Universal-2 (accuracy + 6.5× speed, same code path).
- **Skip** qwen3.5-omni-plus and voxtral-small for transcription.

---

## 7. High-error-potential criteria for the rigorous eval corpus

Pick videos combining these — each targets a confirmed failure mode:
- **Role-holders who succeeded a famous predecessor** → Gemini name hallucination *(V1)*.
- **Non-Latin script, esp. Chinese** → mistral CJK collapse, azure leakage *(V2)*.
- **Heavily accented / non-native English** → assemblyai-U2/mistral acoustic substitution *(V4)*.
- **Noisy/disfluent segments, embedded clips, applause** → LLM hallucination-over-noise *(V4)*.
- **Long meetings, many short turns** → lumping + diarization miscount *(V1/V3)*.
- **Multilingual floor feed present** → cross-language routing/leak errors *(all)*.
- **Dense proper nouns / numbers / resolution symbols** → spelling drift, misheard figures.

---

## 8. Recommendations

- **Adopt `assemblyai-u3-pro`** in place of Universal-2 wherever AssemblyAI is used.
- **Consider `fun-asr` for the Chinese track** specifically (best zh + real diarization) —
  never for English (spacing defect).
- **Don't adopt** `qwen3.5-omni-plus` or `voxtral-small` for transcription.
- For **diarization quality**, azure-openai and fun-asr are the strongest signals;
  mistral/alibaba/omni give none.
- **Gemini name hallucination** needs a real mitigation (roster cross-check of named
  officials, or post-hoc flagging of role→name substitutions), not a model bump.

## 9. Provider configuration notes (investigated + fixed)

**Both issues below were investigated and the fixes implemented + verified on S/PV.10156.**
A shared async helper (`lib/providers/dashscope-asr.ts`) now backs both providers.

- **fun-asr English spacing — FIXED.** Root cause was discarding fun-asr's word-level
  tokens and using the run-together `sentence.text`. The provider now rebuilds text from
  `words[]` with language-aware spacing (`joinWords`: spaces between Latin/Cyrillic tokens,
  none around CJK). Verified: S/PV.10156 en normalized WER **46.6% → 27.2%**, 0 run-together
  tokens; zh unchanged (~96%). (Spelled-out numbers / ITN remain a separate minor issue.)
- **alibaba → qwen3-asr-flash-filetrans — DONE (now has real timestamps).** The sync
  multimodal endpoint can't emit timestamps/diarization; the provider now uses the async
  `qwen3-asr-flash-filetrans` file API. Verified: S/PV.10156 en now returns **54 timestamped
  sentences + word-level timestamps** (vs 3 lumped, no timestamps before). Tradeoff: en
  normalized WER 15.2% (sync) → **20.3%** (filetrans variant) — slightly higher, but usable
  timing. **Still no diarization** (Qwen-ASR doesn't support it on any interface).
  Note request-shape differences handled in the helper: qwen uses `input.file_url` (string)
  + `output.result`; fun-asr uses `input.file_urls` (array) + `output.results`.

For diarization on DashScope, use **fun-asr** (wired, has `speaker_id`) or **paraformer-v2**.

### Original investigation notes

**alibaba (qwen3-asr-flash) — the missing diarization/timestamps are a model/interface
limit, not a parameter we forgot.** Per DashScope docs, the Qwen-ASR series "does not yet
support" speaker diarization on *any* interface, and when called through the
sync/multimodal (OpenAI-compatible) endpoint it returns a `chat.completion` with **no
timestamp fields** — exactly our plain-text, single-speaker, 1-utterance-per-chunk result.
Options on DashScope:
- `qwen3-asr-flash-filetrans` (async file API): **timestamps yes** (sentence; word via
  `enable_words`), **diarization still no** (`speaker_id` not returned). Switching our
  provider to this would fix Qwen's *timestamps* (it has the best WER), but not diarization.
- For diarization on DashScope, the models that support it are **fun-asr** (already wired)
  and **paraformer-v2** (`diarization_enabled` / `timestamp_alignment_enabled`, returns
  `speaker_id`). So: Qwen for best text+timestamps, fun-asr/paraformer for diarization.

**fun-asr — the English "word spacing" defect, and whether it's fixable.** In some
sentences fun-asr emits English with no inter-word spaces (e.g. S/PV.10156:
`tenthousandonehundredandfifty-sixmeetingofthesecuritycounciliscalledorder.`), interleaved
with correctly-spaced sentences. Extent: ~2% of tokens on Nebenzia, ~5% on S/PV.10156, but
each blob swallows a whole sentence, which is why it wrecks WER (46.6% en) despite content
being mostly present. It's a Mandarin-first model (Chinese has no inter-word spaces) plus no
inverse-text-normalization (numbers spelled out, "ten thousand…" vs "10,156"). Fixability:
- **Cleanest (likely deterministic):** fun-asr's file API returns **word-level tokens**
  (`words[]` with per-word timestamps) which we currently discard (we keep only
  `sentence.text`). Rebuilding the transcript by joining `words[]` with spaces should
  restore boundaries with no guessing — *if* the word tokens are real word units (needs one
  verification run). This is the recommended fix and also gives us word timestamps.
- **Fallback (heuristic, not fully deterministic):** dictionary/Viterbi word-segmentation
  (e.g. wordninja) on the long run-together tokens — decent for lowercase common words but
  errors on proper nouns (Starobelsk, Nebenzia) and casing.
- The spelled-out numbers are a separate ITN issue (own postprocess, also imperfect).

## Method notes / caveats
- Consensus voting localizes anomalies but auto "hallucination" flags have false positives
  (capitalized foreign common words); headline claims were verified against raw transcripts.
- Diarization here = speaker-count calibration + granularity, **not** attribution accuracy
  (no speaker-labeled ground truth). DER/cpWER would need aligning the PV's speaker turns.
- gemini-3.5-flash is **preliminary** (run incomplete); finalize when its long-video tracks land.
- Full evidence tables + timestamps per video: `eval/analysis/out/<symbol>/REPORT.md`.
