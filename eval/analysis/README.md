# Manual STT provider eval (ad-hoc)

A one-off, **reference-free** comparison of speech-to-text providers on a handful of
hand-picked UN meetings, run in 2026-05 to decide **which provider to use for which
language track** in the production pipeline. Distinct from the main `eval/` harness
(which scores WER against PV documents across a standing corpus) — this is a targeted
qualitative/structural study of provider _failure modes_.

**Read [`out/SYNTHESIS.md`](out/SYNTHESIS.md) first** — it has the final routing decision and
all findings. Per-video deep dives are in `out/<symbol>/REPORT.md`.

## Final decision (see SYNTHESIS §7)

| Track                               | Provider                                                               |
| ----------------------------------- | ---------------------------------------------------------------------- |
| English                             | `assemblyai-u3-pro`                                                    |
| French / Spanish / Arabic / Russian | `azure-openai`                                                         |
| Chinese                             | `fun-asr` (alt: `alibaba` / qwen3-asr-flash-filetrans, no diarization) |
| Multilingual floor                  | `gemini-3-flash-preview`                                               |

## Why these videos

5 meetings, each chosen to trigger a specific suspected error mode:

| Symbol (dir)            | Meeting                             | Targets                                                 |
| ----------------------- | ----------------------------------- | ------------------------------------------------------- |
| `UN80-Apr06-keita`      | GA80 UN80-Initiative briefing, 171m | Gemini name hallucination (Keita→"Natalia Kanem")       |
| `S_PV.10156`            | SC draft-report adoption, 9m        | CJK integrity; **only video with a published PV → WER** |
| `UN80-Apr29-timestamps` | GA80 UN80-Initiative briefing, 171m | timestamp quality / lumping                             |
| `Nebenzia-Starobelsk`   | RU press conference, 40m            | accented English ("appalling"→"polling")                |
| `S_PV.10153`            | Middle East SC debate, 80m          | **floor-only** multilingual (all 6 UN languages)        |

Providers (11): `assemblyai` (U2), `assemblyai-u3-pro`, `mistral` (voxtral-mini), `gemini`
(3-flash-preview), `gemini-3.5-flash`, `azure-openai` (gpt-4o-transcribe), `alibaba`
(qwen3-asr-flash-filetrans), `fun-asr`, `qwen3.5-omni-plus`, `elevenlabs` (Scribe v2).
`voxtral-small` was attempted but dropped (Mistral token-rate tier).

## Files

| Path                               | What                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `out/SYNTHESIS.md`                 | **The report** — cross-provider findings + final decision                                                                                     |
| `out/<symbol>/REPORT.md`           | Per-video deep analysis (produced by per-video review agents)                                                                                 |
| `out/<symbol>/<lang>.signals.json` | Deterministic per-provider stats (coverage, fffd, repetition, off-script, utt/speaker counts)                                                 |
| `out/summary.json`                 | Harness roll-up across all video-languages                                                                                                    |
| `compare.py`                       | **Harness** — reference-free consensus analysis (the ensemble is the pseudo-reference). Reads `eval/results/raw/`, writes `out/`.             |
| `wer-spv.ts`                       | WER for `S/PV.10156` (the only meeting with PV ground truth) from cached outputs                                                              |
| `gemini-selfcheck.ts`              | Experiment: give Gemini its own (wrong-name) transcript + audio, ask it to flag errors — it "corrects" the right name to the hallucinated one |

`*.aligned.md` (6-column windowed transcripts) and `*.anomalies.json` (consensus flags) are
**git-ignored regenerable intermediates** — recreate with `python3 compare.py`.

## Reproduce

```bash
# 1. Transcribe the corpus with the providers (raw output → eval/results/raw/, git-ignored).
#    Long/slow; AssemblyAI is slow on long audio — give it its own narrow-language run.
pnpm eval -- --corpus=eval/corpus/manual-eval.json --providers=<names> --languages=<codes|floor>

# 2. Reference-free comparison (regenerates out/ signals, anomalies, aligned, summary)
python3 eval/analysis/compare.py

# 3. WER for the one PV-backed meeting
pnpm tsx eval/analysis/wer-spv.ts

# 4. (optional) Gemini self-review hallucination experiment
pnpm tsx eval/analysis/gemini-selfcheck.ts
```

Corpus definition: [`eval/corpus/manual-eval.json`](../corpus/manual-eval.json).
Provider code: `lib/providers/` (registry in `registry.ts`); DashScope async helper in
`lib/providers/dashscope-asr.ts`.

## Status / caveats

- **`fun-asr` WER row is pending one clean re-run** — its cache was cleared for the spacing-fix
  re-run, which died on a transient DNS blip (not quota/code). The conditional word-rejoin fix is
  in place; non-English values are unchanged, en reflects the verified fix (27.2).
- Reference-free: "consensus" flags have false positives (verified against raw transcripts before
  any headline claim). WER exists only for `S/PV.10156`.
- Diarization here = speaker-count calibration + granularity, **not** attribution accuracy (no
  speaker-labeled ground truth; DER/cpWER would need aligning the PV's speaker turns).
