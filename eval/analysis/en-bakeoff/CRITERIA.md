# The defined criteria, applied — and which prior conclusions changed

Every criterion `SYNTHESIS.md` defines for the English track, with what this run
found. Prior claims that did **not** survive re-testing are marked ⚠️.

## §9 — the high-error-potential criteria

| criterion | applies to `en`? | how it was tested here | result |
| --- | :-: | --- | --- |
| Role-holders who succeeded a famous predecessor (name hallucination) | ✅ | the V1 Keita/Kanem clip, the §14.2 gate | *battery* |
| Non-Latin script, esp. Chinese | ✗ | — | out of scope |
| Multilingual floor | ✗ | — | out of scope (floor stays Melia) |
| Heavily accented / non-native English | ✅ | V4 Nebenzia clip: "appalling"/"polling", Starobelsk, patronymic | *battery* |
| Noisy / disfluent segments, applause | ✅ | V4, and the disfluency handling seen throughout the qualitative reads | AssemblyAI *preserves* disfluencies with em-dash restarts; Azure smooths them. Neither hallucinates over noise on `en`. |
| **Long meetings, many short turns** (lumping + diarization miscount) | ✅ | 13 files over an hour, both arms | **§14.3 reproduces on 1 of 13** — real, catastrophic, rare, not predicted by duration |
| **Dense proper nouns / numbers / resolution symbols** | ✅ | entity sweep + 10 qualitative reads | Both weak. Document-symbol recall ~50% for both. Entity accuracy 4/11 vs 3/11 — a wash. |

## §14 — the English decision

| §14 claim | status after re-testing |
| --- | --- |
| §14.1 azure-llm better by 1.0 paired WER, CI [−2.0, −0.2] | ⚠️ **CI invalid.** The bootstrap LCG has period 10,466 while drawing 180,000 values — it cycles ~17× with non-uniform resampling. And the underlying WER was computed by a scorer that inflates localized errors by up to 50 points on 14 of 21 sessions, over a reference from which 15.7% of real speech had been deleted. Re-measured here. |
| §14.2 hallucination gate — all six arms pass, nobody hallucinates on `en` | ⚠️ **Contradicted by the qualitative reads.** Ten meetings turned up AssemblyAI producing "President Barroso", "Mr. Ban Ki-moon", `UNRWA` for `UNDOF`, and "the High Representative" for the SRSG. The §14.2 gate tested exactly one substitution (Kanem) on one clip; it is far too narrow to license "nobody hallucinates". Re-run on the original clip in the battery. |
| §14.3 the incumbent stops diarizing on long meetings | **Real, but rare and not length-predicted.** 0 of 12 scored sessions degenerate (to 2h33m), yet the original 171-min clip reproduces it exactly — 1 speaker, 1 utterance, 147k chars. Mitigation is detection at the pipeline boundary, not avoiding long files. |
| §14.4 accented English — Speechmatics fails, others pass | not re-tested for the eliminated arms; the two live arms are re-tested in the battery |
| §14.5 "azure-llm ~$0 marginal, already procured"; AssemblyAI $0.23/h | ⚠️ **Wrong on both.** Azure bills **$0.306/audio-hour** on our own invoice ($0.36 list, 15% discount confirmed on two independent meters); AssemblyAI is **$0.21/h**. Azure is **1.46× dearer**. |
| §14.5 "reliability, not accuracy, is its open question" | **Upheld, and answered from production — after correcting my own denominator.** AssemblyAI **0.284%** vendor-attributable over **n=704** (my first figure, 0.046% over n=8,662, counted `transcribe_poll` log rows as attempts); Azure 6.8% over n=44, all on its first production day. Over the matched window the *raw* rates are tied: 6.77% vs 6.82%. |

## §15 — the seven reference-free checks, for `en`

| check | azure-llm | AssemblyAI | note |
| --- | :-: | :-: | --- |
| **Accuracy** | see the WER section | | measured with a rebuilt scorer; the §15.1 numbers are not comparable |
| **Speaker labels** | ◐ | ◐ | equivalent turn granularity (118 vs 112 s/turn). Azure's much finer segmentation (9.7 s) is a real advantage for word-timestamp anchoring, but is not "more speakers". |
| Multilingual floor | — | — | out of scope for `en` |
| Chinese text | — | — | out of scope |
| **Names & entities** | ❌ | ❌ | §15.5a called azure-llm "worst of every engine". On `en` both are poor and roughly equal: 4/11 vs 3/11 entity slots. The difference is failure *mode*, not rate — and it is 3-vs-1 on n=6, not systematic. |
| **Numbers & symbols** | ◐ | ◐ | ~50% document-symbol recall for both. Both drop UN citation year qualifiers (`2766 (2024)` → "2766"). Azure additionally spells symbols as words in places ("S slash 2024 slash 942"); AssemblyAI splices them ("S/2024/413. 2024/368"). |
| **Timestamps** | ✅ | ✅ | word-level timestamps in both; Azure's finer segments make them more useful |

