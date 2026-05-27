# STT Quality Analysis — UN80-Apr06-keita

**Video:** GA 80th session informal plenary briefing on the UN80 Initiative (2026-04-06), discussing the proposed UNFPA / UN Women merger. Key speakers: Diene Keita (UNFPA ED), Sima Bahous (UN Women ED), Annalena Baerbock (PGA), Amina Mohammed (DSG), Guy Ryder (USG Policy), Doreen Bogdan-Martin (ITU SG).

**Method:** No ground truth. 6 providers used as ensemble; outlier-vs-5 = likely error. Classified ACOUSTIC (mishearing) vs HALLUCINATION (invented/different real entity). All evidence verified against raw `.txt`. Duration ~171 min, all providers reach ~171 min `last_end_min` in every language — **no truncation**. gemini's low `coverage_pct` (58–80%) is a segmentation artifact, not dropped content.

## Per-provider error profile

- **gemini (gemini-3-flash)** — High for named-entity fidelity, otherwise the best text. Only provider that truly _hallucinates_ entities: substitutes **"Natalia Kanem"** (former UNFPA ED, not present) for actual speaker Diene Keita. LLM-prior override, in Latin scripts only (en ×4, es ×1, fr ×2); absent in ar/ru/zh. Intermittent — correctly says "Diene/Diane Keita" elsewhere in the same transcript. No fffd, no loops.
- **assemblyai (Universal-2)** — Low–Med. Clean, near-100% coverage, no fffd/repetition. Weakness is _lumping_: utt_count 8 (ru), 19 (es), 35 (fr) — poor diarization. Name errors purely acoustic ("Dean Kita", "Diane Keiter", "Sima Barhus"). Auto-flagged "Consolidated Report"/"Unit" are false positives, not hallucinations.
- **elevenlabs (Scribe v2)** — Low. High coverage, minor repetition. Acoustic name errors only ("Dean Khija", "Team Khija", "Simma Bahous"). Lumps like assemblyai.
- **azure-openai (gpt-4o-transcribe)** — Med. Well-segmented but noisiest on interpretation channels: highest ru repetition (0.085, incl. a degenerate `"p p p p..."` loop) and English/Spanish bleed into the Russian track ("Thank you" ×13, "Women", "Gracias", "India"). Off-script elevated in zh (4.9%), ar (1.5%). Acoustic name errors ("Miss Geeta", "Guikita").
- **alibaba (qwen3-asr-flash)** — Low–Med. 100% coverage, fixed 43-utterance block (no real diarization). One near-hallucination: renders the UNFPA ED as **"Inger Kjaer"** (plausible invented Nordic name) at 23:44.
- **mistral (voxtral-mini)** — High for Chinese, Low elsewhere. **zh is severely corrupted: 3606 U+FFFD chars (~9% garbled)**, largely unusable. ru has 2 fffd. Latin-script output is clean (acoustic name errors only).

## Ranked anomaly list

1. **High | HALLUCINATION (named entity) | en | 23:44, 43:55, 48:10, 64:26 | gemini vs all 5** — "thanking \_\_\_, Executive Director of the UN Population Fund": gemini = **"Natalia Kanem"**; others = "Dean Kita"/"Guikita"/"Inger Kjaer"/"Dean Khija". Actual speaker = Diene Keita.
2. **High | CORRUPTION (encoding) | zh | whole file | mistral** — 3606 × U+FFFD, e.g. `里程��意义的决议它��及的`. Others have 0 fffd in zh.
3. **Med | HALLUCINATION | es | line 1877 | gemini vs all** — "señora Kanem y señora Bahous"; same transcript correctly says "Diene Keita" at line 4688 (intermittent).
4. **Med | HALLUCINATION | fr | lines 1199, 4769 | gemini vs all** — "Directrice exécutive de l'UNFPA Natalia Kanem" / "Madame Kanem"; correct "Diene Keita" at lines 1349/5615.
5. **Med | REPETITION LOOP + OFF-SCRIPT BLEED | ru | azure-openai** — "p p p p p p p p" loop (repetition 0.085); ~25 Latin tokens leak into the Russian channel.
6. **Low–Med | NEAR-HALLUCINATION | en | 23:44 | alibaba** — "Inger Kjaer", an invented full name shaped from the acoustics of "Diene Keita".
7. **Low | SPEAKER LUMPING | ru/es/fr/en | assemblyai (8/19/35/73 utts), elevenlabs, alibaba (fixed 43)** — minimal diarization; usability/attribution failure.
8. **Low | OFF-SCRIPT | zh/ar | azure-openai, elevenlabs** — minor Latin leakage, mostly romanized acronyms.
9. **Low | NUMBER NOISE | ar/ru/zh | gemini** — spurious "2.0"/"8.0" formatting tokens. Substantive figures agree across providers (Res. 64/289, 150+ countries, 2030 Agenda, ~25 work packages, WP15). No misheard content number found.

## Headline findings

- The **Keita→Kanem hallucination is confirmed, gemini-unique, and language-dependent**: present in en (×4), es (×1), fr (×2), absent in ar/ru/zh (gemini there correctly writes "ديان كيتا" etc.). The other 5 providers only make _acoustic_ errors on the name ("Dean Kita", "Dean Khija", "Guikita", "Inger Kjaer") — none ever produce "Kanem". Classic LLM-prior override active only where the prior for that famous name is strong (Latin scripts).
- It is **intermittent within gemini**: the same transcript spells "Diene/Diane Keita" correctly in most mentions and slips to "Kanem" in a few — so one speaker appears under two names.
- **mistral is broken for Chinese** (3606 U+FFFD, ~9% corrupted) — the single worst structural failure.
- **azure-openai is noisiest on interpretation channels**: a degenerate "p p p…" loop in ru plus the most cross-language English/Spanish bleed.
- **assemblyai, elevenlabs, alibaba are honest-but-blunt**: clean, no invented entities, but barely diarize (assemblyai = 8 utterances for all of Russian; alibaba = fixed 43-block), crippling speaker attribution.
- **No truncation or dropped passages**; substantive numbers are consistent across the ensemble.
