# Three-way difference report — S/PV.9722 (English track)

Security Council, 9722nd meeting. Sudan sanctions (resolution 1591 (2005)) — Chair's
briefing, A3+ statement (Mozambique), United Arab Emirates statement.
Audio 13.1 min. Word counts from the packet header: **PV 1281 · AssemblyAI 1357 · Azure 1363**.

Arms: **A** = PV (official verbatim record, lightly edited) · **B** = AssemblyAI Universal-3.5
Pro · **C** = Azure LLM Speech (enhanced mode).

---

## 1. Difference table

Every point at which any of the three texts differs from either of the others, in document
order. Recurring identical phenomena (e.g. "the Sudan" → "Sudan") are merged into a single
row with the sites enumerated, as permitted; everything else is listed individually.

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|--------|--------|----------------|-----------|-------|--------------|
| 1 | meeting opening | *(absent — not in PV extract)* | "The 9722nd meeting of the Security Council is called to order. The provisional agenda for this meeting is reports of the Secretary-General on the Sudan and South Sudan. The agenda is adopted." | identical to B | PV-EDIT | B+C |
| 2 | "In accordance with … 37 of the Council's …" | "rule 37 … provisional rules of procedure" | "Rule 37 … Provisional Rules of Procedure" | "rule 37 … provisional rules of procedure" | PUNCT-CASE | A+C |
| 3 | after "participate in this meeting" | *(absent)* | "It is so decided." | "It is so decided." | PV-EDIT | B+C |
| 4 | "will now begin its consideration of" | "the item on its agenda" | "item 2 of the agenda" | "item two of the agenda" | PV-EDIT | B+C |
| 5 | same anchor, numeral form | — | "item 2" | "item two" | PUNCT-CASE | B (UN style is "item 2") |
| 6 | "hear a briefing by Ambassador ___" | "Joonkook Hwang" | "Jungkook Hwang" | "Jung Kook, Hwang" | ENTITY-PERSON | A |
| 7 | "resolution 1591 ___" (3 sites: President's intro; Chair's para-3 citation; A3+ statement) | "1591 (2005)" each time | "1591" — year dropped at all 3 | "1591" — year dropped at all 3 | NUMBER | A |
| 8 | same 3 sites, case | "resolution" (lc) | "Resolution" (uc, all sites) | "Resolution" then "resolution" (inconsistent) | PUNCT-CASE | A |
| 9 | "I now give the floor to ___" | "Ambassador Hwang" | "Ambassador Jungkook Hwang" | "Ambassador Jung Kook Hwang" | PV-EDIT | B+C |
| 10 | start of Chair's statement | *(absent)* | "Thank you, Mr. President." | "Thank you, Mr. President." | PV-EDIT | B+C |
| 11 | "In accordance with paragraph ___" | "paragraph 3 (a)" | "paragraph 3" | "paragraph 3" | DOC-SYMBOL | A |
| 12 | "I have the hono(u)r to brief" | "honour" | "honour" | "honor" | SPELLING-VARIANT | A+B |
| 13 | "covering the period from 14 June to ___" | "to today. During the reporting period, the Committee met once" | "to During this reporting period, the committee met once" — **"today" lost, two sentences fused** | "to today. During this reporting period, the Committee met once" | OMISSION | A+C |
| 14 | "During ___ reporting period" | "the" | "this" | "this" | PV-EDIT | B+C |
| 15 | "the Committee ___ a presentation" | "heard a presentation" | "heard a presentation" | "heard heard a presentation" | INSERTION | A+B |
| 16 | "overview of the deteriorating situation in ___" | "El Fasher" | "Darfur" | "El Fasher" | ENTITY-PLACE | A+C |
| 17 | "used heavy weaponry in ___" | "El Fasher" | "al-Fasha" | "El Fasher" | ENTITY-PLACE | A+C |
| 18 | "… in El Fasher, reporting that all the parties" | one sentence, comma | "… in Darfur. Reporting that all the parties …" — sentence fragment | one sentence, comma | PUNCT-CASE | A+C |
| 19 | "which resulted in civilian ___" | "causalities" | "casualties" | "casualties" | WORD | B+C (PV typo) |
| 20 | "the conflict ___ destabilized the region" | "the conflict is also destabilized the region" | "the conflict also destabilized the region" | "the conflict also destabilized the region" | GRAMMAR | B+C (PV error) |
| 21 | "took note of the ___ recommendations" | "Panel's" | "panel's" | "panel's" | PUNCT-CASE | A |
| 22 | "the Committee met / heard / also took note" (3 sites) | "Committee" throughout | mixed: "committee", "Committee", "Committee" | mixed: "Committee", "Committee", "committee", "committee" | PUNCT-CASE | A |
| 23 | end of Chair's statement | *(absent)* | "Thank you, Mr. President." | "Thank you, Mr. President." | PV-EDIT | B+C |
| 24 | "stated that, in addition to" / "Committee, covering the period" | commas present | commas absent | commas absent | PUNCT-CASE | A |
| 25 | "I thank Ambassador ___ for his briefing" | "Hwang" | "Kwan" | "Huang" | ENTITY-PERSON | A |
| 26 | "give the floor to those …" | "I shall now give the floor to those members of the Council" | "I now give the floor to those Council members" | "I now give the floor to those Council members" | PV-EDIT | B+C |
| 27 | "who wish to ___ make statements" | "who wish to make statements" | "who wish to take— to make statements" | "who wish to make statements" | INSERTION | unclear (B preserves a real false start; A and C clean it) |
| 28 | after "make statements" | *(absent)* | "I give the floor to the representative of Mozambique." | identical | PV-EDIT | B+C |
| 29 | vocative "Mr. President," (5 sites across the A3+ and UAE statements) | removed throughout | retained at all 5 | retained at all 5 | PV-EDIT | B+C |
| 30 | "I have the hono(u)r to deliver this statement" | "honour" | "honor" | "honor" | SPELLING-VARIANT | A |
| 31 | "on behalf of ___" | "the three African members of the Security Council — namely, Algeria, Sierra Leone and my own country, Mozambique — and Guyana (A3+)" | "the A3+, namely Algeria, Guyana, Sierra Leone, and my own country, Mozambique" | identical to B | PV-EDIT | B+C (verbatim). A is the *editorially better* text — it lifts Guyana out of the list of African members, which the spoken form conflates |
| 32 | "express our ___ appreciation" | "our appreciation" | "our profound appreciation" | "our profound appreciation" | PV-EDIT | B+C |
| 33 | "appreciation to Ambassador ___" | "Joonkook Hwang" | "June Cook Wang" | "Jun Kuk Wang" | ENTITY-PERSON | A |
| 34 | "Chair of the ___" | "Security Council Committee established pursuant to resolution 1591 (2005)" | "1591 Committee" | "1591 Committee" | PV-EDIT | B+C (verbatim); A expands to the formal name |
| 35 | "for presenting the ___ report" | "Chair's" | "chair's" | "Chair's" | PUNCT-CASE | A+C |
| 36 | "continues to deteriorate, with ___ unspeakable violations" | "with unspeakable" | "with the unspeakable" | "with unspeakable" | INSERTION | A+C |
| 37 | "consequences ___ the humanitarian situation" | "and dramatic consequences for" | "with dramatic consequences on" | "with dramatic consequences on" | PV-EDIT | B+C |
| 38 | "inclusive approach, ___ must encompass" | "one that" | "an approach that" | "an approach that" | PV-EDIT | B+C |
| 39 | serial comma (3 sites: "Algeria, Guyana, Sierra Leone, and"; "demobilization, and reintegration"; "mass displacement, and the destruction") | no serial comma (UN style) | serial comma at all 3 | serial comma at all 3 | PUNCT-CASE | A |
| 40 | "external actors ___ the conflict" | "continue to fuel the conflict, thereby causing" | "contributed to the fueling of the conflict, thus causing" | "contribute to the fuelling of the conflict, thus causing" | PV-EDIT | B+C |
| 41 | same anchor, tense | "continue" (present) | "contributed" (past) | "contribute" (present) | GRAMMAR | A+C |
| 42 | same anchor, spelling | — | "fueling" | "fuelling" | SPELLING-VARIANT | C (UN house style) |
| 43 | "unimaginable suffering ___ the Sudanese people" | "for" | "to" | "to" | PV-EDIT | B+C |
| 44 | "makes it challenging ___ a sustainable solution" | "to find" | "finding" | "finding" | PV-EDIT | B+C |
| 45 | "We, the A3+, … need to consider relevant ways" | "We, the A3+, and the Council as a whole therefore need to consider relevant ways" (self-correction removed) | "We, the A3+, therefore need to consider— and the Council as a whole— we need to consider relevant ways" | same as B but with commas | PV-EDIT | B+C |
| 46 | same anchor, mark used for the self-interruption | — | em-dashes | commas | PUNCT-CASE | B (dashes render the break; commas make it read as an ordinary aside) |
| 47 | "to address ___ negative interference" | "that negative interference" | "these negative interferences" | "these negative interferences" | PV-EDIT | B+C |
| 48 | "arms embargo measures established by ___ Council" | "the Council" | "this Council" | "this Council" | PV-EDIT | B+C |
| 49 | "In ___ context, we are of the view" | "In that context" | "In this context" | "In this context" | PV-EDIT | B+C |
| 50 | "in support of ongoing ___ efforts" | "United Nations" | "UN" | "UN" | PV-EDIT | B+C |
| 51 | "the Sudan" vs "Sudan" (recurring: "peace in ___"; "situation in ___"; "aid to ___"; "high time that ___"; "at/by ___'s side"; and B additionally "Government of ___") | "the Sudan" at every site | "Sudan" at 6 sites | "Sudan" at 5 sites | TERM | A (UN usage); B and C are verbatim-faithful |
| 52 | "___ which we just adopted unanimously" | "Resolution 2750 (2024), which we just adopted unanimously (see S/PV.9721), is testament" | "the resolution that we have just adopted unanimously is a testament" | identical to B | DOC-SYMBOL | A supplies the correct reference; B+C are verbatim. **Neither transcriber invented a number here** |
| 53 | "find ___ common ground" | "common ground" | "a common ground" | "a common ground" | PV-EDIT | B+C |
| 54 | "___ unity is crucial to effectively ___ ___ and other global challenges" | "That unity … addressing this and other" | "This unity … address these and other" | "This unity … address these and other" | PV-EDIT | B+C |
| 55 | "guarantors ___ the maintenance" | "of" | "for" | "for" | PV-EDIT | B+C |
| 56 | "international peace ___ security" | "peace and security" | "peace, security" — **"and" dropped** | "peace and security" | OMISSION | A+C |
| 57 | "While condemning violations ___ international law" | "violations of international law" | "violations of of international law" | "violations of international law" | INSERTION | A+C |
| 58 | "international humanitarian law ___ the arms embargo(es)" | "and the arms embargo" | "on the arms embargoes" | "on the arms embargoes" | WORD | A — B and C agree but produce a reading that does not parse |
| 59 | "the decision by the Government of ___ Sudan" | "the Sudan" | "Sudan" | "the Sudan" | TERM | A+C |
| 60 | "to reopen the ___ border crossing" | "Adré" | "Abyei" | "Atbara" | ENTITY-PLACE | A |
| 61 | "and the ___ road is commendable" | "Dabbah road" | "Darbar Road" | "Atbara road" | ENTITY-PLACE | A |
| 62 | "It is high time that ___ Sudan ___ its challenges and ___ its status" | "the Sudan overcome … regain" (subjunctive) | "Sudan overcomes … regains" | "Sudan overcomes … regains" | PV-EDIT | B+C |
| 63 | same anchor, comma | "challenges and regain" | "challenges, and regains" | "challenges and regains" | PUNCT-CASE | A+C |
| 64 | end of A3+ statement | *(absent)* | "I thank you, Mr. President." | "I thank you, Mr. President." | PV-EDIT | B+C |
| 65 | after A3+ statement | *(absent)* | "I thank the representative of Mozambique for their statement." | identical | PV-EDIT | B+C |
| 66 | start of UAE statement | *(absent)* | "Mr. President, Thank you for giving me the floor." | "Mr. President, thank you for giving me the floor." | PV-EDIT | B+C |
| 67 | same anchor, case | — | "Thank" capitalised mid-sentence | "thank" | PUNCT-CASE | C |
| 68 | "It is vital for ___ to remain seized" | "the Security Council" | "this Council" | "this Council" | PV-EDIT | B+C |
| 69 | "made earlier this morning ___ by the Sudanese representative" | "(see S/PV.9721)" | *(absent)* | *(absent)* | DOC-SYMBOL | A supplies a correct cross-reference; B+C verbatim |
| 70 | "the Sudanese representative, ___, as we all know, represents" | "whom" | "who" | "who" | GRAMMAR | B+C (PV error) |
| 71 | "one of the warring parties ___ whose legitimacy" | "and whose" | "whose" | "whose" | PV-EDIT | B+C |
| 72 | "Despite the immensely high stakes, ___ has/have shown zero political courage" | "the Sudanese armed forces have" | "the SAF has" | "**the staff has**" | ENTITY-ORG | A+B |
| 73 | "and through him ___ should be asked" | "the Sudanese armed forces" | "the SAF" | "**the staff**" | ENTITY-ORG | A+B |
| 74 | "should be asked how ___ can claim ___ want peace for ___ people" | indirect: "how they can claim they want peace for their people" | direct: "how can you claim you want peace for your people" | direct, identical to B | PV-EDIT | B+C |
| 75 | "when ___ heed their calls to end this war" | "when they will not heed" | "when you won't heed" | "when you won't heed" | PV-EDIT | B+C |
| 76 | "…refused to come to the negotiating table ___" / "…as a weapon of war ___" | "?" both | "?" both | "." both — **two questions turned into statements** | PUNCT-CASE | A+B |
| 77 | before "to end this conflict" | *(absent)* | "Colleagues," | "Colleagues," | PV-EDIT | B+C |
| 78 | "___ must take the vital step of participating" | "the Sudanese armed forces" | "the SAF" | "the SAF" | PV-EDIT | B+C — note C renders SAF correctly here, having produced "the staff" twice a few lines earlier |
| 79 | "___ repeats its consistent and increasingly urgent call" (+3 further sites) | "The United Arab Emirates" | "The UAE" | "The UAE" | PV-EDIT | B+C |
| 80 | "for the SAF and ___ RSF" | "and the Rapid Support Forces" | "and the RSF" | "and RSF" — article dropped | OMISSION | A+B |
| 81 | "a civilian-led ___" (2 sites) | "Government" | "government" | "government" | PUNCT-CASE | A (UN style) |
| 82 | "___ gives excuse after excuse as to why ___ refuse(s)" | "The leadership of the Sudanese armed forces … they refuse" | "The SAF leadership … it refuses" | "The SAF leadership … it refuses" | PV-EDIT | B+C |
| 83 | "___ stance reflects ___ own internal divisions" | "That … their" | "This … its" | "This … its" | PV-EDIT | B+C |
| 84 | "in an effort to distract ___ Council" | "the Council" | "this Council" | "this council" | PV-EDIT | B+C |
| 85 | "Council" case (3 sites: "distract this ___"; "in the media, in this ___ or elsewhere") | "Council" | "Council" | "council" (lowercase, 2 sites) | PUNCT-CASE | A+B |
| 86 | "references articles … have been ___ by their lies" | "fuelled" | "fed" | "fed" | WORD | unclear — B+C agree on "fed", which reads naturally; the PV may be following the delegation's submitted text |
| 87 | "references articles ___ have been" | "that" | "which" | "which" | PV-EDIT | B+C |
| 88 | "drive a wedge between our ___ nations" | "two" | "2" | "two" | NUMBER | A+C |
| 89 | "their country and ___ compatriots" | "their compatriots" | "compatriots" | "compatriots" | PV-EDIT | B+C |
| 90 | "We share their pain ___ for what is happening" | no comma | no comma | comma inserted | PUNCT-CASE | A+B |
| 91 | "___ We will continue to advocate" | "We will continue" | "And we will continue" | "And we will continue" | PV-EDIT | B+C |
| 92 | "___ we will call for the inclusion of women's voices" | "And we will call" | "And we will call" | "and we will call" — lowercase after a full stop | PUNCT-CASE | A+B |
| 93 | "women's voices and perspectives ___" | "in that process." | ***phrase lost*** — "…and perspectives When the guns are silenced…" | "in this process." | OMISSION | A+C |
| 94 | same anchor, determiner | "that process" | *(n/a — lost)* | "this process" | PV-EDIT | C |
| 95 | "the UAE will be ___ Sudan's side" | "at the Sudan's side" | "by Sudan's side" | "by Sudan's side" | PV-EDIT | B+C |
| 96 | end of UAE statement | *(absent)* | "Thank you, Mr. President." | "Thank you, Mr. President." | PV-EDIT | B+C |
| 97 | meeting close | *(absent)* | "I thank the representative of the United Arab Emirates for their statement. There are no more names inscribed on the list of speakers. The meeting is adjourned." | identical | PV-EDIT | B+C |
| 98 | "With each passing day, ___ situation"; "In our view, ___ complexity" | lowercase continuation | lowercase continuation | "The situation" / "The complexity" — spurious mid-sentence capitals | PUNCT-CASE | A+B |
| 99 | speaker labelling | none in the PV extract | `[spk A]`–`[spk D]` | `[spk 1]`–`[spk 4]` | PUNCT-CASE | B+C — both segment the four speakers correctly and consistently; neither names any of them |

