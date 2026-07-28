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
| **Long meetings, many short turns** (lumping + diarization miscount) | ✅ | 6 sessions of 60–120 min, both arms | ⚠️ **§14.3 does not reproduce** — see below |
| **Dense proper nouns / numbers / resolution symbols** | ✅ | entity sweep + 10 qualitative reads | Both weak. Document-symbol recall ~50% for both. Entity accuracy 4/11 vs 3/11 — a wash. |

## §14 — the English decision

| §14 claim | status after re-testing |
| --- | --- |
| §14.1 azure-llm better by 1.0 paired WER, CI [−2.0, −0.2] | ⚠️ **CI invalid.** The bootstrap LCG has period 10,466 while drawing 180,000 values — it cycles ~17× with non-uniform resampling. And the underlying WER was computed by a scorer that inflates localized errors by up to 50 points on 14 of 21 sessions, over a reference from which 15.7% of real speech had been deleted. Re-measured here. |
| §14.2 hallucination gate — all six arms pass, nobody hallucinates on `en` | ⚠️ **Contradicted by the qualitative reads.** Ten meetings turned up AssemblyAI producing "President Barroso", "Mr. Ban Ki-moon", `UNRWA` for `UNDOF`, and "the High Representative" for the SRSG. The §14.2 gate tested exactly one substitution (Kanem) on one clip; it is far too narrow to license "nobody hallucinates". Re-run on the original clip in the battery. |
| §14.3 the incumbent stops diarizing on long meetings | ⚠️ **Does not reproduce.** 0 of 10 eligible sessions degenerate, both arms; median 14 spk / 42 turns for AssemblyAI on 60–120 min vs 15 / 34 for Azure. |
| §14.4 accented English — Speechmatics fails, others pass | not re-tested for the eliminated arms; the two live arms are re-tested in the battery |
| §14.5 "azure-llm ~$0 marginal, already procured"; AssemblyAI $0.23/h | ⚠️ **Wrong on both.** Azure bills **$0.306/audio-hour** on our own invoice ($0.36 list, 15% discount confirmed on two independent meters); AssemblyAI is **$0.21/h**. Azure is **1.46× dearer**. |
| §14.5 "reliability, not accuracy, is its open question" | **Upheld, and now answered from production**: AssemblyAI 0.046% vendor-attributable over n=8,662; Azure 6.8% over n=44, all on its first production day. |

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
