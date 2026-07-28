# Three-way qualitative comparison — synthesis of the first six sessions

Six independent reading agents each read one packet end to end (PV ground truth,
AssemblyAI output, azure-llm output) and enumerated every difference. No diff
tooling: a diff cannot tell that "UNAT" is a real UN body being substituted for a
different one, and that judgement is the whole reason for reading.

**Coverage:** 6 meetings, 3,262 PV reference words, **~400 enumerated difference
rows**. Every agent reported a conservation check against the PV word count
stated in its packet header (not its own recount).

| session | audio | PV words | rows | conservation |
| --- | ---: | ---: | ---: | --- |
| S/PV.9675 | 1.4 m | 92 | 10 | 92/92, 0 unaccounted |
| S/PV.10100 | 4.6 m | 378 | 58 | 0 unaccounted (1-token tokenizer gap flagged) |
| S/PV.10054 | 5.8 m | 594 | 57 | 0 unaccounted; 1-word residue in the B–C reconciliation, reported not rounded |
| S/PV.10069 | 7.9 m | 619 | 76 | 0 unaccounted; ~4–6 word residues on B/C surplus, reported |
| S/PV.10156 | 9.2 m | 921 | 63 | ~14-word residue (~1.4%), reported not explained away |
| S/PV.9826 | 10.0 m | 658 | 94 | 0 unaccounted |

## The central finding: the two vendors fail in different *shapes*

Error **counts** are close. Error **detectability** is not.

### AssemblyAI — fluent, plausible, undetectable

Every one of these is grammatical, institution-shaped, and gives a reader no cue
that anything is wrong:

| session | AssemblyAI output | truth | why it matters |
| --- | --- | --- | --- |
| 10100 | "and to **ESKAT**, the Secretariat of the Council" | no such body | invented UN-shaped acronym (cf. ESCAP, ESCWA) in a list of bodies formally thanked |
| 10069 | "Thank you, **President Barroso**." | no such person in the meeting | a **fabricated named person** attached to the office of Council President |
| 9826 | "no military forces … other than those of **UNRWA**" | UNDOF | a *real but different* UN agency, politically charged, inside the **operative quotation** of a mandate-renewal meeting |
| 10069 | "the **High Representative** for Children and Armed Conflict" | Special Representative of the Secretary-General | swaps one real UN office for another; "High Representative" is a real UN rank |
| 10054 | "invite the representative of Egypt to participate **Any further discussion** in this meeting?" | — | fabricates a procedural step that did not occur, inside a rule-37 invitation |
| 10054, 9826 | standalone "**Aye.**" during a show-of-hands vote | — | invents vocal assent; implies the wrong voting modality |
| 10100 | "the report **to** the Secretary-General" (×2) | "report **of**" | misattributes authorship of S/2026/8 and S/2026/9; a different document class |
| 9826 | "**UNDORF**" | UNDOF | acronym-shaped, would pass a skim |
| 9826 | "Major General Anita **Asma**" | Asmah | a serving officer's name; does not resolve in search |

### Azure — wrong, but visibly wrong

| session | Azure output | truth | detectability |
| --- | --- | --- | --- |
| 9826 | **INDOF / Ndoff / ANDOF / omitted** — 0 of 4 correct | UNDOF | none is a real body; announces its own unreliability. But the meeting exists to renew UNDOF's mandate, so retrieval fails completely |
| 10069 | "the effective implementation of **the sanctuary**" | "the sanctions regime" | obvious garble; reader loses the phrase, believes nothing false |
| 10069 | "the **panel of expert regional partners**" | "the Panel of Experts, regional partners" | fuses two categories into a non-existent body |
| 10069 | "open briefing to **member state delegation** exchanged views" | "for Member States. Delegations exchanged views" | lost sentence boundary changes who attended |
| 10156, 10100 | "**\*\*\*\***" | SCAD (Security Council Affairs Division) | **configuration defect** — see below |
| 10100 | invents a second speaker turn: "Against." / "Yes." | one voice on the record | fabricated speaker in a show-of-hands vote — Azure's one *plausible*-class failure |

### Shared failures — neither vendor protects the reader

Worth stating plainly, because they bound how much either choice buys:

- **10100:** both turn "the parties, **who have** confirmed" into "**We have**
  confirmed" — reversing who asserts the parties' positions.
- **10100:** both flatten "their well-known **positions**" (plural, two parties,
  two irreconcilable positions) to the singular.
- **10100:** both turn "we **rallied to** consensus" into "we **relied on**
  consensus" — inverting the presidency's claim about its own month.
- **10069:** both misname the briefer — PV "Amar **Bendjama**"; AssemblyAI
  "Ammar Benjama" then "Banjama"; Azure "Amar Benjama" then "Banjama". Both
  contradict themselves between opening and closing.
- **10069:** both write "Office **of** the Coordination of Humanitarian Affairs"
  (correct: **for**).
- Both drop the year qualifiers in UN citation form — `resolution 2766 (2024)`
  becomes "2766 of 2024" or bare "2766".

## The production bug this surfaced

Azure mishears **SCAD** (Security Council Affairs Division) as **"SCAT"**, which
is on Microsoft's profanity list. The service's **default** filter mode is
`Masked`, and `lib/providers/azure-llm-speech.ts` never sets the option — so
production output reads *"I would like to thank the \*\*\*\* for the
contributions they made."* Reproduced deterministically in both bitrate arms, in
2 of the 9 sessions scored at the time.

| `profanityFilterMode` | output | assessment |
| --- | --- | --- |
| unset / `Masked` (**current**) | `the **** for the contributions` | content destroyed; reads as a censored expletive from the Council President |
| `Removed` | `the  for the contributions` | **worse** — silently deleted, no trace a word existed |
| `None` | `the SCAT for the contributions` | wrong but visible and recoverable |
| `Tags` | `<profanity>SCAT</profanity>` | wrong but explicitly flagged |

One-line fix. AssemblyAI transcribed the same audio as "SCAD" and never masks.

## Verdicts as returned

Four of six preferred Azure, two preferred AssemblyAI — but every agent called
the margin thin, and several reversed themselves conditionally.

| session | verdict | stated reason |
| --- | --- | --- |
| S/PV.9675 | Azure, tiebreaker only | 128 of ~130 tokens identical; agent explicitly said "not a procurement signal" |
| S/PV.10054 | Azure | AssemblyAI's 2 fabrications beat Azure's 7 visible mis-hearings on harm |
| S/PV.10100 | Azure, *conditional on fixing the profanity mask* | ESKAT + "report to the SG" are quotable and wrong |
| S/PV.9826 | Azure, narrowly | "wrong in a way you can see is safer than wrong in a way you cannot" |
| S/PV.10156 | **AssemblyAI** | the `****` masking destroyed a UN body's name; Azure lowercased institutional titles |
| S/PV.10069 | **AssemblyAI**, *conditional* | AssemblyAI's prose survives quotation; agent said it would **reverse** if names/titles aren't checked against a roster |

## What the agents flagged about the metric itself

Independently of the vendor question, several noted that a large share of all
differences are rows where **both transcribers agree against the PV and are
right** — the PV is a lightly *edited* record (filler removed, third person
substituted, formal titles expanded, house style imposed). On S/PV.10100 that
was 20 of 58 rows; on S/PV.9826, 44 of 94.

Scoring either arm against this PV by WER therefore charges them a large,
roughly equal penalty for being *more faithful to the audio than the ground
truth is*. That is a property of the metric, not a quality signal — and it is
the quantitative reason the WER gap between these two vendors is small and
fragile.