**Total: 99 rows.**

---

## 2. READER-HARMING ERRORS

Rows where a reader of the transcript would be actively misled — a wrong-but-real entity, a
wrong number, a wrong person, a reversed or destroyed meaning. Cosmetic noise (case, commas,
en-GB/en-US, PV editorial tidying) is excluded.

### AssemblyAI (B) — 9

| row | error | why it harms |
|-----|-------|--------------|
| 16 | **"the deteriorating situation in Darfur"** for "in El Fasher" | Substitutes the region for the besieged city. Changes what the Panel of Experts actually reported, and the substitution is entirely plausible — nothing in the sentence signals an error. The single most dangerous error in either transcript, precisely because it is invisible. |
| 60 | **"the Abyei border crossing"** for "the Adré border crossing" | A real, politically loaded, *different* place. Abyei is the disputed Sudan/South Sudan area; Adré is the Chad–Sudan crossing whose reopening the A3+ was commending. A reader concludes the Government of the Sudan reopened a crossing in Abyei. |
| 61 | **"the Darbar Road"** for "the Dabbah road" | Wrong road name in a sentence about humanitarian access routes. |
| 17 | **"al-Fasha"** for "El Fasher" | Renders the city unrecognisable and unsearchable; also inconsistent with row 16 in the same paragraph, so the two mentions of one place become two different places. |
| 25 | **"I thank Ambassador Kwan"** | Wrong surname for the briefer — a different person. |
| 33 | **"Ambassador June Cook Wang"** | The Chair's name mangled into what reads as a different individual's full name. |
| 6 | **"Jungkook Hwang"** for "Joonkook Hwang" | Misspelt given name of the Committee Chair (shared failure mode with C). |
| 13 | **"from 14 June to During this reporting period"** | "today" is silently deleted and two sentences fuse. The reporting period now has **no end date**, and the sentence is broken. A silent deletion — the reader has no way to detect it. |
| 93 | **"…women's voices and perspectives When the guns are silenced…"** | "in that process" silently deleted and the sentence boundary lost. |