## New criteria this run adds

Things that were not on the list and should be.

| criterion | why it earned a place | finding |
| --- | --- | --- |
| **Failure *detectability*, not just failure rate** | A wrong-but-real institution costs a reader more than a visible non-word, and WER weights them identically | At ambiguous entity slots AssemblyAI produces a plausible wrong entity 3×, Azure 1× (n=6 meetings). Real but narrow. |
| **Vendor-side content filters** | Discovered by accident | Azure's **default** profanity mask destroyed a UN body's name (`SCAD` → `****`) in 2 of 9 sessions. `Removed` mode is worse (silent deletion). One-line fix, but nobody would have known to look. |
| **Entity-biasing availability** | The only structural fix for the shared entity weakness | AssemblyAI: `keyterms_prompt`, `word_boost`, `custom_spelling`. Azure enhanced mode: **none that work** — `phraseList` is accepted-and-ignored, and the documented `prompt` substitute is rejected `400`. |
| **Model pinnability** | Cannot be fixed by code; only detected | Azure's default enhanced model is unnamed and unpinnable; only two api-versions answer and they disagree on segmentation. The one nameable alternative (`mai-transcribe-1.5`) has no diarization and no word timestamps, and is preview (outside SLA). |
| **Who pays, and whether the payer can fail** | The out-of-pocket arrangement is itself a reliability component | 15 production transcriptions failed in July with "account balance is negative" — more failures than either vendor caused. |
| **Ground-truth quality** | The oracle is not infallible | The PV is itself wrong in ≥3 places where both transcribers are right (S/PV.9722), carries PDF-extraction artifacts charged to both arms, and is an *edited* record — on S/PV.9826, 44 of 94 differences are the PV's editing, not transcription error. |

## ⚠️ The criterion this run MISSED — omission (added 2026-07-30)

**This bake-off never scored how much speech a provider silently leaves out, and that
turned out to decide the question.** Added retrospectively here so it is never optional
again; it is now mandatory for any provider comparison (`docs/eval.md`), implemented as
`eval/metrics/omission.ts`, and printed as a leaderboard by `eval/run.ts`.

| criterion | why it earned a place | finding |
| --- | --- | --- |
| **Omission — speech with no words over it** | An omitted sentence and a misrecognised one can score the **same WER**, yet only one is invisible to the reader. On a verbatim UN record an invisible deletion reads as censorship — which is exactly how it was reported to us. | Re-scored from **this run's own cached transcripts** (no new API calls): AssemblyAI omits **0.580%** of 27.5 h vs Azure's **0.082%** (7×); **879 words** missing that Azure captured vs **370** the other way (2.38×); single omissions up to **71 words**; `S_PV.9816` alone loses **373 words**. Decided the English switch. |
| **Run-to-run stability of *content*** | §14/§15 and this run all assumed one pass per arm is representative of the arm | AssemblyAI diverges **215 words across 12 regions** between passes of the *same* arm on the *same* audio (incl. 41- and 43-word passages on 8–13 min files); Azure **0**. One pass is not representative. |

**Why the existing criteria could not catch it.** Three near-misses, all of which pointed
at the right area and stopped short:

- §2's negative controls **did** find the shipped scorer reporting a 30% contiguous
  deletion as 80.2% WER — the damage class was known to be *mis-measured* before it was
  known to be *occurring*. Fixing the scorer was treated as sufficient; measuring the
  phenomenon directly was not considered.
- §7's three-way reads noted "a dropped governing phrase" on Algeria's vote — a single
  instance, recorded as an anecdote rather than a class to quantify.
- §9's "long meetings" criterion tested **diarization collapse**, not content loss, and
  concluded the failure was "rare, not predicted by duration". Omission on the same files
  was systematic and never looked for.

**The transferable lesson:** every criterion here compares what the two arms *produce*.
None asked whether either arm produces *nothing* where there is audio. Reference-based
metrics cannot ask that question, because a reference tells you what should have been said,
not which parts of the recording were never attempted. Any future comparison must include
at least one measure computed **against the audio** rather than against a text reference.
