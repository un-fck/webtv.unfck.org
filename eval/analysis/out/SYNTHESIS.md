# Cross-video STT synthesis — 6 providers, 4 videos

Reference-free (consensus-as-ground-truth) analysis. Built from the per-video reports in
`eval/analysis/out/<symbol>/REPORT.md` and the deterministic signals/anomalies from
`eval/analysis/compare.py`. No PV ground truth was available for any of the four videos
(three have no symbol; S/PV.10156's record isn't published yet), so this is content/structure
analysis, not WER.

Videos: **V1** UN80-Apr06-keita (GA80 UN80 briefing, 171m) · **V2** S/PV.10156 (SC draft report, 9m)
· **V3** UN80-Apr29 (GA80 UN80 briefing, 171m) · **V4** Nebenzia-Starobelsk (RU press conf, 40m).

## Per-provider error profile (across all videos)

| Provider | Characteristic failure modes | Strengths | Verdict |
|---|---|---|---|
| **gemini** (gemini-3-flash) | **Name hallucination** (Diene Keita→"Natalia Kanem", Latin scripts only, intermittent). **Term hallucination** ("UN80"→"UN 2.0" 29×). Paraphrases/invents over noisy audio. **Drops the most content** (V3 133/171m, V4 70% coverage). Compressed word-timestamps (V2). | Best hard-word accuracy on accented speech; finest diarization; clean CJK. | High value but the only one that corrupts *meaning* with confident, plausible inventions — and WER-invisible. |
| **assemblyai** (Universal-2) | **Worst on accented words** ("appalling"→"polling", "minors in cold blood"→"miners in crime"). **Severe lumping** (84 utts/171m; 8 utts for all of Russian) → utterance timestamps far off mid-turn. | Cleanest structure, ~100% coverage, no fffd/loops, **accurate recoverable word-level timestamps** (`raw.words`). | Reliable text+coverage, never invents entities; but blunt diarization and accent-fragile. |
| **mistral** (voxtral-mini) | **CJK corruption** (176 U+FFFD on V2 zh, 3606 on V1 zh; bleeds into es). Shares "appalling"→"polling". **Over-generates** (V4 115% coverage = overlapping segments). Invents entities. | Clean Latin-script text, good granularity. | Do not use on any track that can contain CJK. Otherwise mid-pack. |
| **azure-openai** (gpt-4o-transcribe) | **Cross-language leakage** (Chinese gavel line into every V2 track's first utterance; English/Spanish into V1 Russian). **Degenerate loops** ("p p p p"). **Hallucinates over noise** ("We should remain serious"). Worst name inventions ("Vasilina Ibenzia"). | Good granularity and coverage; recovers hard words. | Noisiest on multilingual/interpretation audio; capable but unstable. |
| **alibaba** (qwen3-asr-flash) | **Fixed 4-min chunk windows** → unusable segmentation (3–43 utts) and fake "100% coverage". Weak on names ("Inger Kjaer" for Keita, "Vassily Lyubimov"). | Accurate raw text incl. hard accented words; clean CJK. | Good text engine, useless timestamps/diarization as configured. |
| **elevenlabs** (Scribe v2) | Turn-level lumping (no word-level fallback). Minor repetition. | **Best accented-English accuracy**, ~98% coverage, faithfully marks self-repairs, clean CJK, no inventions. | Most trustworthy all-rounder for content; coarse timing. |

## Two error families (the key structural insight)

The providers split cleanly by architecture:

- **LLM-based (gemini, azure, partly mistral):** fail by **hallucination** — invent plausible names, terms, and whole sentences over noise/accents, and gemini *drops* audio. Errors are fluent, confident, semantically corrupting, and **invisible to WER** (1 token). This is the dangerous class.
- **Classic ASR (assemblyai, alibaba, elevenlabs):** fail by **acoustic mishearing** — wrong individual words on accents/names — but stay complete and never invent entities. Errors are localized and WER-detectable.

## Cross-cutting findings

1. **Name hallucination is gemini-unique and prior-driven.** Only gemini ever produces a *different real person* (Kanem) or renames a concept (UN 2.0). All others only mis-spell phonetically. It's intermittent (same transcript also gets it right) and only fires in Latin scripts where the training prior is strong.
2. **CJK corruption is mistral-unique** and scales with audio length (176 → 3606 U+FFFD). Every other provider is clean on Chinese.
3. **Timestamps:** "off" timestamps are almost always **lumping**, not drift. AssemblyAI/elevenlabs/alibaba group speech into few turns stamped at the turn start (AA word can be 23min past its utterance stamp); gemini/mistral/azure are fine-grained and agree within ~1–3s. AssemblyAI's word-level data is accurate and recoverable — re-segmenting from `raw.words` would fix it.
4. **Multilingual/interpretation audio breaks routing.** Azure leaks the floor language into other tracks; on V4 only gemini transcribed the Russian floor in Cyrillic while others transcribed the English overlay. The floor feed is a systematic hazard.
5. **Proper nouns are everyone's weak spot.** No provider rendered the patronymic "Alexeyevich" correctly; place/person names drift across all six.
6. **Coverage as a metric is unreliable per-provider:** gemini's low coverage = timestamp compression (text complete); alibaba's 100% = chunk padding. Always cross-check char counts before trusting coverage.

## Recommended "high-error-potential" criteria for the rigorous eval corpus

Pick videos that combine these (each targets a confirmed failure mode):

- **Role-holders who succeeded a famous predecessor** (UNFPA ED, etc.) → triggers gemini name hallucination. *(V1)*
- **Non-Latin-script tracks, especially Chinese** → mistral CJK collapse; also tests azure leakage. *(V2)*
- **Heavily accented / non-native English** (Russian, etc.) → assemblyai/mistral acoustic substitution. *(V4)*
- **Noisy/disfluent segments, embedded video clips, applause** → LLM hallucination-over-noise (gemini/azure). *(V4)*
- **Long meetings with many short speaker turns** → exposes lumping/diarization failure (assemblyai/alibaba/elevenlabs). *(V1/V3)*
- **Multilingual floor feed present** → cross-language routing/leak errors. *(all)*
- **Dense proper nouns / numbers / resolution symbols** → spelling drift and misheard figures (all).

A small corpus of ~6–10 videos hitting each criterion would stress every provider's distinct weakness — far more diagnostic than random sampling or WER alone.

## Method notes / caveats

- Consensus voting localizes anomalies but the auto "hallucination" flag has false positives (capitalized foreign common words); all headline claims here were verified against raw transcripts by the per-video agents.
- The per-video reports (`eval/analysis/out/<symbol>/REPORT.md`) hold the full evidence tables and timestamps.
- Harness improvement worth making: detect truncation/coverage automatically (would have caught the transient Mistral-20min bug), and add a CJK/off-script gate. The `compare.py` signals already cover most of this.