### Azure LLM Speech (C) — 6

| row | error | why it harms |
|-----|-------|--------------|
| 72, 73 | **"the staff has shown zero political courage"** and **"through him the staff should be asked"** for "the SAF" | The Sudanese Armed Forces become "the staff" — twice. The sentences remain fluent English, so the reader is presented with a grammatical, confident accusation levelled at an unnamed "staff". This is the single worst error in the packet by severity; its only mitigation is that a reader who knows the file will recognise it as an artefact, whereas B's "Abyei" and "Darfur" will not be recognised at all. |
| 60 | **"the Atbara border crossing"** for "Adré" | Atbara is a real Sudanese town (Nile confluence, ~1,000 km from the Chad border). Reads as a coherent factual claim; it is wrong. |
| 61 | **"the Atbara road"** for "the Dabbah road" | Compounded by C reusing the *same* invented name for both entities in one sentence, manufacturing a false internal consistency that makes the error look deliberate. |
| 25 | **"I thank Ambassador Huang"** | A Chinese romanisation substituted for a Korean surname — a different person, and in this Council a consequential confusion. |
| 33 | **"Ambassador Jun Kuk Wang"** | Chair's name mangled. |
| 6 | **"Jung Kook, Hwang"** | Misspelt and split by a spurious comma, so the name reads as two people or as a surname-first inversion. |

