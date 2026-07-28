# Three-way qualitative comparison — synthesis of the first six sessions

> **REVISED after adversarial verification.** An independent agent was tasked with
> refuting this synthesis. It confirmed all 14 factual string claims but
> **materially corrected the conclusion**, and found errors in my own tooling.
> The corrections are folded in below and listed explicitly in the last section.
> The original over-claim is preserved there rather than quietly deleted.

Six reading agents each read one packet end to end (PV ground truth, AssemblyAI
output, azure-llm output) and enumerated every difference. No diff tooling: a
diff cannot judge that "UNAT" is a real UN body substituted for a different one.

**Coverage:** 6 meetings, 3,262 PV reference words, **358 enumerated difference
rows** (an earlier draft said "~400"; the per-session figures sum to 358 — the
round-up went in the flattering direction and is corrected here).

| session | audio | PV words | rows |
| --- | ---: | ---: | ---: |
| S/PV.9675 | 1.4 m | 92 | 10 |
| S/PV.10100 | 4.6 m | 378 | 58 |
| S/PV.10054 | 5.8 m | 594 | 57 |
| S/PV.10069 | 7.9 m | 619 | 76 |
| S/PV.10156 | 9.2 m | 921 | 63 |
| S/PV.9826 | 10.0 m | 658 | 94 |

## What the total census actually shows

The adversarial pass enumerated **every** substitution rather than the ones the
reading agents chose to highlight. That changes the picture:

| | AssemblyAI | azure-llm |
| --- | ---: | ---: |
| substitutions vs the PV | 101 | 104 |
| **identical substitution made by BOTH arms** | **71 (70%)** | **71 (68%)** |
| arm-unique substitutions | 30 | 33 |
| visible garble / non-words / masks | **6** | **7** |

**Seventy per cent of the two arms' errors are the same error.** The entire
difference between these vendors rests on ~63 arm-unique substitutions across
3,262 words. On S/PV.10156 the two arms differ in **two rows**.

## What survives: one narrow, real asymmetry

Across the 11 entity slots in the six meetings:

| | AssemblyAI | azure-llm |
| --- | ---: | ---: |
| entity slots correct | 4 / 11 | 3 / 11 |
| failures that are a **real-but-wrong** entity | **3** | **1** |
| failures that are non-words or masks | 2 of 7 | 6 of 8 |

**Accuracy at entity slots is a wash.** The asymmetry is in the *failure mode*:
when the acoustics are unclear at an entity, AssemblyAI tends to snap to a real
in-vocabulary entity, Azure tends to emit a non-word.

The three AssemblyAI cases:

| session | AssemblyAI | truth | why it matters |
| --- | --- | --- | --- |
| 9826 | "other than those of **UNRWA**" | UNDOF | a real, different, politically charged UN agency, inside the operative quotation of a mandate-renewal meeting |
| 10069 | "the **High Representative** for Children and Armed Conflict" | Special Representative of the Secretary-General | one real UN office for another |
| 10069 | "Thank you, **President Barroso**" | no such person present | a fabricated surname (though the duplicated "Thank you, President" immediately before does cue a reader) |

Plus, in a different class but the same spirit: "the report **to** the
Secretary-General" (×2, S/PV.10100), which reverses document authorship, and
"Thank you, Mr. **Ban Ki-moon**" inserted mid-sentence in S/PV.9642.

The one Azure case: **"the panel of expert regional partners"** (10069) for "the
Panel of Experts, regional partners" — grammatical, plausible, and it silently
erases a distinct actor. *This is Azure's most invisible error and my first draft
misfiled it as "visibly wrong".*

**This is 3 versus 1 on six meetings**, and two of the three AssemblyAI cases are
the same acoustic token in one session. Directionally real; nowhere near
"systematic".

## Shared failures — neither vendor protects the reader

The most decision-relevant category, because it bounds what *either* choice buys.
Eleven verified, six volunteered by the reading agents and five found by the
adversarial pass:

- **10100:** both turn "the parties, **who have** confirmed" into "**We have**
  confirmed" — reversing who asserts the parties' positions.
- **10100:** both flatten "their well-known **positions**" (two parties, two
  irreconcilable positions) to the singular.
- **10100:** both turn "we **rallied to** consensus" into "we **relied on**
  consensus" — inverting the presidency's claim about its own month.
- **10100:** both write "I **now** speak on behalf of the Council" for "I **know
  I** speak".
- **10100:** both write "**this** mission of good offices" for "**his** mission".
- **10100:** both write "I **shall** like to inform the Council" (ungrammatical).
- **10054:** both write "around **this** world" for "around **the** world".
- **10156:** both drop "**landscape**" from "the international peace and security
  landscape in which the Council works".
- **10069:** both misname the briefer — PV "Amar **Bendjama**"; both render
  "Benjama" then "Banjama", contradicting themselves within one meeting.
- **10069:** both write "Office **of** the Coordination of Humanitarian Affairs"
  (correct: **for**).
- Both drop year qualifiers from UN citations — `resolution 2766 (2024)` becomes
  "2766 of 2024" or bare "2766".

