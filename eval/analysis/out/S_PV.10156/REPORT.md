# Quality Analysis — S/PV.10156 (UNSC 10156th meeting, 2026-05-22)

Reference-free analysis of 6 STT providers across 6 language tracks (ar, en, es, fr, ru, zh). No official PV record is published, so there is no WER. Method: ensemble consensus + deterministic signals (fffd, coverage, off_script, char counts, utt_count). CJK judged only on measurable signals.

The meeting is ~9.1 min of speech: President opens, Secretariat thanked, the draft annual report of the Security Council to the General Assembly (1 Jan–31 Dec 2025) is adopted per the 13 Dec 2024 presidential note, session closed.

## Per-provider error profiles

- **assemblyai (Universal-2)** — Strongest overall. High coverage (94–98%), no fffd, no script leakage, correct numbers. Lumps into very few utterances (utt_count 1–3), so low granularity, but text is clean and complete.
- **mistral (voxtral-mini)** — One serious defect: CJK corruption. zh track has 176 U+FFFD scattered across most lines (e.g. `��议安全理事会…`). Also bleeds into es (line 173, `��谢白色党代表的发言`, 2 fffd) where Chinese floor audio is present. en/fr/ru/ar clean (0 fffd). Coverage mid-pack (74–81%), good granularity (60–68 utts).
- **gemini (gemini-3-flash, production)** — Text essentially complete (char counts within ~2% of peers; fr ends correctly on "La séance est levée"), but word-level timestamps are compressed: `last_end_min` 3.0 (ar)/6.7–7.7 (others) vs true ~9.1 min. This collapses reported coverage_pct to 33–73% — a timing defect, not dropped content. Finest segmentation (74–136 utts). No fffd, no leakage.
- **azure-openai (gpt-4o-transcribe)** — Good coverage (80–85%) and granularity. Systematic flaw: hallucinates Chinese into the opening utterance of every non-zh track — line 1 of en/es/fr/ru/ar all contain `我宣布安全理事会…` ("I declare the Security Council…"), the gavel rendered from the Chinese floor feed. Drives the small cjk/off_script signal (0.1–0.4%). Minor isolated mishear: fr "le Cazachien" (garbled).
- **alibaba (qwen3-asr-flash)** — Clean text, no fffd, no leakage, complete. But uses fixed 4-min (240000 ms) chunk windows → only 3 lumped utterances and a padded 12.0-min duration, so its "100% coverage" is an artifact, and low chars/min (167–580) is the same inflated-denominator artifact. No usable granularity.
- **elevenlabs (Scribe v2)** — Highest coverage of all (97–99% every track), no fffd, no leakage, complete (slightly higher char counts). Like assemblyai, lumps heavily (utt_count 1–3). Solid but coarse.

## CJK integrity table (zh track)

| Provider     | fffd    | coverage_pct | utt_count | Verdict                                            |
| ------------ | ------- | ------------ | --------- | -------------------------------------------------- |
| assemblyai   | 0       | 97.6         | 3         | Clean                                              |
| mistral      | **176** | 73.7         | 65        | **CORRUPT**                                        |
| gemini       | 0       | 72.8\*       | 136       | Clean text; \*low coverage = timestamp compression |
| azure-openai | 0       | 81.7         | 53        | Clean                                              |
| alibaba      | 0       | 100.0\*\*    | 3         | Clean; \*\*artifact of fixed-window chunking       |
| elevenlabs   | 0       | 98.1         | 3         | Clean                                              |

Only mistral corrupts CJK (176 fffd on zh, confirmed by direct count). Not confined to zh — also es (2 fffd) where Chinese floor audio appears. All five others: 0 fffd on zh.

## Ranked anomaly list

| Severity | Type                     | Lang           | Timestamp         | Providers              | Evidence                                                      |
| -------- | ------------------------ | -------------- | ----------------- | ---------------------- | ------------------------------------------------------------- |
| HIGH     | CJK corruption           | zh             | throughout        | mistral                | 176 U+FFFD; e.g. `��议安全理事会…` (line 8)                   |
| MEDIUM   | CJK corruption (bleed)   | es             | ~line 173         | mistral                | `��谢白色党代表的发言` (2 fffd)                               |
| MEDIUM   | Timestamp compression    | all 6          | back half         | gemini                 | last_end_min 3.0–7.7 vs ~9.1; text complete, timing collapsed |
| MEDIUM   | Cross-lang hallucination | en,es,fr,ru,ar | 00:00:02 (line 1) | azure-openai           | Opening rendered as Chinese `我宣布安全理事会…`               |
| LOW      | Fixed-window lumping     | all 6          | n/a               | alibaba                | 3 utts, padded 12.0 min; "100% coverage" artifact             |
| LOW      | Coarse segmentation      | all 6          | n/a               | assemblyai, elevenlabs | utt_count 1–3                                                 |
| LOW      | Isolated mishear         | fr             | ~line 230         | azure-openai           | "le Cazachien" garbled token                                  |

**False positives (verified, NOT errors):** name_table/proper-noun flags on en/es/fr are mostly capitalized common words (fr "Examen", "Merci", "Conformément", "Ambassadeur"; es "Pronto", "Procuramos", "Complicaron"; en "During", "Further", "Your Excellency"). Institution names agree across all providers. ar number flags (2024/2015) are minor year mishears. No repetition loops (repetition 0.0 everywhere); no genuine dropped passages found.

## Headline findings

- **mistral is the only provider with a content-destroying defect**: 176 U+FFFD on zh plus bleed into es. Do not use mistral for any track that can contain CJK audio.
- **All five other providers produce clean CJK** (0 fffd on zh) — corruption is mistral-specific, as expected.
- **gemini's low coverage is a measurement artifact, not missing speech**: text is complete; its word-level timestamps compress the meeting's second half. Treat gemini coverage_pct as unreliable; content is fine.
- **azure-openai systematically leaks the Chinese opening line into every other-language track** — recurring cross-language hallucination at the first utterance, from the Chinese floor feed.
- **alibaba's "100% coverage" is misleading** — fixed 4-min chunk windows pad duration to 12 min and lump into 3 utterances; fine for raw text, useless for segmentation/timing.
- **For clean complete text, assemblyai and elevenlabs are safest** (high coverage, no defects) but give almost no segmentation; gemini gives best granularity if its timestamps are disregarded/recomputed.