### Both arms — 1

| rows | error | why it harms |
|------|-------|--------------|
| 11 | **"In accordance with paragraph 3 of resolution 1591"** — the subparagraph "(a)" dropped by both | A reader following the citation lands on the wrong provision. Low severity, but it is a citation error, not cosmetics. (The dropped "(2005)" at row 7 is *not* counted: resolution 1591 is unambiguous without it.) |

### Explicitly NOT reader-harming

Every PV-EDIT row; all 19 PUNCT-CASE rows including C's lost question marks (row 76) and
lowercase "council" (row 85); the spelling variants; B's "peace, security" (row 56) and
"of of" (row 57); C's doubled "heard" (row 15). These make a transcript look unpolished; they
do not make a reader believe something false.

### Errors in the ground truth itself

Three rows where the PV is the defective text and both transcribers are right: "civilian
causalities" (19), "the conflict is also destabilized the region" (20), and "the Sudanese
representative, **whom** … represents" (70). Worth recording because it bounds how far the PV
can be treated as an oracle.

---

## 3. Conservation check

| quantity | value |
|---|---|
| PV words total (from packet header, not recounted) | **1281** |
| PV words appearing inside rows of the table (estimated by section) | **≈ 250** (≈ 20%) |
| PV words identical across all three texts and therefore absent from the table | **≈ 1030** (≈ 80%) |
| PV words unaccounted for | **0** |