The "I know I speak" case is the decisive methodological one: the **same stock
sentence** appears in S/PV.10054 and S/PV.10100. Both arms get it right in one
and wrong in the other. Two independent systems converging on the same wrong
reading proves that *"B and C agree, therefore the PV is the edited party"* is a
useful prior, **not evidence** — the correct statement is "the PV is edited **or**
both share an acoustic confusion", and those are not separable from text alone.

## The production bug (independently reproduced — this one stands)

Azure mishears **SCAD** (Security Council Affairs Division) as **"SCAT"**, which
is on Microsoft's profanity list, and the service's **default** filter mode is
`Masked`. `lib/providers/azure-llm-speech.ts` never sets the option, so real
output reads *"I would like to thank the \*\*\*\* for the contributions they
made."* Two occurrences in the six sessions, deterministic across both bitrate
arms. AssemblyAI never masks.

The mode table below is **directly observed** — I ran all four modes against the
live API on S/PV.10156 (`probe-profanity.ts`), not inferred from the packets:

| `profanityFilterMode` | output | assessment |
| --- | --- | --- |
| unset / `Masked` (**current**) | `the **** for the contributions` | content destroyed; reads as a censored expletive from the Council President |
| `Removed` | `the  for the contributions` | **worse** — silently deleted, no trace a word existed |
| `None` | `the SCAT for the contributions` | wrong but visible and recoverable |
| `Tags` | `<profanity>SCAT</profanity>` | wrong but explicitly flagged |

## Corrections forced by adversarial review

Recorded rather than quietly fixed, because the pattern of error is instructive.

1. **"ESKAT" was NOT an invented entity.** I claimed AssemblyAI invented a
   UN-shaped acronym. It is a mis-transcription of the *real* acronym SCAD —
   proved by Azure masking the identical slot, by the PV's own apposition "the
   Secretariat of the Council", and by S/PV.10156 where AssemblyAI renders SCAD
   correctly. My synthesis asserted both things about the same audio in two
   different sections and did not notice.
2. **"Any further discussion" is not fluent.** I filed it under "grammatical,
   gives a reader no cue". It is conspicuously broken English.
3. **"UNDORF" and "Ndoff" were scored by two different standards** — one as
   "would pass a skim", the other as "announces its own unreliability". Same
   acoustic slot, same session, both non-words.
4. **"panel of expert regional partners" was misfiled** as visibly wrong. It is
   Azure's most invisible error; moving it materially shrinks the asymmetry.
5. **Azure's "Against."/"Yes." is a mis-attribution, not an invention** — almost
   certainly the President's own vote-call assigned to a phantom speaker. It is
   the mirror image of AssemblyAI's "Aye.", and I charged the same phenomenon to
   both arms as evidence for opposite conclusions.
6. **"Anita Asma" vs "Asmah"** is a one-character transliteration variant, not a
   fabrication.
7. **"~400 rows" should be 358.**
8. **My export script counted `[spk A]` markers as words**, inflating the
   AssemblyAI/Azure figures in every packet header by exactly 2 per speaker turn
   — and those headers were the denominators the reading agents used for their
   surplus reconciliations. Fixed. The PV side has no markers, so the
   PV-denominated conservation checks are unaffected.
9. **"0 unaccounted PV words" is weaker than it sounds.** It is blind by
   construction to insertions: an invented word adds *zero* unaccounted PV words.
   17.7% of AssemblyAI's output and 17.3% of Azure's lies in difference spans,
   and on S/PV.9675 fully 29% of AssemblyAI's tokens have no PV counterpart while
   the check still reads 92/92. It certifies "I read the whole PV", not "I found
   the errors". No agent stated this limit.
10. **PV extraction artifacts were charged to both arms** — `"Secretary -General"`,
    `"wh ich"`, `"thre ats"`, `"non -Council"`, `"its peace peacekeepers"` are
    PDF defects in the ground truth appearing as difference rows, unflagged. The
    PV is also simply wrong in at least three places where both transcribers are
    right (S/PV.9722), which bounds how far it can serve as an oracle.

## Where that leaves the qualitative evidence

- The two transcripts are **far more alike than different** — 70% of errors
  shared, near-identical entity accuracy, near-identical visible-garble counts.
- The one real asymmetry is **narrow and directional**: at ambiguous entity
  slots, AssemblyAI is more likely to produce a plausible wrong institution,
  Azure a visible non-word. 3-vs-1 across six meetings. Worth acting on; not
  strong enough to decide a procurement on its own.
- **Neither is usable unreviewed.** The shared failures — reversed actors,
  singular/plural flips on "positions", a misnamed Permanent Representative in
  every mention — are the errors most likely to mislead, and both arms make them.
- The cheapest real mitigation is the same for both and is **external to the
  vendor**: a UN entity glossary and a document-symbol/resolution-number
  validator. One reading agent's estimate: that alone removes 8 of 15
  reader-harming errors in its session. A validator you can build beats a
  hallucination you cannot detect.
