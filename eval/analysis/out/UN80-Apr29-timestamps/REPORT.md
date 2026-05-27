# UN80-Apr29-timestamps — STT timestamp quality analysis

**Video:** GA 80th session informal plenary briefing on the UN80 Initiative (2026-04-29), ~171 min. Timestamp-quality stress test. Method: ensemble consensus for content; structural + cross-provider analysis for timestamps (no audio listening).

## Timestamp quality table (en track)
| provider | utt_count | last_end | covered | bw jumps (max) | median utt dur | verdict |
|---|---|---|---|---|---|---|
| assemblyai | **84** | 170:57 | 170 min | 0 | 10.4s (25 utts >60s, max 1169s) | word ts accurate, utterance grouping catastrophically lumped |
| mistral | 1475 | 170:57 | 151 min | 0 | 5.8s | fine, monotonic, best balance |
| gemini | 2228 | 170:55 | 133 min | 0 | 3.0s | finest; ~38min intra-gaps incl one 265s |
| azure-openai | 1190 | 170:58 | 156 min | 2 (0.5s) | 5.3s | fine, clean |
| alibaba | **43** | 172:00 | 172 min | 0 | **240s fixed** | artificial fixed 4-min windows |
| elevenlabs | 100 | 170:58 | 167 min | 0 | 16.4s (44 >60s) | turn-level lumping, milder than AA |

No provider has large backward jumps or 600s chunk-boundary seams — monotonicity is clean everywhere. Granularity is the whole story.

## Cross-provider phrase-start agreement (M:SS)
The fine-grained trio (mistral/gemini/azure) agree within ~1-3s on all probes and are the reliable reference. Examples:
- "expertise on demand": AA-utt **25:24** vs mistral 31:13 / gemini 31:11 / azure 31:09 — AA utterance is **~6 min early**; AA *word-level* = 31:14 (matches!).
- "regional reset": AA-utt 0:00.6 vs trio ~0:44; AA word-level 0:45.
- alibaba snaps every phrase to a 4-min boundary (0:00/28:00/60:00/76:00).

## Verdict on AssemblyAI timestamps (the key question)
**Not drift, not misplacement — lumping.** AssemblyAI exposes 22,981 accurate **word-level** timestamps (`raw.words`) that match consensus within ~1-5s, but it groups them into only 84 (en) / 16 (es) speaker-turn utterances, each stamped with the turn's start. Median word lands **209s** after its utterance start; 90th pct 845s; worst **1419s (23.6 min)**. So "partially correct, partially off" = correct at turn boundaries/word level, increasingly off inside each turn. Re-segmenting from the word timestamps would fully fix it.

## Content anomalies
- **HIGH (gemini): systematically renders "UN80" → "UN 2.0" 29×** vs all 5 others saying UN80 — LLM prior hallucination of the meeting's own name.
- MED: alibaba fixed 4-min quantization; elevenlabs turn-lumping; gemini coverage gaps (133/171 min, one 265s gap).
- LOW: AA speaker-name variant for USG Guy Ryder. Most flagged "name hallucinations" are false positives (capitalized common words like "Briefers","Headquarters","Including"). No `�`, no repetition, no off-script in any en provider.

## Headline findings
- AssemblyAI's timestamps are lumped, not drifting; word-level data is accurate and recoverable.
- mistral / gemini / azure-openai are the trustworthy fine-grained timestamp providers (agree within ~1-3s).
- alibaba = coarse fixed 4-min windows; elevenlabs = turn-level lumping with no word-level fallback.
- Gemini's only serious content flaw is "UN80"→"UN 2.0", but it also drops the most audio to gaps.