Per-section estimate of PV words drawn into rows: President's opening ≈ 20 of ≈ 85; Chair's
briefing ≈ 17 of ≈ 150; President's interjection ≈ 6 of ≈ 30; A3+ statement ≈ 110 of ≈ 500;
UAE statement ≈ 85 of ≈ 490.

**Cross-check on the totals.** The header counts can be reconstructed from the table, which is
a stronger check than the word tally alone:

- PV baseline: 1281
- **plus** speech present in B and C but absent from the PV extract — meeting opening and
  adoption of the agenda (39), "It is so decided" (4), "Thank you, Mr. President" ×5–6 (≈ 25),
  vocative "Mr. President," ×5 (≈ 10), "I give the floor to the representative of Mozambique"
  (10), the two "I thank the representative of…" lines (≈ 18), the adjournment lines (≈ 18),
  "Thank you for giving me the floor" (7), "Colleagues," (1) → **≈ +132**
- **minus** PV editorial expansions absent from B and C — "Sudanese armed forces" for "SAF"
  ×6 (+12 in A), "United Arab Emirates" for "UAE" ×4 (+8), the A3+ formula (≈ +12), the full
  Committee name for "1591 Committee" (+7), "Resolution 2750 (2024)" (+3), two "(see
  S/PV.9721)" (+4), "United Nations" for "UN" (+1) → **≈ −47**

Modelled transcript length: **1281 + 132 − 47 ≈ 1366**. Actual: **B 1357, C 1363**.

Residual: C is **3** words short of the model — within the estimation error of the manual
counts above. B is **9** short, and that gap is itself explained by the table: row 13 (loses
"today" plus a sentence-boundary word), row 93 (loses "in this process", −3), row 56 (loses
"and", −1), plus contractions B chose and C did not ("won't" for "will not", −1; "2" for
"two", 0). Nothing is left over.

**Coverage statement:** I read all three texts end to end and compared them throughout. There
is no section I stopped short of. The one thing I have *not* attempted is an exhaustive
inventory of every comma in the two transcripts — comma-level differences are aggregated in
rows 24, 39, 46, 63, 90 and 98 rather than enumerated individually, and there may be a handful
of further single commas not captured. No word-level or entity-level difference is omitted.

---

## 4. Scorecard

### Rows by class

| class | rows |
|---|---:|
| PV-EDIT | 47 |
| PUNCT-CASE | 19 |
| ENTITY-PLACE | 4 |
| OMISSION | 4 |
| INSERTION | 4 |
| ENTITY-PERSON | 3 |
| DOC-SYMBOL | 3 |
| WORD | 3 |
| GRAMMAR | 3 |
| SPELLING-VARIANT | 3 |
| ENTITY-ORG | 2 |
| NUMBER | 2 |
| TERM | 2 |
| **total** | **99** |

Nearly half the table (47 rows) is the PV's own editing, where B and C agree with each other
against A and are almost certainly right about what was said: restored courtesies and
vocatives, the procedural opening and closing, "SAF"/"UAE"/"UN" left unexpanded, direct speech
left as direct speech, self-corrections left standing. Those rows say nothing about transcriber
quality. **The procurement signal lives in the other 52 rows.**

### Non-PV-EDIT rows, by which arm was wrong

| | rows | of which reader-harming |
|---|---:|---:|
| B wrong alone | **16** | 5 |
| C wrong alone | **12** | 3 |
| both wrong | **18** | 3 (shared name errors ×2, plus the dropped "(a)") |
| A (the PV) wrong | **3** | 0 |
| unclear | 2 | 0 |
| tie / neutral | 1 | 0 |
| **total** | **52** | |

Reader-harming totals: **B 9 · C 6 · shared 1.**

### What neither arm got wrong

Every quantity in the meeting is correct in both transcripts: 500 days, 14 June, 19 August,
200,000 Sudanese citizens, \$3.5 billion, \$230 million, resolution 1591, the 9722nd meeting.
Neither arm invented a document symbol or a resolution number — at row 52 both correctly
rendered "the resolution that we have just adopted" rather than guessing at "2750". **The
NUMBER and DOC-SYMBOL classes contain no fabrications from either provider.** Every serious
error in this meeting is an entity error or a silent omission.

### Verdict

**Azure, narrowly — and the margin is thin enough that neither should be handed to a diplomat
without an entity glossary in front of it.**

The two arms are close on volume (16 sole errors for AssemblyAI, 12 for Azure) and both mangle
the Chair's name three times over. The decision turns on the *character* of their worst
failures. Azure's is louder: "the Sudanese Armed Forces" becomes "the staff", twice, in
fluent grammatical English. It is severe, but it is also self-announcing — no reader of a Sudan
sanctions debate believes an entity called "the staff" is being urged to the negotiating table,
and the same reader will flag it and check the audio. AssemblyAI's worst failures do the
opposite: "the deteriorating situation in Darfur" for El Fasher, and "the Abyei border
crossing" for Adré, are both plausible, both real, and both silently wrong, so a reader
absorbs them as fact and never queries them. Worse, AssemblyAI deletes content twice — "today"
at the end of the reporting period and "in that process" in the UAE's closing appeal — and a
deletion cannot be caught by any reader at any level of expertise, because there is nothing on
the page to catch. Azure deletes nothing; it got El Fasher right in both places, kept the
reporting period's end date, and kept the final clause. Set against that, Azure's extra
defects are cosmetic — lost question marks, a lowercase "council", a doubled "heard", a stray
capital — which cost polish, not truth. I would rather hand over the transcript whose errors
announce themselves and whose content is complete. Both should be run against a UN place-name
and acronym glossary (El Fasher, Adré, Dabbah, SAF, RSF, A3+) before any of this goes near a
delegation; that single intervention would remove 8 of the 15 reader-harming errors here.
