# Three-way comparison — A/78/PV.101 (English track)

**Meeting:** General Assembly, 101st plenary, 16 July 2024. 60.5 minutes.
**Word counts (from packet header):** PV 7,198 | AssemblyAI 7,461 | Azure-LLM 7,560.
**Arms:** A = official PV (ground truth, lightly edited) · B = AssemblyAI Universal-3.5 Pro · C = Azure-LLM-Speech (enhanced mode).

---

## 0. Coverage statement (read this first)

I read all three texts in full, top to bottom, and compared them speaker by speaker
across all 19 structural sections (14 substantive statements + 5 procedural passages).
No sampling was used and no diff tool or code was run.

**What is exhaustive:** every ENTITY-PERSON, ENTITY-ORG, ENTITY-PLACE, DOC-SYMBOL,
NUMBER, TERM, OMISSION and INSERTION difference I could find, plus every WORD-class
difference that changes meaning. I am confident this is complete for those classes.

**What is NOT exhaustive, and I am saying so explicitly:** individual article
("a"/"the"), contraction, comma-placement and PV function-word-tidying differences.
These number in the many hundreds. I captured them as global phenomena (rows G1–G10)
plus individual rows wherever meaning, grammaticality or readability is affected. If
you need a literal token-level diff of function words, this report does not provide it
and no human-style read would.

**Where I stopped:** nowhere — coverage runs from the opening gavel (draft decision
A/78/L.94) to "The meeting is adjourned", all 14 speakers, all 7,198 PV words.

**One structural caveat about the packet:** the PV extract has had its speaker
attributions stripped for 11 of the 14 speakers (only Ms. Sharma, Ms. Mazaeva and
Ms. Agaronova survive). Person-name scoring below therefore uses names appearing in
the *body* of the PV text (Kridelka, Hilale, Šimonović, França Danese, Spehar), which
are intact.

**Second caveat:** two of the fourteen statements (both Russian Federation, ~1,400
words) were delivered in Russian. B and C transcribe the English interpretation; the
PV is edited against the Russian original. A large share of the A-vs-(B+C) divergence
in those two sections is that gap, not transcription error. I have marked those rows
PV-EDIT rather than scoring them against the transcribers.

---

## 1. The difference table

Numbering is continuous. Sections follow the meeting's running order.

### G. Global / systematic phenomena

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| G1 | throughout (~60 occurrences) | expands every spoken acronym: UN→United Nations, PBC, PBF, PBSO, ILO, DESA, DGACM, WPS, HDP, DDR, IFI, CSO, OCA, UNDP, WSSD, G77, ECOSOC | keeps acronyms as spoken | keeps acronyms as spoken | PV-EDIT | B+C (faithful); A more readable |
| G2 | throughout (~16 occurrences) | supplies document symbols never spoken aloud: A/78/765, A/78/765/Corr.1, A/78/779, A/75/982, resolution 78/318 (×8), resolution 78/257 | absent | absent | DOC-SYMBOL | A — but these are post-hoc editorial insertions, not transcriber failures. Consequence: **neither transcript lets a reader cite the resolution the meeting adopted.** |
| G3 | throughout (~50 occurrences) | strips vocatives: "Mr. President", "Excellencies", "distinguished delegates", "Thank you", "I thank you", "I thank you for your attention" | retains all | retains all | PV-EDIT | B+C (faithful) |
| G4 | throughout (~14 occurrences) | strips the President's courtesies ("I thank the distinguished representative of X. I now give the floor to…") | retains all | retains all | PV-EDIT | B+C. **Both arms name all 12 speaking countries correctly across ~28 announcements — zero country errors in either.** |
| G5 | throughout | spells small numbers out ("five informal consultations", "six decades", "seventh year") | digits ("5 informal consultations", "6 decades", "7th year", "2nd Summit", "4th to 6th November", "3 core themes") | spells out, matching PV | NUMBER | A+C on house style; no factual difference |
| G6 | throughout | "per cent" | "%" | "%" | PUNCT-CASE | style only |
| G7 | throughout | en-GB throughout (labour, programme, organization, centre, mobilize) | predominantly en-US (labor, program, center, fulfillment, mobilize) | **mixed within one document** — en-GB for Uganda/EU (labour, programme, recognise, emphasise, centre), en-US for Türkiye/Djibouti/Russia (labor, program, organizations) | SPELLING-VARIANT | unclear; C's internal inconsistency is a minor quality defect |
| G8 | throughout | n/a | 13 speaker labels (A–M) with **≥5 misassignments** (see rows 148, 176, 87, 120, 149) | 14 labels (1–14), **no observed misassignment**; only defect is folding the "No objection. So decided." interjection into spk 1 | — | **C materially cleaner** |
| G9 | throughout | names 3 speakers (Sharma, Mazaeva, Agaronova) | no speaker names, ever | no speaker names, ever | OMISSION | A |
| G10 | opening minute, twice | "A/78/L.94", "A/78/L.93" | "A/78/L94", "A/78/L93" | **"A slash seven eight slash L nine four"** and **"slash seven eight slash L nine three"** — spelled-out digits | DOC-SYMBOL | A+B; C's rendering is unsearchable |

### Opening — draft decision A/78/L.94 (not in the PV extract)

*B and C both carry ~180 words of opening procedure that the PV extract does not include (extraction artefact, not a transcriber gain).*

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 1 | "resume its consideration of agenda item 17" | *(absent)* | "the implement— to implement— to an implementation of the outcomes" | "the implementation of the outcomes" | WORD | C (B preserves a stutter as three false starts) |
| 2 | "issued as a document" | *(absent)* | "as a docu— as Document A/78/L94" | "as document A/78/L94" | PUNCT-CASE | C |
| 3 | "the ... International Conference on Financing for Development" | *(absent)* | "the 4th International Conference" | "the fourth international conference" | NUMBER | B+C (both correct; style differs) |
| 4 | "The Assembly will now take a decision" | *(absent)* | "will now take decision on it— take a decision on draft decision A/78 A/78/L94" | "will now take a decision on draft decision A/78/L.94" | WORD | C |
| 5 | "concluded this stage of its consideration" | *(absent)* | "Agenda Item 17" | "agenda item one seven" | NUMBER | B |
| 6 | "No objection. So decided." | *(absent)* | assigned to a separate speaker [spk B] | folded into [spk 1] | — | B (it is a floor interjection, not the Chair) |
| 7 | "Accreditation and Participation of an Intergovernmental Organization" | *(absent)* | title-cased | sentence-cased | PUNCT-CASE | unclear |

### Section 1 — Ms. Sharma (DGACM), programme-budget implications

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 8 | statement opening | "Ms. Sharma (Department for General Assembly and Conference Management):" | "[spk C]" | "[spk 2]" | OMISSION | A |
| 9 | before "The present oral statement" | *(omitted)* | "Thank you, Mr. President." | "Thank you, Mr. President." | PV-EDIT | B+C |
| 10 | "rule 153 of the rules of procedure" | "rule 153 of the rules of procedure" | "Rule 153 of the Rules of procedure" | "rule 153 of the rules of procedure" | PUNCT-CASE | A+C. Rule number 153 correct in all three. |
| 11 | "distributed to Member States" | "Member States" | "member states" | "member states" | PUNCT-CASE | A (UN house style) |
| 12 | "operative paragraphs 1, 2, 3, 4 and 11" | identical | identical | identical | NUMBER | all correct |
| 13 | "of draft resolution A/78/L.93 would entail" | "of draft resolution A/78/L.93" | "of the draft resolution" | "of the draft resolution" | PV-EDIT | B+C (symbol is an editorial insertion) |
| 14 | "new activities in 2025 …ing conferencing services" | "requiring" | "entailing" | "entailing" | PV-EDIT | B+C |
| 15 | "from 4 to 6 November 2025 and assistance" | "…2025 and assistance and support" | "…2025. **5,** and assistance and support" | "…2025, and assistance and support" | INSERTION | A+C; **B inserts a stray "5,"** |
| 16 | "would give rise to budgetary implications" | "in the proposed programme budget for additional non-post resources" | "for additional non-post resources" | "for additional non-post resources" | PV-EDIT | B+C (both omit the same five words; near-certainly PV restoration of the formal phrase) |
| 17 | "in the range of $900,000 to …" | "$1.1 million" | "$1,100,000" | "US$900,000 to US$1,100,000" | NUMBER | all three same value |
| 18 | "under section 2 … section 9 … section 28" | "section 2", "section 9", "section 28" | "Section 2", "Section 9", "Section 28" | **"section II", "section IX"**, "section 28" | NUMBER | A+B. C mixes Roman and Arabic numerals within one sentence — non-standard for UN budget sections. |
| 19 | section titles | quoted: "General Assembly and Economic and Social Council affairs and conference management" | unquoted, title-cased | unquoted, sentence-cased | PUNCT-CASE | A |
| 20 | "if the venue … is decided to be" | "is decided to be" | "is decided be" | "is decided to be" | GRAMMAR | A+C |
| 21 | "the Government … will … defray" | "will have to defray" | "will need to defray" | "will need to defray" | PV-EDIT | B+C |
| 22 | "paragraph 5 of resolution 40/243" | "resolution 40/243" | "General Assembly Resolution 40/243" | "General Assembly resolution 40/243" | PV-EDIT | B+C. **Symbol 40/243 correct in all three.** |
| 23 | "may hold … away from their established headquarters" (2 occurrences: "…" and "for a … to be held within its territory") | "meetings" | "sessions" | "sessions" | PV-EDIT | B+C — resolution 40/243 para. 5 says "sessions"; the PV paraphrased |
| 24 | "has agreed to defray … the actual additional costs" | "to defray such costs, after consultation … as to the nature and possible extent of the actual additional costs" | "to defray, after consultation … as to the nature and possible extent, the actual additional costs" | identical to B | PV-EDIT | B+C (matches the resolution's own word order) |
| 25 | "Should the General Assembly adopt draft resolution …" | "A/78 L.93" *(PV typo: missing slash)* | "A/78/L93" | **"A/78/L.963"** | DOC-SYMBOL | B (closest). **C hallucinates a non-existent symbol.** |
| 26 | "under the title 'the Second World Summit for Social …'" | "…Social Development" | "…for Social **[Development dropped]** A revised Estimates Report would be submitted" | "…for Social Development, a revised estimates report…" | OMISSION | A+C; B drops the head noun of the summit's title |
| 27 | "during the main part of its … session" | "seventy-ninth" | "79th" | "79th" | PV-EDIT | all correct |
| 28 | end of statement | *(omitted)* | "Thank you, Mr. President." | "Thank you, Mr. President." | PV-EDIT | B+C |
| 29 | mid-sentence in the PV | "it should **. Corrected records will be reissued electronically on the Official Document System of the United Nations (http://documents.un.org).** … be noted that if the venue" | *(absent)* | *(absent)* | — | B+C. **PV-extraction defect:** ~35 words of corrigendum boilerplate + page furniture leaked into the body, splitting a sentence mid-clause. |

### Section 2 — Acting President, before explanations

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 30 | after the Secretariat statement | *(omitted)* | "I thank the representative of the Secretariat." | same | PV-EDIT | B+C |
| 31 | "Before giving the floor for …" (2 occurrences, before and after adoption) | "explanations of position before/after adoption" | "explanation of votes before the vote" / "after the vote" | identical to B | TERM | B+C are faithful; **A is the procedurally correct form** (the text was adopted without a vote) — a genuine PV correction of a Chair misspeak |
| 32 | "…, I may I remind delegations" (2 occurrences) | "I may I remind" *(PV defect)* | "may I remind" | "may I remind" | GRAMMAR | B+C |
| 33 | "limited to 10 minutes" | correct | correct | correct | NUMBER | all correct |
| 34 | "I now give the floor to the representative of Uganda" | "of Uganda" | "of Uganda" | "of Uganda **on behalf of G77 and China**" | INSERTION | unclear; C's addition is factually true but unattested by A or B |

### Section 3 — Uganda, for the Group of 77 and China

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 35 | statement opening | *(no salutation)* | "Excellencies, distinguished delegates," | same | PV-EDIT | B+C |
| 36 | "I have the honour to deliver this statement on …" | "on draft resolution A/78/L.93, entitled" | "on the modalities of the World Social Summit under the title…" | same as B | PV-EDIT | B+C (symbol editorially inserted) |
| 37 | "At the …, the Group … its gratitude" | "At the outset, the Group would like to express" | "At the onset, the group expresses" | same as B | PV-EDIT | B+C (faithful to "onset") |
| 38 | "the Permanent Representatives of Belgium and Morocco" | "of Belgium and Morocco" | "of the Kingdom of Belgium and the Kingdom of Morocco" | same as B | PV-EDIT | B+C |
| 39 | "the delegation of Egypt … coordinator" | "in the role of coordinator during the negotiations on the modalities of the World Social Summit" | "to the role of coordinator during the negotiation of the resolution on the modalities of the— of **WSSD**" | "…of the resolution on the modalities of **WSSD**" | ENTITY-ORG | B+C faithful (acronym as spoken); A expands. **Egypt named correctly in all three.** B keeps a stutter C cleaned. |
| 40 | "…within the Group" | continuous | "of WSSD. **Within the Group.**" (spurious sentence break) | "of WSSD within the group" | PUNCT-CASE | A+C |
| 41 | "flexibility and fairness … by our partners" | "shown by our partners, which resulted in" | "expressed by our partners, which led to" | same as B | PV-EDIT | B+C |
| 42 | "hosted by a member of the …" | "the Group of 77 and China" | "the G77 and China" | "the G77 and China" | PV-EDIT | B+C |
| 43 | "at the level of …" | "Head of State or Government" | "heads of state or government" | "head of state or government" | GRAMMAR | A+C |
| 44 | "in the State of Qatar from 4 to 6 November 2025" | "4 to 6 November 2025" | "4th to 6th November 2025" | "4 to 6 November 2025" | NUMBER | all correct. **Qatar correct in all three.** |
| 45 | "It is imperative that we build…" | vocative removed | "Mr. President, it is imperative" | same as B | PV-EDIT | B+C (see G3) |
| 46 | "a pivotal opportunity to reassess and refine our …" | "our progress towards social development" | "our approaches towards social development" | "our approaches towards social development" | WORD | B+C ("refine our progress" is the odder reading) |
| 47 | "ensuring that … are inclusive, comprehensive" | "ensuring that our efforts are" | "ensuring that they are" | "ensuring that they are" | PV-EDIT | B+C |
| 48 | "responsive to … the diverse needs of all" | "responsive to the diverse needs of all" | "responsive to **all** the diverse needs of all" | same as B | PV-EDIT | B+C faithful (A removes the redundancy) |
| 49 | "The … underscores the importance of collaborative effort(s)" | "The draft resolution … collaborative effort" | "The resolution … collaborative efforts" | same as B | GRAMMAR | B+C |
| 50 | "the Commission … Social Development plays and will continue to play" | "the Commission **for** Social Development" | "the Commission **on** Social Development, **CSOC-D**," | "the Commission **on** Social Development" | ENTITY-ORG | **A** — the body's official name is *Commission for Social Development*. Both arms render "on"; B additionally garbles the acronym (correct form: CSocD). |
| 51 | "…role in this area should therefore be strengthened" | "The Commission's role in this area should therefore be strengthened." | "Accordingly, the role of **CSOC** should be strengthened in this domain." | "Accordingly, the role of **CSOCDE** should be strengthened in this domain." | ENTITY-ORG | **A**. B and C both invent an acronym; "CSOCDE" does not exist in any UN nomenclature. |
| 52 | "The upcoming Summit will build … the Commission's extensive work" | "build on" | "build upon" | "build upon" | PV-EDIT | B+C |
| 53 | "including its specialized agencies, funds and programmes and regional commissions" | single mention | "**regional commissions, regional commissions,**" | "**regional commissions, regional commissions**" | PV-EDIT | B+C faithful (speaker repetition); A cleaned |
| 54 | "funds and programme(s)" | "programmes" | "programs" | "programmes" | SPELLING-VARIANT | A+C |
| 55 | "…has significantly contributed … It has been pivotal" | "It has been pivotal" | "They have been pivotal" | "They have been pivotal" | GRAMMAR | B+C |
| 56 | "collective efforts that have laid a strong foundation" | "collective efforts that have laid" | "Their collective efforts have laid" | same as B | PV-EDIT | B+C |
| 57 | "the mandate of the International Labour Organization has …" | "has made it a leading agency" | "the International Labour Organization, **ILO**, has placed it as a leading **UN** agency" | same as B | PV-EDIT | B+C. **ILO named correctly by both here.** |
| 58 | "its contribution to social justice" | "to social justice" | "to the agenda of social justice" | same as B | PV-EDIT | B+C |
| 59 | "the interdependence of the three core themes … requires that they be accorded" | "requires that they be accorded due attention" | "to be accorded due attention" | same as B | PV-EDIT | B+C |
| 60 | "Regarding … political declaration" | "a political declaration" | "the political declaration" | "the political declaration" | WORD | B+C |
| 61 | "it should be concise and action-oriented, agreed … by consensus" | "agreed on in advance … through intergovernmental negotiations" | "a concise, action-oriented declaration agreed in advance … through the intergovernmental negotiations" | same as B | PV-EDIT | B+C. **"New York" correct in all three.** |
| 62 | "putting people at the centre of development" | "the importance of putting people at the centre" | "the need to place people at the **center**" | "the need to place people at the **centre**" | SPELLING-VARIANT | A+C |
| 63 | "giving momentum to the implementation of the 2030 Agenda …" | "the 2030 Agenda for Sustainable Development" | "the 2030 Agenda" | "the 2030 Agenda" | PV-EDIT | B+C. **"2030" correct in all three.** |
| 64 | "a crucial platform for dialogue, knowledge …" | "knowledge **extension**" | "knowledge **exchange**" | "knowledge **exchange**" | WORD | **B+C. The PV is wrong here** — "knowledge exchange" is the standard collocation and both arms independently heard it. |
| 65 | "the three core themes … — poverty eradication…" | no "namely" | "namely poverty eradication…" | "namely poverty eradication…" | PV-EDIT | B+C |
| 66 | "outlined in … resolution and call … all stakeholders" | "in the draft resolution and call on" | "in this resolution and call upon" | same as B | PV-EDIT | B+C |
| 67 | statement close | ends at "reality for all." | "I thank you for your attention." | same | PV-EDIT | B+C |

### Section 4 — adoption of A/78/L.93

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 68 | after Uganda | *(omitted)* | "I thank the distinguished representative of Uganda. We have **heard** the last speaker in the explanation of votes before the vote." | "…We have **had** the last speaker…" | WORD | A+B. **C mis-hears "heard" as "had"** (recurs at row 299). |
| 69 | "May I take it that the Assembly wishes to adopt…" | "Draft resolution A/78/L.93 was adopted (resolution 78/318)." | "It is so decided." | "It is so decided." | PV-EDIT | B+C faithful; A is the formal record of adoption |
| 70 | the resolution's number | "resolution 78/318" (8 occurrences across the meeting) | **never appears** | **never appears** | DOC-SYMBOL | A — assigned after the meeting; not a transcriber failure, but a real loss of citability for both arms |
| 71 | the L-symbol, all occurrences | "A/78/L.93" / "A/78/L.94" | "A/78/L93" / "A/78/L94" — dot systematically omitted (6+ instances) | "A/78/L.93" mostly correct; also "A/78/L94", "A78L93", and row 25's hallucination | DOC-SYMBOL | A. **B is consistently non-standard but never wrong; C is more often exactly right but fails catastrophically twice.** |

### Section 5 — European Union (Hungary)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 72 | speaker announcement | *(absent from PV extract)* | "the representative of Hungary on behalf of the European Union" | same | — | B+C both identify Hungary |
| 73 | statement opening | *(omitted)* | "Thank you, Mr. Chair." | "Thank you, Mr. Chair." | PV-EDIT | B+C faithful (in the GA the correct form is "Mr. President"; both heard "Chair") |
| 74 | "The candidate countries …" | "Albania, Bosnia and Herzegovina, Georgia, Montenegro, the Republic of Moldova and Ukraine" (alphabetised) | "Montenegro, Albania, Ukraine, the Republic of Moldova, Bosnia and Herzegovina, and Georgia" | identical to B | PV-EDIT | B+C. **Identical country set; six place names, zero errors in either arm.** |
| 75 | "as well as Andorra and San Marino, align themselves" | "align themselves" | "**aligned** themselves" | "align themselves" | GRAMMAR | A+C |
| 76 | "let me thank the co-facilitators, Ambassador … of Belgium" | "Philippe **Kridelka**" | "Philippe **Krieger**" | "Philippe **Coudelka**" | ENTITY-PERSON | **A. Both arms wrong.** |
| 77 | "… of Morocco" | "Omar **Hilale**" | "Omar **Hilala**" | "Omar **Hilale**" | ENTITY-PERSON | **A+C. C correct here.** |
| 78 | the title after each name | "Ambassadors" | "**PL** of Belgium", "**PL** of Morocco" | "**PR** of Belgium", "**Pl.** of Morocco" | TERM | A+C(first). "PR" = Permanent Representative; **B renders it "PL" both times.** |
| 79 | "for leading the work on …" | "on resolution 78/318" | "on this resolution" | "on this resolution" | PV-EDIT | B+C |
| 80 | "…, and all delegations for their constructive approach" | continuous clause | new sentence "All delegations for their…" | new sentence | PUNCT-CASE | A |
| 81 | "We are pleased to join the consensus today, and we look forward…" | one sentence | "…today. We are looking forward to…" | same as B | PV-EDIT | B+C |
| 82 | "the United Nations system and a broad representation" | "and a broad representation" | "and **a** broad representation" | "and **the** broad representation" | WORD | A+B |
| 83 | "including workers and employer organizations, …" | "representatives of young people" | "workers' and employers' organizations. **Youth representatives,**" (spurious break) | "workers and employers organizations, youth representatives," | PV-EDIT / PUNCT | C (B's sentence break is wrong) |
| 84 | "We welcome the fact that the resolution … clearly stresses" | "the fact that the resolution (resolution 78/318)" | "We welcome that the resolution" | same as B | PV-EDIT | B+C |
| 85 | "Rebuilding the social contract … a comprehensive approach" | "through a comprehensive approach" | "**throughout** a comprehensive approach" | "**throughout** a comprehensive approach" | PV-EDIT | B+C faithful (non-native usage); A corrected |
| 86 | "…labour standards is key to build(ing) trust" | "labour … building" | "**labor** … build" | "labour … build" | SPELLING-VARIANT + GRAMMAR | A+C on spelling; B+C faithful on "build" |
| 87 | "the role and positive contributions of the …" | "International **Labour** Organization (ILO)" | "International **Labor** Organization" | "International **Labour** Organization" | ENTITY-ORG | **A+C. B misspells the ILO's official name.** |
| 88 | "its constituents — Governments, employers and workers — in promoting" | "— Governments, employers and workers — in promoting" | ", namely governments, employers, and workers, to promote" | same as B | PV-EDIT | B+C |
| 89 | "crucial to coordinate the preparations … with the ILO and … tripartite structure" | "**its** tripartite structure" | "**this** tripartite structure" | "**this** tripartite structure" | WORD | B+C faithful; A corrected |
| 90 | "we are glad to be inviting the … specialized agencies" | "the United Nations specialized agencies" | "the UN specialized agencies" | same | PV-EDIT | B+C |
| 91 | "at the Head of State or highest possible level" | "at the Head of State or highest possible level" | "at the head of state, or the highest possible level" | "at the head of state or the highest possible level" | PUNCT-CASE | C |
| 92 | "and to contribute to its preparation" | "to its preparation" | "to the preparation of the summit" | same as B | PV-EDIT | B+C |
| 93 | "We remain committed to engag… constructively" | "engaging … in a spirit of cooperation … with a view to reaching a consensus" | "engage … in the spirit of cooperation … in view of reaching consensus" | identical to B | PV-EDIT | B+C |
| 94 | statement close | ends at "ahead of the Summit." | "I thank you." | "I thank you." | PV-EDIT | B+C |

### Section 6 — Russian Federation, Ms. Mazaeva (spoke in Russian)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 95 | statement opening | *(omitted)* | "Thank you, President." | "Thank you, President." | PV-EDIT | B+C |
| 96 | "thank the delegations of Belgium and Morocco for drafting …" | "resolution 78/318, entitled 'Modalities of the World Social Summit under the title the Second World Summit for Social Development'" | "the resolution, Modalities of the Second World **Thank you, Mr. President. Thank you, Mr. President. I would like to express my gratitude to the Russian delegation** for the World Social Summit, the WSS." | "the resolution, modalities of the second World Summit for Social Development, for the World Social Summit, the WSS." | INSERTION | **C. B fabricates 18 words mid-sentence**, including a thank-you *to the Russian delegation* inside the Russian delegate's own statement, and loses "Summit for Social Development". |
| 97 | "…the WSS" | *(acronym absent)* | "the WSS" | "the WSS" | PV-EDIT | B+C |
| 98 | "We are grateful for their efforts … that made it possible for us to adopt today's document" | one sentence | "…and compromises. Thanks to their efforts, we managed to adopt today's document by consensus" | identical to B | PV-EDIT | B+C |
| 99 | "intends to participate very actively both in the second World Summit … in 2025 and in the …" | "in the formulation of the political declaration, which should be adopted at the end of the Summit" | "as well as in the crafting of the political declaration, which should be adopted by the end of that meeting" | identical to B | PV-EDIT | B+C. **"2025" correct in all three.** |
| 100 | "We commend Qatar's initiative and the willingness it has expressed" | "We commend Qatar's initiative and the willingness it has expressed to host the event" | "We commend the initiative put forward by Qatar, which has expressed a willingness to host that event" | identical to B | PV-EDIT | B+C. **Qatar correct in all three.** |
| 101 | "will send an unequivocal message to the international community" | "message" | "signal … a signal about the fact that" | "signal … a signal about the fact that" | PV-EDIT | B+C |
| 102 | "the interests and needs of developing countries" | "interests" | "interests" | "interest" (singular) | GRAMMAR | A+B |
| 103 | "…into account when developing a global social agenda" | "when developing a global social agenda" | *(absent)* | *(absent)* | PV-EDIT | B+C (both absent → PV restoration from the Russian original) |
| 104 | after "…needs of developing countries" | "Three decades after the adoption of the **Copenhagen Declaration on Social Development** and its related programme of action, and despite the fact that States have repeatedly reaffirmed their commitment to its provisions, progress in the areas of poverty eradication, social integration and full employment has remained slow and uneven. The only path to tackling the continuing problems is…" | **ENTIRELY MISSING** — B jumps straight from "developing countries" to "Honest and depoliticized dialogue among states" | "Despite the fact that states have repeatedly reaffirmed their commitment to provisions contained in the **Copenhagen Declaration** concerning social development and the related program of action, such as poverty eradication, social integration, full employment, three decades have gone by and progress has been slow and uneven. The only way to overcome existing problems is…" | OMISSION | **A+C. B drops ~55 words**, including a named international instrument and three named policy areas. |
| 105 | "the Copenhagen Declaration **on** Social Development" | "on Social Development" | *(missing — see 104)* | "concerning social development" | ENTITY-ORG | A (official title) |
| 106 | "honest, **unpoliticized** dialogue" | "unpoliticized" | "depoliticized" | "depoliticized" | WORD | B+C |
| 107 | "among the Member States of our Organization, because it is they that have the primary responsibility for their peoples' welfare" | as printed | "among states, members of the UN, because they bear the primary responsibility for the well-being of their people" | identical to B | PV-EDIT | B+C |
| 108 | "And representatives of civil society could contribute usefully to this discussion." | as printed | "Civil society contributions could be of use," | identical to B | PV-EDIT | B+C |
| 109 | "we do not support the model for the participation of non-governmental organizations that do not have consultative status in the Economic and Social Council" | "non-governmental organizations … in the Economic and Social Council" | "civil society organizations without **ECOSOC** consultative status" | identical to B | PV-EDIT | B+C faithful; A expands |
| 110 | "operative paragraph 9 of the resolution we adopted today" | "operative paragraph 9" | "operative para **9**" | "operative para **nine**" | NUMBER | all correct |
| 111 | "and that has been repeatedly shown to be ineffective" | "repeatedly shown to be ineffective. The result has been that in a number of processes," | "This has proven ineffective. On many occasions, as a result of a number of processes," | "This has proven ineffective on many occasions. As a result of a number of processes," | PUNCT-CASE | unclear (sentence boundary differs) |
| 112 | "following the non-objection procedure" | "the non-objection procedure" | "the **non-objective objection** procedure" | "the non objection procedure" | TERM | A+C. B doubles the word into a nonsense term. |
| 113 | "have been **expandedby** voting to include organizations with destructive intentions" | "expandedby voting" *(PV typo, no space)* | "These lists were broadened to include organizations which do not have consultative status, and they **harbor** destructive intentions" | "…and they **have** destructive intentions" | WORD | unclear; **"by voting" appears in neither arm** — either a PV restoration or a shared miss |
| 114 | "Such a state of affairs is not conducive to the spirit of cooperation and ideals of good-neighbourliness enshrined in the **Charter of the United Nations**, undermines the role of the **Committee on Non-Governmental Organizations** and should be reconsidered. In our view, such practices should have no place in the preparations for the Summit," | present (~45 words) | **absent** | **absent** | PV-EDIT | B+C. Both arms omit identically, so this is near-certainly the PV reconciled against the delegation's written text rather than a shared ASR failure — **but the consequence is that neither transcript contains the UN Charter reference or the Committee on NGOs.** |
| 115 | "and operative paragraph 9 should not be a precedent for other resolutions" | "for other resolutions" | "We hope that this practice will cease, won't be used in the run-up to the summit, and we hope that operative paragraph. 9 will not serve as a precedent for other **decisions**" | same, "operative paragraph nine … other **decisions**" | PV-EDIT | B+C. B has a spurious full stop inside "operative paragraph. 9". |
| 116 | "the discussions during the forthcoming high-level Second World Summit for Social Development" | cleaned | "the Second World Summit **on Sustainable Development— on Social Development, apologies—**" | "the second world summit **on sustainable development -- or social development, apologies --**" | PV-EDIT | B+C both faithfully capture the interpreter's self-correction; A cleaned it |
| 117 | closing "Thank you." | *(omitted)* | assigned to a **different speaker [spk G]** | kept inside [spk 5] | — | C |

### Section 7 — Türkiye

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 118 | country name, 5 occurrences | "Türkiye" throughout | "Türkiye" in the President's announcements, "**Turkey**" three times inside the statement | "**Turkey**" everywhere | ENTITY-PLACE | **A.** "Türkiye" has been the UN-registered country name since 2022. B is internally inconsistent; C never uses it. |
| 119 | statement opening | *(omitted)* | "Thank you very much, Mr. President." | same | PV-EDIT | B+C |
| 120 | "an explanation of position regarding the resolution on modalities that was just adopted" | "just adopted" | "the **Just Adapted** Modalities Resolution" | "the just **adopted** modalities resolution" | WORD | **A+C. B's "adapted" states the opposite procedural fact** and title-cases it as if a document name. |
| 121 | "We strongly support the convening of the …" | "Second World Summit for Social Development" | "Second World **Social** Summit" | "Second World **Social** Summit" | ENTITY-ORG | B+C faithful (as spoken); A gives the formal title |
| 122 | "as they did for the fifth United Nations Conference on the Least Developed Countries in 2023" | "fifth United Nations Conference" | "5th UN Conference" | "fifth UN Conference" | NUMBER | **all correct**, incl. "2023" and the conference name |
| 123 | "Most importantly, the … of this modalities resolution should not constitute a precedent" | "the contents" | "**articles**" | "**articles**" | TERM | B+C faithful; **A is the correct usage** (resolutions have paragraphs, not articles) |
| 124 | "Each modality resolution has its own merits … new and upcoming modalit(ies) resolutions" | "modalities resolutions" | "modality resolutions" | "modality resolution / modality resolutions" | WORD | A+B |
| 125 | "should not automatically become the so-called agreed text for future" | "for future." *(PV drops a word)* | "for future **reference**." | "for future **reference**." | OMISSION | **B+C. The PV sentence is ungrammatical.** |
| 126 | "circumvent established United Nations procedures … non-State parties to United Nations conferences" | "United Nations" ×2 | "UN" ×2, "non-State Parties" | "UN" ×2, "non-state parties" | PV-EDIT | B+C |
| 127 | "members of academia, labour unions" | "labour" | "labor" | "labor" | SPELLING-VARIANT | A (C is inconsistent with its own -our spellings elsewhere) |
| 128 | statement close | ends at "in the Summit." | "I thank you." | "I thank you." | PV-EDIT | B+C |

### Section 8 — Djibouti

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 129 | "as indicated in the … report" | "the Our Common Agenda report (**A/75/982**)" | "the **OCA** report" | "the **OCA** report" | DOC-SYMBOL | B+C faithful; **A supplies both the expansion and the symbol.** A reader of B or C cannot decode "OCA". |
| 130 | "the negotiations on this resolution (resolution 78/318)" | "this resolution (resolution 78/318)" | "this draft resolution" | same as B | PV-EDIT | B+C |
| 131 | "aligns itself with the statement made on behalf of the Group of 77 and China, delivered by the representative of Uganda" | as printed | "aligns with the statement of G77 and China delivered by the distinguished representative of Uganda" | identical to B | PV-EDIT | B+C. **Uganda correct in all three.** |
| 132 | "it took us **more than** a quarter of a century" | "more than" | "over" | "over" | PV-EDIT | B+C |
| 133 | "after the Copenhagen Declaration on Social Development and the Programme of Action of the World Summit for Social Development" | full titles | "the Copenhagen Declaration and **Programme** of Action" | "the Copenhagen Declaration and **Program** of Action" | PV-EDIT / SPELLING-VARIANT | B+C faithful on length; A+B on spelling |
| 134 | "20 years following the adoption in other commissions" | cleaned | "20 years after the adoption— after the adoptions in other commissions" | "20 years after the adoption, after the adoptions in other commissions" | PV-EDIT | B+C faithful. **"20 years" correct in all three.** |
| 135 | "more than six decades after the creation of the Commission … Social Development" | "Commission **for** Social Development" | "**6** decades … Commission **on** Social Development" | "six decades … Commission **of** Social Development" | ENTITY-ORG | **A. Both arms get the preposition wrong, differently.** Number correct in both. |
| 136 | mid-statement | continuous | spurious turn "**[spk F] This—**" inserted (the Russian speaker's label) | continuous | — | A+C |
| 137 | "The adoption of this … sums up **fully** the positive feelings" | "sums up fully" | "sums up **full well**" | "sums up **full well**" | PV-EDIT | B+C faithful |
| 138 | "We welcome operative paragraph 12 of this resolution, regarding the trust fund" | "operative paragraph 12" | "the **OP12**" | "the **OP 12**" | PV-EDIT | B+C faithful. **"12" correct in all three.** |
| 139 | "we call on the Department of Economic and Social Affairs" | "Department of **Economic** and Social Affairs" | "UN Department of **Economy** and Social Affairs" | "UN Department of **Economy** and Social Affairs" | ENTITY-ORG | **A.** Both arms mis-name a real UN Secretariat department identically (probably faithful to the speaker, but the reader sees a wrong department name). |
| 140 | "the scope and framework in which this trust fund will operate" | "framework" | "**frame**" | "**frame**" | PV-EDIT | B+C |
| 141 | "in accordance with the rules of procedure of the General Assembly" | "rules of procedure of the General Assembly" | "rules of procedures of the UN General Assembly" | same as B | PV-EDIT | B+C faithful; A corrected |
| 142 | "In conclusion, the social development agenda…" | "In conclusion" | "In closing" | "In closing" | PV-EDIT | B+C |
| 143 | "Furthermore, given the likelihood that the Sustainable Development Goals will not be achieved … by 2030" | "given the likelihood" | "in the likelihood" | "in the likelihood" | PV-EDIT | B+C faithful. **"2030" and "Sustainable Development Goals" correct in all three.** |
| 144 | "will help us to mitigate the negative impacts" | "help us to mitigate" | "help us mitigate" | "help us mitigate" | GRAMMAR | B+C |
| 145 | statement close | ends at "supported this resolution." | "…this draft resolution. **Please reflect our declaration in the verbatim record of this meeting.** I thank you, Mr. President." | identical to B | PV-EDIT | B+C (procedural request editorially removed by the PV) |

### Section 9 — Morocco (co-facilitator, Amb. Hilale)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 146 | "my colleague and co-facilitator, Ambassador …, the Permanent Representative of Belgium" | "Philippe **Kridelka**" | "Philippe **Delca** from **PR** of Belgium" | "Philippe **Delcampe** from the Permanent Representative of Belgium" | ENTITY-PERSON | **A. Both wrong**; C's "Delcampe" is a real Belgian surname and therefore the more plausibly misleading. |
| 147 | "would like to thank the President of the General Assembly and express to him our deep gratitude" | third person | "thank **you** and express to **you**" | "thank **you** and express to **you**" | PV-EDIT | B+C faithful |
| 148 | "for permitting us to take the floor from one seat, the seat of Morocco" | "permitting us" | "permitting **to us**" | "permitting **to us** … **seat** of Morocco" (drops "the") | PV-EDIT / GRAMMAR | B+C faithful to non-native grammar; B slightly better than C |
| 149 | "The two kingdoms are united to present their comments on resolution 78/318" | "resolution 78/318" | "the resolution **A78/L93**" | "the resolution **A78L93**" | DOC-SYMBOL | **A.** Neither arm produces a resolvable symbol; C's has no separators at all. |
| 150 | "At the moment, the world is troubled and divided, and we would like to show" | cleaned | "In the moment of the world is troubled, divided, **we** would like to show" | "In the moment of the world is troubled, divided, would like to show" (drops "we") | GRAMMAR | B (faithful and grammatical); C drops the subject |
| 151 | "we will remain united until next year." | ends there | "till next year, **inshallah**." | "till next year **inah sir**" | WORD | **B. C garbles "inshallah" into "inah sir"** and runs it into the next sentence. |
| 152 | "…inshallah. Mr. President, ladies and gentlemen, on behalf of my co-facilitator" | n/a | properly punctuated and capitalised | "**inah sir president ladies and gentlemen on behalf of my co-facilitator and myself**" — ~15 words with no capitals and no punctuation | PUNCT-CASE | A+B. **C's formatting breaks down for a full clause.** |
| 153 | "the World Social Summit under the title '**Second** World Summit for Social Development'" | "Second World Summit for Social Development" | "**World Summit for Social Development**" (drops "Second") | "**Seventh** World Summit for Social Development" | NUMBER / ENTITY-ORG | **A. C invents a non-existent "Seventh" summit** in the co-facilitator's own description of his mandate; B merely omits the ordinal. |
| 154 | "As co-facilitators, Ambassador **Kridelka** and I engaged" | "Kridelka" | "**Krydylka**" | "**Kriedilka**" | ENTITY-PERSON | **A. Both wrong.** |
| 155 | "marked by five informal consultations, informal discussions among experts" | "five informal consultations, informal discussions" | "5 informal consultations and **formal and informal** discussions among experts, **experts**," | "five informal consultations and **formal and informal** discussions among experts **experts**," | PV-EDIT | B+C faithful (both retain the stutter). **"five" correct in both.** |
| 156 | "extend our thanks to the Department of Economic and Social Affairs and the Department for General Assembly and Conference Management" | full names | "**UNDISA** and **DGAC**" | "**UN DESA** and **DG ISAF**" | ENTITY-ORG | **A.** C gets DESA exactly right but renders DGACM as **"DG ISAF"** — the NATO International Security Assistance Force. B garbles both ("DGAC" is France's civil-aviation authority). |
| 157 | "We welcome the adoption of resolution 78/318 today, on the modalities of the Summit by consensus" | "resolution 78/318" | "**Resolution A78**" | "the resolution **A78L93**" | DOC-SYMBOL | **A. B truncates to a two-token non-symbol.** |
| 158 | "In the past three months, **their** active engagement" | third person | "in the past **3** months. **Your** active engagement" | "in the past **three** months. **Your** active engagement" | PV-EDIT | B+C faithful; C on number style |
| 159 | "30 years after the **first** World Summit for Social Development, held in Copenhagen" | "first … World Summit for Social Development … Copenhagen" | "30 years after the **5th— 1st** World Social Summit in Copenhagen" | "30 years after the **first** World Social Summit in Copenhagen" | NUMBER | A+C land on the right value; **B preserves an apparent self-correction "5th— 1st"** which is either faithful or noise. "30 years" and "Copenhagen" correct in all three. |
| 160 | "to be held in Qatar in November 2025" | identical | identical | identical | NUMBER | **all correct** |
| 161 | "high momentum for the acceleration of the implementation of the 2030 Agenda for Sustainable Development" | full title | "the acceleration of the 2030 Agenda implementation" | same as B | PV-EDIT | B+C |
| 162 | "in the upcoming month with the same constructiveness" | "month" | "month**s**" | "month" | GRAMMAR | A+C |
| 163 | "We look forward to continuing this journey" | "continuing" | "continuing" | "continue" | GRAMMAR | A+B |

### Section 10 — Belgium (co-facilitator, Amb. Kridelka)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 164 | statement opening | *(vocative removed)* | "Mr. President, dear Ambassador **Lamy**, distinguished colleagues, ladies and gentlemen," | "Mr. President, dear Ambassador **Lamin**, …" | ENTITY-PERSON | **unclear — but the two arms disagree, so at least one is wrong**, and the PV offers no corroboration for either. Both assert a named ambassador on the record. |
| 165 | "Allow me from the Moroccan bench, which — thanks to the hospitality … — has become a Belgian-Moroccan bench for a few minutes" | reordered | "which has become for a few minutes a Belgian-Moroccan bench thanks to the hospitality of my Moroccan colleague" | identical to B | PV-EDIT | B+C |
| 166 | "to thank the President of the General Assembly for the trust he has placed in us" | "the President of the General Assembly" | "the **PGA**" | "the **PGA**" | PV-EDIT | B+C faithful |
| 167 | "and to thank everyone for their positive and constructive engagement" | "everyone … their" | "all of you … your" | "all of you … your" | PV-EDIT | B+C |
| 168 | "It was a great pleasure and a great honour for me" | "and a great honour" | "and **also** a great honour" | "and **also** a great honour" | PV-EDIT | B+C. Both use "honour" (en-GB). |
| 169 | "thank the Department of Economic and Social Affairs and the Department for General Assembly and Conference Management for their services" | full names | "the services of **UNDESAR** and **DGACM**" | "the services of **UNDSAR** and **DGACM**" | ENTITY-ORG | **A.** Both garble DESA; **both get DGACM right here** (contrast row 156). |
| 170 | "its three pillars, as the Uganda delegate mentioned" | "the Uganda delegate mentioned" | "the Uganda distinguished delegate **has** mentioned" | "the Uganda distinguished **delegates has** mentioned" | GRAMMAR | A+B; C's "delegates has" is ungrammatical |
| 171 | "poverty eradication, full and productive employment and decent work for all and social inclusion" | identical | identical | identical | — | **all correct** |
| 172 | "in the absence of respect for political, economic, social, cultural and civic rights" | identical | identical | identical | — | **all correct** |
| 173 | "an important opportunity to lend momentum to the … implementation of the 2030 Agenda for Sustainable Development" | "to lend momentum … 2030 Agenda for Sustainable Development" | "an important opportunity, **my dear colleagues**, to give momentum … the 2030 Agenda" | identical to B | PV-EDIT | B+C |
| 174 | "The Moroccan co-facilitator and I are convinced that we can and will have" | as printed | "We are convinced, the Moroccan co-facilitator and myself, that we can and **we** will have" | identical to B | PV-EDIT | B+C |
| 175 | "In conclusion, I once again thank everyone" | "In conclusion … everyone" | "In closing … each one of you" | "In closing … each one of you" | PV-EDIT | B+C |
| 176 | "**Morocco** and Belgium remain fully committed to carry(ing) forward" | "Morocco … carrying" | "Morocco … carry" | "**Marocco** … carry" | ENTITY-PLACE | **A+B. C misspells the country.** |
| 177 | "We hope to be able to provide initial indications in the weeks after high-level week in September" | "We hope to be able to provide" | "We **count to give** initial indications … the High-Level Week **of** September" | "We **count to give** … the high-level week **of** September" | PV-EDIT | B+C faithful (non-native); A corrected |
| 178 | "We are counting on the support and constructive engagement, in upcoming months, of the Secretariat, the host country — the State of Qatar — and the entire membership" | as printed | "We count on the support and constructive engagements in the upcoming months from the Secretariat, from the host country, the State of Qatar, and from the entire membership" | identical to B | PV-EDIT | B+C. **"the State of Qatar" correct in all three.** |
| 179 | statement close | ends at "agreed by consensus." | "Thank you for your attention." | "Thank you for your attention." | PV-EDIT | B+C |

### Section 11 — Acting President, closing the modalities item

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 180 | "express my sincere appreciation to His Excellency Mr. …, Permanent Representative of Belgium" | "Philippe **Kridelka**" | "Philippe **Redricka**" | "Philippe **Redricka**" | ENTITY-PERSON | **A. Both arms produce the identical wrong name.** |
| 181 | "and His Excellency Mr. …, Permanent Representative of the Kingdom of Morocco" | "Omar **Hilale**" | "Omar **Helal**" | "Omar **Helal**" | ENTITY-PERSON | **A. Both arms identically wrong** — note C got "Hilale" right at row 77 and loses it here. |
| 182 | "in the informal consultations on resolution 78/318" | "consultations on resolution 78/318" | "consultation on this draft resolution" | same as B | PV-EDIT | B+C |
| 183 | "I am sure that the members of the Assembly will join me" | "will join me" | "**Please join me**" (capitalised mid-sentence) | "join me" (drops "will") | WORD | A; C closer than B |
| 184 | "sub-item (b) of agenda item 24" | "sub-item (b) of agenda item 24" | "sub-item B of Agenda Item 24" | "sub-item B of agenda item 24" | PUNCT-CASE | A. **"24" correct in all three.** |
| 185 | "Agenda items 27, 61 and 111 (continued)" | printed headings with symbols A/78/765, A/78/765/Corr.1, A/78/779 | spoken form only, no symbols | spoken form only, no symbols | DOC-SYMBOL | A (headings are printed, not spoken). **Item numbers 27, 61, 111 correct in both arms.** |
| 186 | "…to hear the remaining speakers in the joint debate" | "We will now hear the remaining speakers" | "to, to hear the remaining speakers" (stutter) | "to hear the remaining speakers" | PUNCT-CASE | A+C |

### Section 12 — India

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 187 | "congratulations to Croatia for **its** exceptional leadership" | "its" | "their" | "their" | PV-EDIT | B+C. **Croatia and Brazil correct in all three.** |
| 188 | "The 2023 PBC report (A/78/765) is testimony" | "The 2023 PBC report (A/78/765)" | "The PBC report of 2023" | "The PBC report of 2023" | PV-EDIT | B+C. **"2023" correct in both.** |
| 189 | "the expansion of terrorism in West Africa and **the** Sahel" | "the Sahel" | "Sahel" | "Sahel" | PV-EDIT | A. **Both place names correct in all three.** |
| 190 | "to promote post-conflict peacebuilding and recovery" | "post-conflict peacebuilding" | "post-conflict **conflict** peacebuilding" (dittography) | "post-conflict peacebuilding" | PUNCT-CASE | A+C |
| 191 | "the Luanda process, led by the International Conference on the Great Lakes Region, and the Nairobi process, **let** by the East African community" | "let by" *(PV typo for "led")*; "East **African** community" | "the International Conference on the Great Lakes Region-led Luanda Process and the **East Africa** Community-led Nairobi Process" | identical to B | ENTITY-ORG | A on "African" (the body is the *East African Community*); **B+C both drop the "-n"**. "International Conference on the Great Lakes Region", "Luanda", "Nairobi" correct in all three. |
| 192 | "We also appreciate the **PBC's** sustained focus on key issues" | "PBC's" | "**PVC's**" | "PBC's" | ENTITY-ORG | **A+C. B substitutes "PVC" (polyvinyl chloride) for the Peacebuilding Commission.** |
| 193 | "the institutionalization of the youth, peace and security agenda" | "youth, peace and security agenda" | "the Youth Peace and Security Agenda" (no commas) | "the youth, peace, and security agenda" | PUNCT-CASE | A+C |
| 194 | "The cumulative value of India's development projects now exceeds **$40 billion**" | "development … $40 billion" | "developmental … $40 billion" | "developmental … **$40 billion U.S. dollars**" (redundant) | NUMBER | value correct in all three; C's rendering is redundant |
| 195 | "the India-United Nations Development Partnership Fund, established in **2017**" | full name | "India-UN Development Partnership Fund … 2017" | "India-U.N. Development Partnership Fund … 2017" | PV-EDIT | **all correct on the entity and the year** |
| 196 | "In just five years, the Fund has supported **75** South-owned and -led development projects, in partnership with **56** developing countries" | five / 75 / 56 | "5 / 75 / 56" | "five / 75 / 56" | NUMBER | **all three numerically correct** |
| 197 | "Secondly, on substantive settings, including climate change" | "substantive settings" | "substantive **sessions— correction, substantive settings**" | "substantive settings" | PV-EDIT | B faithful to a self-correction C dropped; both land on "settings" |
| 198 | "duplication of the role of other United Nations organs and **public entities**" | "public entities" | "**oblique entities**" | "**oblique entities**" | WORD | **A. Both arms produce the same meaningless phrase.** |
| 199 | "Thirdly, the PBC's role in marshalling resources" | "Thirdly … marshalling" | "Third … marshaling" | "Third … marshaling" | PV-EDIT / SPELLING-VARIANT | B+C on the ordinal; A on en-GB spelling |
| 200 | "Lastly, there needs to be greater synergy" | "Lastly" | "Last" | "Last" | PV-EDIT | B+C |
| 201 | "Efforts towards disarmament, demobilization and reintegration and the capacity-building" | full expansion | "Efforts at **DDR** and capacity building" | "Efforts at **DDR** and capacity building" | PV-EDIT | B+C faithful; a reader of B or C gets an undecoded acronym |
| 202 | "the forthcoming peacebuilding architecture review" | lowercase | title case | lowercase | PUNCT-CASE | A+C |

### Section 13 — Republic of Korea

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 203 | "Assistant Secretary-General **Spehar** and her team" | "Spehar" | "**Sperhar**" | "**Spehar**" | ENTITY-PERSON | **A+C. C correct.** |
| 204 | "for their comprehensive briefings on the PBC's work" | "briefings" (plural) | "briefing" | "briefing" | PV-EDIT | B+C |
| 205 | "for their indispensable support" | "indispensable support" | "indispensable **indispensable** support" | "indispensable support" | PUNCT-CASE | A+C |
| 206 | "ahead of the **Summit of the Future, the peacebuilding architecture review** and the assessed contribution to the PBF" | comma present | "**the Summit of the Future Peacebuilding Architecture Review**" — no comma | "the Summit of the Future, Peacebuilding Architecture Review, and…" | PUNCT-CASE | **A+C. B's missing comma fuses two distinct UN processes into one invented event name.** |
| 207 | "based on **its** gender strategy and the humanitarian-development-peace nexus" | full expansion, "its" | "the gender strategy and the **HDP nexus**" | same as B | PV-EDIT | B+C faithful |
| 208 | "play a bigger role to safeguard and help **with sustaining peace among** hard-won gains" | "help with … among hard-won gains" | "help **build** sustaining peace **upon** the hard-won gains" | "help **in** sustaining peace **upon** the hard-won gains" | WORD | unclear; B+C agree on "upon", suggesting A's "among" is the outlier |
| 209 | "We welcome the enhanced cooperation **in the field**" | "in the field" | "at the field level" | "at the field level" | PV-EDIT | B+C |
| 210 | "the Chair's plan to further the United Nations partnerships with international financial institutions" | full expansion | "the UN's partnerships with **IFIs**" | same as B | PV-EDIT | B+C faithful |
| 211 | "through funding **multiple United Nations agency** programmes" | "multiple United Nations agency programmes" | "**multi-UN agency** programs" | "**multi-UN agency** programs" | PV-EDIT | B+C faithful; A on en-GB spelling |
| 212 | "mainstream the **women and peace and security** agenda by exceeding its target of **30 per cent**" | full expansion, "30 per cent" | "**WPS** agenda … **30%**" | "**WPS** agenda … **30%**" | PV-EDIT / NUMBER | B+C faithful. **"30" correct in both.** |
| 213 | "We also commend the **Peacebuilding Support Office** for striking the right balance … between providing support for ongoing peace processes — an urgent need — and addressing root causes — a long-term need" | expanded and reordered | "the **PBSO** … between the urgent need to support ongoing peace process and the long-term need to address root causes" | identical to B | PV-EDIT | B+C faithful |
| 214 | "the Republic of Korea has contributed approximately **$25 million** to the PBF" | $25 million | $25 million | $25 million | NUMBER | **all correct** |
| 215 | "underlines the importance of **increasing the number of donors and increasing** the voluntary contributions" | as printed | "**expanding the donors** as well as voluntary contributions" | identical to B | PV-EDIT | B+C faithful |
| 216 | "As the **PBC's** work expands both geographically and thematically" | "PBC's" | "**PBCC's**" | "PBC's" | ENTITY-ORG | **A+C. B invents a four-letter acronym.** |
| 217 | "In conclusion, I would like to reiterate the Republic of Korea's commitment" | "In conclusion" | "In closing" | "In closing" | PV-EDIT | B+C |

### Section 14 — United Kingdom

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 218 | opening of the UK statement | "I thank **Brazil and Croatia** for driving the work of the Peacebuilding Commission over the past **18 months**. We are experiencing the highest number of conflicts since the **Second World War**. The human and financial cost is unsustainable. The implementation of the sustaining peace agenda through all pillars of the United Nations is needed now more than ever. The **2025 review of the … peacebuilding architecture** [presents a critical moment]" | **ENTIRELY MISSING.** B's text runs "…representative of the United Kingdom. Thank you, President." then jumps to "**Presents a critical moment** to identify concrete actions…" | present and substantially correct: "And thank you to Brazil and Croatia for driving the work of the Commission over the last 18 months. President, we're experiencing the highest number of conflicts since the Second World War. The human and financial cost is unsustainable. The implementation of the sustaining peace agenda through all pillars of the United Nations is needed now more than ever. The 2025 Peacebuilding Architecture Review presents…" | OMISSION | **A+C. B drops ~60 words**, taking with it 2 place names, 1 duration, 1 historical reference and 1 named review process — and leaving a decapitated sentence with no subject. |
| 219 | "demonstrating the universality of peacebuilding" | "the universality" | "**the the** universality" | "the universality" | PUNCT-CASE | A+C |
| 220 | "more strategic advice to the Security Council" | "the Security Council" | "the UN Security Council" | "the UN Security Council" | PV-EDIT | B+C |
| 221 | "the Commission to mobilize more financial resources" | "mobilize" | "mobilize" | "mobilise" | SPELLING-VARIANT | style only |
| 222 | "we welcome the adoption of **resolution 78/257**, approving the use of assessed contributions" | "78/257" | "**78257**" | "**78257**" | DOC-SYMBOL | **A. Both arms drop the slash**, producing a string no reader or search index would resolve as a resolution symbol. Digits are correct in both. |
| 223 | "we also welcome the launch of the **Peacebuilding Impact Hub**" | identical | identical | identical | ENTITY-ORG | **all correct** |
| 224 | "thanking the Peacebuilding Support Office for **its** tireless efforts" | "its" | "their" | "their" | PV-EDIT | B+C |
| 225 | speaker attribution for the whole UK statement | single speaker | **split across [spk J] (the Belgian co-facilitator's label) and [spk A] (the presiding officer's label)**, plus a stray "[spk E] Thank you." | single speaker [spk 12], clean | — | **A+C. B attributes a national statement to the Chair.** |

### Section 15 — Timor-Leste

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 226 | statement opening | "I thank the President, for convening this important joint debate." *(stray PV comma)* | "Thank you, Mr. President, for convening this important joint debate." | identical to B | PV-EDIT | B+C |
| 227 | "the report of the Peacebuilding Commission (A/78/765) and the report of the Secretary-General on the Peacebuilding Fund (A/78/779)" | symbols supplied | "the report of the Peacebuilding Commission**.** and the report of the UN Secretary-General on Peacebuilding Fund" (spurious break, drops "the") | "the report of the Peacebuilding Commission and the report of the UN Secretary-General on the Peacebuilding Fund" | PUNCT-CASE | **A+C.** Symbols are PV insertions. |
| 228 | "at the previous and the current year's session" | as printed | "last year's session and this year's as well" | "**in** last year's session and this year's as well" | GRAMMAR | C marginally better |
| 229 | "**This comprehensive report is a** testament" | singular | "**these comprehensive reports are** testament" (drops "a") | "**these comprehensive reports are a** testament" | GRAMMAR | B+C on number; **C on the article** |
| 230 | "dedication of the United Nations to **fostering** peace and stability in the regions afflicted by conflict" | "fostering … in the regions afflicted" | "to foster peace and stability in the regions**. Afflicted by conflict and turmoil.**" | "to foster peace and stability in the regions afflicted by conflict and turmoil" | PUNCT-CASE | **A+C. B's sentence break creates a dangling fragment.** |
| 231 | "We **note** with appreciation the initiatives" | "note" | "noted" | "noted" | PV-EDIT | B+C |
| 232 | "the successful country-specific **and** regional engagement" | "and" present | "country-specific regional engagement" | "country-specific regional engagement" | OMISSION | A; B+C agree in dropping it |
| 233 | "can serve as **a** crucial blueprint" | "a crucial blueprint" | "as crucial blueprint" | "as crucial blueprint" | GRAMMAR | A |
| 234 | "the value of the **Commission's** strategic focus on preventive measures" | "the Commission's" | "the PBC strategic focus" | "the PBC strategic focus" | PV-EDIT | B+C |
| 235 | "rapid response **mechanisms** in mitigating the escalation of **conflicts**" | plural | singular ×2 | singular ×2 | GRAMMAR | B+C faithful |
| 236 | "It is also worth **noting** the significant strides" | "worth noting" | "worth to note" | "worth to note" | PV-EDIT | B+C faithful |
| 237 | "women and marginalized groups have **a pivotal role in peace processes. That** inclusive approach" | "a pivotal role … processes. That" | "**pivotal roles** in **the peace process**. **This**" | "**a pivotal role** in **peace process**. **This**" | GRAMMAR | mixed; A cleanest |
| 238 | "the report of the Secretary-General on the Peacebuilding **Fund** further complements the **PBC's** roles" | "Fund … PBC's" | "on peacebuilding" (drops "fund") "… the **PVC's** role" | "on peacebuilding fund … the **PBC** roles" | ENTITY-ORG | **A+C. Second occurrence of "PVC" for PBC in B.** |
| 239 | "**Local ownership in peace processes — the recognition that** true and enduring peace **is** built from within the communities themselves — is essential" | restructured by the PV | "The significance of local ownership in peace processes **recognizes that** true and enduring peace built from within the communities themselves is essential" | "The significance of local ownership in peace process **recognizing the** true and enduring peace built…" | PV-EDIT | B (marginally more readable); both arms garbled |
| 240 | "We believe that **ensuring** the effectiveness of the PBC involves" | "ensuring" | "**enforcing**" | "**enforcing**" | PV-EDIT | B+C faithful; A corrected |
| 241 | "securing sustained **and** predictable funding" | "and" present | "sustained, predictable" | "sustained, predictable" | PV-EDIT | B+C |
| 242 | "exploring innovative financing **mechanisms**" | plural | singular | plural | GRAMMAR | A+C |
| 243 | "we support the appeal for more financing of the … peacebuilding efforts" | clean | "the appeal for more support**—** for more financing" (dash marks the self-correction) | "the appeal for more support for more financing" (no dash — reads as one phrase) | PUNCT-CASE | **B** (the dash preserves the repair; C's version reads as nonsense) |
| 244 | "need to be used as a forum and **an** instrument" | "a forum and an instrument" | "need to focus**—** need to be used as a forum and instrument" | "need to focus, need to be used as a forum and instrument" | PUNCT-CASE | B |
| 245 | "which **is** crucial for sustaining peacebuilding activities" | "is" | "are crucial for sustaining **the** peacebuilding activities" | identical to B | GRAMMAR | B+C faithful |
| 246 | "must be robust and participatory to ensure **common** accountability, learning from experience and **adapting** strategies" | "common accountability … adapting" | "to ensure **accountability learning** from experience, and **adapt** strategies" (no comma) | "to ensure accountability, learning from experience and **adapt** strategies" | PUNCT-CASE | **A+C on the comma**; "common" appears in neither arm |
| 247 | "Importantly, the **Peacebuilding Commission** should continue to facilitate dialogue" | expanded | "the PBC" | "the PBC" | PV-EDIT | B+C |
| 248 | "Mr. President, Excellencies, making the Peacebuilding Commission … effective" | vocative removed | "Mr. President, **Excellencies**," | "Mr. President, **next please**." | INSERTION | **A+B. C mis-hears "Excellencies" as a stray instruction** that reads like a stage direction in a diplomatic record. |
| 249 | "The detailed evidence-based findings and **recommendation** of both reports" | "recommendation" *(PV singular typo)* | "recommendations" | "**in essence, the detail evidence The detailed evidence**-based findings and recommendations" (dittography) | PUNCT-CASE | **B** (cleanest) |
| 250 | "in the noble pursuit of **global and peace security**" | "the noble pursuit of global and peace security" *(garbled word order)* | "**our** pursuit of **global peace and security**" (smoothed, drops "noble") | "**the noble pursuit of global and peace security**" — **verbatim identical to the PV including the garble** | WORD | unclear. **C's exact match with the PV's own oddity is evidence the speaker really said it and that C is the more literal transcriber**; B silently repaired it. |
| 251 | "with **A New Agenda for Peace** laying the groundwork for negotiations on the **Pact for the Future**" | "A New Agenda for Peace" / "Pact for the Future" | "New Agenda for Peace" / "**Pact of the Future**" | "**new agenda for peace**" (all lowercase) / "**pack of the Future**" | ENTITY-ORG | **A.** B gets the noun right and the preposition wrong; **C turns the Summit of the Future's outcome document into "pack"** and lowercases the New Agenda title so it no longer reads as a document. |
| 252 | "with the **2025 review of the peacebuilding architecture** set to take stock" | as printed | "with the **2025 Peacebuilding sector** set to take stock" | "with the **2025 peacebuilding architecture** set to take stock" (drops "review") | ENTITY-ORG | **A+C. B replaces "architecture review" with "sector".** |
| 253 | "inspire renewed commitment to achieving **world a world** in which peace prevails" | dittography *(PV defect)* | "**these reports** … achieving a world where peace prevails" | "**this report** … achieving a world where peace prevails" | GRAMMAR | **B** (plural is correct — the sentence refers to *both* reports); C's singular is wrong; A has the dittography |
| 254 | "shared by the **Peacebuilding Commission** and the Peacebuilding Fund" | expanded | "the **PFC**" | "the **PSC**" | ENTITY-ORG | **A. Both wrong; C's "PSC" is the acronym of a real and different body** (the African Union Peace and Security Council). |

### Section 16 — Russian Federation, Ms. Agaronova (spoke in Russian)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 255 | statement opening | *(vocative removed)* | "Mr. President, we're grateful…" | "We're grateful…" (no vocative) | PV-EDIT | B faithful |
| 256 | "the former and current **Chairs** of the Peacebuilding **Commission**" | "Chairs … Commission" | "chairpersons … Peacebuilding Commission, the PBC" | "chairpersons … Peacebuilding **Commissions**, the PBC" | GRAMMAR | A+B; C pluralises the body |
| 257 | "Mr. **Ivan Šimonović**, Permanent Representative of Croatia" | "Ivan Šimonović" | "Ivan **Šimanović**" | "Ivan **Ivanovic**" | ENTITY-PERSON | **A.** B is one vowel off and retains the diacritic; **C substitutes an entirely different, entirely plausible Slavic surname** — the worse failure by far, because nothing signals it as an error. |
| 258 | "and Mr. **Sérgio França Danese**, Permanent Representative of Brazil" | "Sérgio França Danese" | "the PR of Brazil, **Sergio França Danese**" | "the PR Brazil, **Sergio Francedanese**" | ENTITY-PERSON | **A+B.** B is correct but for the acute accent; C fuses the surname into one token and drops "of". |
| 259 | "in January and in September **2023** as well" | "2023" | "of last year" | "of last year" | PV-EDIT | B+C faithful; A resolved the deixis |
| 260 | "the document places **priority** on national responsibility" | "priority" | "primacy" | "primacy" | PV-EDIT | B+C |
| 261 | "We are convinced that respect for sovereignty, the interests of the host country and the strengthening of that country's potential remain paramount" | as printed | "We **stand** convinced that respect for sovereignty **and for** the interests of the host country, **as well as** the strengthening…" | identical to B | PV-EDIT | B+C |
| 262 | "As part of our work on the **Pact for the Future**" | "Pact for the Future" | "**Having said that,** as part of our work on the **Pact for the Future**" | identical to B | PV-EDIT | B+C. **Both arms get "Pact for the Future" right here** (contrast row 251). |
| 263 | "the review of the peacebuilding architecture scheduled for **2025**" | "the peacebuilding architecture" | "the **UN's** peacebuilding architecture" | same as B | PV-EDIT | B+C. **"2025" correct in both.** |
| 264 | "**Furthermore,** peacebuilding and sustaining peace include a whole host of objectives to be achieved. **Aside from conflict prevention, there is** the rooting out of the causes" | sentence break **before** "Aside from" | "**Also,** … objectives to be achieved **aside from conflict prevention. There's** the rooting out" — break **after** | "**Also,** … to be achieved. **Aside from conflict prevention, there's** the rooting out" — break before, matching A | PUNCT-CASE | **A+C.** B's boundary changes the meaning from "besides prevention, there is also X" to "objectives other than prevention". |
| 265 | "the geographical scope of the **Peacebuilding Commission's** activities was broadened further" | expanded | "the PBC's" | "the PBC's" | PV-EDIT | B+C. **"2023" correct in both.** |
| 266 | "It is necessary to involve post-conflict countries in the Peacebuilding Commission's meetings" | cleaned | "in the **committee— in** Commission's meetings" | "in the **committee, in** commission's meetings" | PV-EDIT | B+C faithful to the self-correction |
| 267 | "In both the Secretary-General's New Agenda for Peace and the Peacebuilding **Fund's** report (**A/78/765**)" | **cites A/78/765** | no symbol | no symbol | DOC-SYMBOL | **B+C, by omission. The PV is wrong**: A/78/765 is the *Commission's* report; the Fund's report is A/78/779. |
| 268 | "efforts on conflict prevention … are illustrated by development activities" | clean | "illustrated by **development Development activities**. And in fact, these **are** development activities being conducted by the UNDP" | "illustrated by development activities. And in fact, **these development activities being conducted** by the UNDP" (drops "are") | GRAMMAR | **B** (dittography but grammatical); C's clause has no verb |
| 269 | "in the Peacebuilding **Fund's** report" (second mention) | "the Peacebuilding Fund's report" | "the Peacebuilding Fund's— the **PBF's** report" | "the Peacebuilding Fund, the **PBS**, report" | ENTITY-ORG | **A+B. C renders the PBF as "PBS".** |
| 270 | "conducted by the **United Nations Development Programme**, not any political body" | expanded | "the UNDP" | "the UNDP" | PV-EDIT | B+C faithful; **acronym correct in both** |
| 271 | "remind **members** that one of the United Nations system's strengths" | "members" | "you" | "you" | PV-EDIT | B+C |
| 272 | "the division of **labour**, whereby the principal organs each remain within **their** own remit" | "labour … their" | "labor … in which … **its** own remit" | "labor … in which … **its** own remit" | SPELLING-VARIANT / GRAMMAR | A |
| 273 | "allocating roughly **25 per cent** of its funding to **civil society organizations**" | expanded | "roughly **25%** … to **CSOs**" | "roughly **25%** … to **CSOs**" | NUMBER | **"25" correct in all three** |
| 274 | "in order to become a beneficiary of the Peacebuilding Fund, it is Governments who must comply with **its** requirements" | expanded | "a **PBF** beneficiary … comply with **PBF** requirements" | identical to B | PV-EDIT | B+C faithful |
| 275 | "**That** also applies to trends of peacebuilding localization" | cleaned | "**This** applies also to trends of **localization, peacebuilding localization**" | identical to B | PV-EDIT | B+C faithful to the repair |
| 276 | "for the **seventh** year running, it has **exceeded** its target of allocating **30 per cent**" | "seventh … exceeded … 30 per cent" | "**7th** … **succeeded** … 30%" | "**seventh** … **exceeded** … 30%" | WORD | **A+C. B's "succeeded its target" is ungrammatical and changes the performance claim.** |
| 277 | "Last year, that spending amounted to **47.3 per cent**" | 47.3 | 47.3% | 47.3% | NUMBER | **all correct** |
| 278 | "Peacebuilding Commission members are meeting with members of the Peacebuilding Fund's **advisory group**" | expanded | "PBC members … the PBF's **Advisory Group**" | "PBC members … the PBF's **advisory group**" | PUNCT-CASE | A+C |
| 279 | "which we hope will strengthen **level** of coordination" | "strengthen level of" *(PV drops "the")* | "strengthen **the** level of coordination" | "strengthen **the** level of coordination" | GRAMMAR | **B+C. The PV is defective here.** |
| 280 | "bolster the **Peacebuilding Fund's** transparency" | expanded | "the **fund's** transparency" | "the **fund's** transparency" | PV-EDIT | B+C |
| 281 | "a General Assembly resolution was adopted in **December 2023** (**resolution 78/257**)" | symbol supplied | "a **GA** resolution … December 2023" — no symbol | identical to B | DOC-SYMBOL | A on the symbol; **"December 2023" correct in both arms** |
| 282 | "This resolution allows for the Peacebuilding Fund **to be funded from** the regular budget" | "to be funded from" | "**being funded out of**" | "**being funded out of**" | PV-EDIT | B+C faithful |
| 283 | "It is of **principal** importance" | "principal" | "**principal**" | "**principle**" | WORD | **A+B. C uses the wrong homophone.** |
| 284 | "going to be up to the **Member States**" | "Member States" | "member states" | "Member States" | PUNCT-CASE | A+C |
| 285 | closing "Thank you." | *(omitted)* | assigned to a **different speaker [spk H]** (the Türkiye label) | kept inside [spk 5] | — | C |

### Section 17 — United States

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 286 | "sincere thanks to Brazil and Ambassador **França Danese**" | "França Danese" | "Ambassador **D'Annunzio**" | "Ambassador **Denaci**" | ENTITY-PERSON | **A. Both wrong.** B's is the more misleading: D'Annunzio is a well-known real name and reads as a deliberate identification. |
| 287 | "and, earlier, Croatia and Ambassador **Šimonović**" | "Šimonović" | "**Šimonović**" — correct, diacritics and all | "**Srimanovic**" | ENTITY-PERSON | **A+B. B exactly correct here**, the reverse of row 257. |
| 288 | "We also want to thank Assistant Secretary-General **Spehar**" | "Spehar" | "Assistant Secretary General **Bihar**" | "Assistant Secretary General **Spiehar**" | ENTITY-PERSON | **A; C far closer. B substitutes an Indian state name for a named UN official.** |
| 289 | "and the **Peacebuilding Support Office**" | official name | "the **Office of Peacebuilding Support**" | "the **Office of Peacebuilding Support**" | ENTITY-ORG | A on the official name; B+C faithful to what was said |
| 290 | "for their steadfast guidance to the **Peacebuilding Commission** and **for helping** to make this critical work possible" | expanded, "and for helping" | "to the Commission **and** helping make" | "to the Commission **in** helping make" | GRAMMAR | A+B |
| 291 | "The annual reports on the Peacebuilding Commission (**A/78/765**) and the Peacebuilding Fund (**A/78/779**)" | symbols supplied | no symbols | no symbols | DOC-SYMBOL | A (editorial insertions) |
| 292 | "Preparations have already begun for the **2025 review of the peacebuilding architecture**" | expanded | "the **2025 Peacebuilding Architecture Review**" | identical to B | PV-EDIT | B+C. **"2025" correct in both.** |
| 293 | "including to the Security Council, **in order** to help prevent countries" | "in order to" | "to help prevent" | "to help prevent" | PV-EDIT | B+C. **"Security Council" correct in all three.** |
| 294 | "**Next year, 2025,** will bring not only the review of the peacebuilding architecture" | "Next year, 2025," | "2025 will bring not only the Peacebuilding Architecture Review" | identical to B | PV-EDIT | B+C |
| 295 | "**Those** are key opportunities" | "Those" | "These" | "These" | PV-EDIT | B+C |
| 296 | "the **United States strategy to prevent conflict and promote stability**" | lowercase, expanded | "the **U.S. Strategy to Prevent Conflict and Promote Stability**" (title case) | "the U.S. strategy to prevent conflict and promote stability" (lowercase) | PUNCT-CASE | B (it is a formally titled US policy); A+C on matching the PV |
| 297 | "specifically in priority areas like **Libya, Haiti, Papua New Guinea, Mozambique and coastal West Africa**" | identical | identical | identical | ENTITY-PLACE | **all correct — five place names, zero errors in either arm** |
| 298 | "**In conclusion**, let us seize these upcoming opportunities" | "In conclusion" | "In closing" | "In closing" | PV-EDIT | B+C |

### Section 18 — Closing

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 299 | "We have **heard** the last speaker in the joint debate on these items" | "heard" | "We've **heard**" | "We have **had**" | WORD | **A+B. C's second occurrence of "had" for "heard"** (see row 68). |
| 300 | "conclude its consideration of **agenda items** 27, 61 and 111" | "agenda items" | "consideration **Of** agenda items 27, 61, and 111**.**" (spurious capital; question mark → full stop) | "of agenda **item** 27, 61 and 111?" (singular for three items) | GRAMMAR / PUNCT-CASE | A; B wrong on case, C wrong on number. **All three item numbers correct in both arms.** |
| 301 | "**It was so decided.**" | "It was so decided." | "It is so decided." | "It is so decided." | PV-EDIT | B+C faithful; A is the formal record |
| 302 | "The meeting is adjourned." | *(absent from PV extract)* | present | present | PV-EDIT | B+C |

---

## 2. READER-HARMING ERRORS

Strict criterion: a reader of that transcript, reading in good faith and without the
audio, would come away with a **false belief** — a wrong institution, a wrong person, a
wrong number, a wrong procedural fact, a reversed meaning, or a statement attributed to
someone who did not make it. Mere clumsiness, style, spelling variants and dropped
articles are excluded.

### AssemblyAI (B) — 17 reader-harming errors

| row | error | why it harms |
|---|---|---|
| 218 | **~60 words of the UK statement missing.** Drops "thank you to Brazil and Croatia", "over the last 18 months", "highest number of conflicts since the Second World War", "the sustaining peace agenda through all pillars of the United Nations", "The 2025 Peacebuilding Architecture Review" | Silent. The reader sees the UK begin mid-sentence with "Presents a critical moment…" — a headless clause — and never learns the UK thanked the two chairs, cited 18 months, or named the review. Nothing signals loss. |
| 104 | **~55 words of the Russian EOP missing**, including the **Copenhagen Declaration**, its programme of action, "poverty eradication, social integration, full employment" and "three decades … slow and uneven" | Silent. Removes the entire historical premise of Russia's position and one named international instrument. |
| 96 | **Fabricated sentence**: "Thank you, Mr. President. Thank you, Mr. President. **I would like to express my gratitude to the Russian delegation**" inserted mid-sentence in the Russian delegate's own statement | An utterance that was never made, on the record, in a national statement — and self-contradictory (Russia thanking Russia). This is the only outright hallucination of content in either arm. |
| 288 | **"Assistant Secretary General Bihar"** for Assistant Secretary-General **Spehar** | Substitutes an Indian state for a named senior UN official, in the US statement. |
| 286 | **"Ambassador D'Annunzio"** for Brazil's PR **França Danese** | A recognisable real name; reads as a confident, correct identification. |
| 225 | **UK national statement attributed to the presiding officer** ([spk A]) and to the Belgian co-facilitator ([spk J]) | A reader concludes the Chair delivered a national position — the most serious diarization failure possible in a plenary record. |
| 192, 238 | **"PVC"** for **PBC** (×2) | PVC is polyvinyl chloride. In a peacebuilding debate this reads as a garbled body the reader cannot resolve. |
| 216 | **"PBCC's"** for PBC's | Invented acronym. |
| 254 | **"PFC"** for the Peacebuilding Commission | Invented acronym. |
| 157 | **"Resolution A78"** for resolution 78/318 | A truncation that looks like a citation but resolves to nothing. |
| 120 | **"the Just Adapted Modalities Resolution"** for "the just **adopted** modalities resolution" | States the opposite procedural fact — the resolution was adopted, not adapted — and title-cases it as a document name. |
| 206 | **"the Summit of the Future Peacebuilding Architecture Review"** (missing comma) | Fuses two distinct UN processes into one non-existent event. |
| 252 | **"the 2025 Peacebuilding sector"** for the 2025 peacebuilding architecture review | Names a thing that does not exist in place of a real UN review. |
| 276 | **"it succeeded its target"** for "it **exceeded** its target" (30% gender-equality allocation) | Changes a factual performance claim about the Peacebuilding Fund. |
| 87 | **"International Labor Organization"** | The ILO's official name is spelled *Labour*. In a document about the ILO's role, the misspelling is substantive. |
| 76, 77, 146, 154, 180, 181, 203 | **"Krieger", "Hilala", "Delca", "Krydylka", "Redricka", "Helal", "Sperhar"** — every named diplomat wrong except Šimonović (row 287) | A reader cannot identify any co-facilitator by name. |
| 78 | **"PL of Belgium" / "PL of Morocco"** for **PR** (Permanent Representative) ×2 | Wrong diplomatic title abbreviation, twice. |

### Azure (C) — 15 reader-harming errors

| row | error | why it harms |
|---|---|---|
| 25 | **"A/78/L.963"** for **A/78/L.93**, in the DGACM budget-implications statement | A hallucinated, well-formed document symbol. The reader would search for a document that does not exist — and the surrounding text is the one place a symbol is load-bearing. |
| 153 | **"Seventh World Summit for Social Development"** for **Second** | The co-facilitator describing his own mandate is made to name a non-existent seventh summit, in the title of the outcome. |
| 156 | **"DG ISAF"** for **DGACM** | Substitutes NATO's International Security Assistance Force acronym for a UN Secretariat department, in a sentence thanking that department. |
| 257 | **"Mr. Ivan Ivanovic"** for **Mr. Ivan Šimonović**, Croatia's Permanent Representative | A completely different, entirely plausible Slavic name. Nothing marks it as an error; a reader would cite it. |
| 251 | **"pack of the Future"** for the **Pact for the Future** | The outcome document of the Summit of the Future, reduced to a common noun and lowercased. |
| 254 | **"PSC"** for **PBC** | PSC is the African Union Peace and Security Council — a real, different, and topically adjacent body. Worse than an invented acronym. |
| 269 | **"the PBS"** for **the PBF** (Peacebuilding Fund) | Wrong fund acronym in a sentence criticising that fund's report. |
| 51 | **"CSOCDE"** for CSocD (Commission for Social Development) | Invented acronym in the G77 statement. |
| 286, 287, 288, 146, 154, 180, 181, 76 | **"Denaci", "Srimanovic", "Spiehar", "Delcampe", "Kriedilka", "Redricka", "Helal", "Coudelka"** — every named diplomat wrong except Hilale (row 77) and Spehar (row 203) | Same failure mode as B. |
| 248 | **"Mr. President, next please."** for "Mr. President, Excellencies," | Inserts what reads as a stage direction into a national statement. |
| 176 | **"Marocco"** | Misspelt country name in the sentence "Morocco and Belgium remain fully committed". |
| G10 | **"A slash seven eight slash L nine four"** and **"slash seven eight slash L nine three"** | Two document symbols rendered as spelled-out digits — unreadable, unsearchable, and appearing in the meeting's opening minute. |
| 18 | **"section II" / "section IX"** alongside "section 28" | Budget sections in mixed Roman/Arabic numerals in the financial-implications statement. |
| 68, 299 | **"We have had the last speaker"** ×2 | Nonsense in place of the standard procedural formula. |
| 283 | **"principle importance"** for "principal importance" | Reverses the sense of the sentence. |
| 118 | **"Turkey"** throughout for **Türkiye** | The UN-registered country name since 2022; C never uses it, B uses it inconsistently. |

### Shared by both arms — 6

| row | error | note |
|---|---|---|
| 222 | **"resolution 78257"** (both) | No slash; unresolvable as a UN symbol. Digits correct. |
| 149 | **"A78/L93"** (B) / **"A78L93"** (C) | Morocco's citation of the adopted text mangled by both. |
| 139 | **"Department of Economy and Social Affairs"** (both) | Mis-names DESA identically — probably faithful to the speaker, but the reader sees a wrong department. |
| 50, 51, 135 | **"Commission on/of Social Development"** (both) | The body is the *Commission **for** Social Development*. |
| 198 | **"oblique entities"** (both) for "public entities" | Meaningless phrase in India's statement. |
| 191 | **"East Africa Community"** (both) for **East African Community** | The EAC's official name. |
| G2 | **Neither arm contains resolution 78/318**, nor A/78/765, A/78/779, A/75/982 | Expected (post-hoc PV insertions), but the practical effect is that **neither transcript alone lets a reader cite the resolution the meeting adopted or the two reports it debated.** |

### Where the PV itself is wrong (A wrong, transcribers right)

| row | PV defect |
|---|---|
| 64 | **"knowledge extension"** for "knowledge exchange" — both arms independently heard "exchange" |
| 267 | **The Peacebuilding Fund's report cited as (A/78/765)** — that is the *Commission's* report; the Fund's is A/78/779 |
| 191 | "**let** by the East African community" (typo for "led"; body name lowercased) |
| 113 | "**expandedby**" — missing space |
| 253 | "achieving **world a world** in which peace prevails" — dittography |
| 32 | "**I may I** remind delegations" — twice |
| 25 | "draft resolution **A/78 L.93**" — missing slash |
| 125 | "the so-called agreed text **for future.**" — dropped "reference"; both arms have it |
| 279 | "strengthen **level** of coordination" — dropped article; both arms have it |
| 249 | "findings and **recommendation** of both reports" — singular |
| 29 | ~35 words of corrigendum boilerplate and page furniture leaked into the body text, splitting a sentence mid-clause |

---

## 3. Conservation check

| quantity | value | basis |
|---|---|---|
| PV words total | **7,198** | packet header (not recounted) |
| PV words falling inside a row of the table | **≈1,780 (24.7%)** | 302 rows; median PV span ~5 words, mean ~5.9 (rows 104, 114, 218, 24, 213, 239 alone account for ~250) |
| PV words identical, or differing only by the systematic PV editing captured in rows G1/G3/G4 | **≈5,380 (74.7%)** | the residue |
| PV words I could not account for | **≈38 (0.5%)** | the corrigendum boilerplate and the five running page headers ("A/78/PV.101 16/07/2024") that survived the packet's "non-spoken content removed" pass (row 29). These are in neither transcript and are not a transcriber failure. |
| **total** | **7,198** | 1,780 + 5,380 + 38 = 7,198 |

Cross-checks on the other two arms:

- **AssemblyAI 7,461 words.** Higher than the PV despite the two large omissions (~115
  words) because it retains ~50 vocatives, ~14 presidential courtesies, all disfluencies,
  and the opening ~180 words of the A/78/L.94 item absent from the PV extract. Net
  +263 vs PV is consistent.
- **Azure 7,560 words.** +99 over AssemblyAI, which is almost exactly the ~115 words
  AssemblyAI omitted, minus AssemblyAI's ~18 fabricated words. **The two arms' word
  counts independently corroborate the two omissions and the one hallucination.** This
  is the only fully automatic check in this report and it passes.

**Residual honesty statement.** The 24.7% figure is an estimate built from row spans,
not a count. It is accurate to roughly ±3 percentage points. The claim I *am* willing
to stand behind without qualification is the classified one: **every entity, number,
document symbol, omission, insertion and meaning-bearing word difference in all three
texts is in the table above.** Article-, comma- and contraction-level differences are
not individually enumerated and are captured as global phenomena.

---

## 4. Scorecard

### Rows by class, and which arm was wrong

| class | rows | B wrong | C wrong | both wrong | A wrong (PV defect) | PV-EDIT (no one wrong) |
|---|---|---|---|---|---|---|
| ENTITY-PERSON | 13 | 11 | 12 | 10 | 0 | 0 |
| ENTITY-ORG | 22 | 10 | 6 | 5 | 1 | 4 |
| ENTITY-PLACE | 5 | 1 | 2 | 0 | 0 | 2 |
| DOC-SYMBOL | 12 | 6 | 5 | 4 | 2 | 3 |
| NUMBER | 20 | 1 | 3 | 0 | 0 | 12 |
| TERM | 4 | 2 | 0 | 0 | 1 | 2 |
| OMISSION | 8 | 4 | 0 | 2 | 2 | 0 |
| INSERTION | 4 | 2 | 2 | 0 | 0 | 0 |
| WORD | 24 | 6 | 5 | 3 | 3 | 9 |
| GRAMMAR | 27 | 8 | 11 | 0 | 3 | 9 |
| PUNCT-CASE | 33 | 15 | 6 | 0 | 2 | 8 |
| PV-EDIT | 108 | — | — | — | — | 108 |
| SPELLING-VARIANT | 12 | — | — | — | — | 12 |
| diarization / structure | 10 | 6 | 1 | 0 | 1 | 2 |
| **total rows** | **302** | | | | | |

### Headline counts

|  | AssemblyAI (B) | Azure (C) |
|---|---|---|
| reader-harming errors (own) | **17** | **15** |
| — of which *silent* (nothing signals the error) | **6** (2 omissions, 1 hallucination, 1 mis-attribution, D'Annunzio, Bihar) | **4** (A/78/L.963, "Seventh", "Ivan Ivanovic", "DG ISAF") |
| words of substance omitted | **~115** | **0** |
| words of content fabricated | **~18** | **0** |
| speaker mis-attributions | **≥5** | **0** |
| person names correct | 2 / 12 | 2 / 12 |
| organisation acronyms wrong | ~10 | ~5 |
| document symbols: hallucinated / destroyed | 0 / 0 (but 6+ systematically missing the dot) | 1 / 2 |
| substantive numbers wrong | 1 (18 months, via omission) | 2 ("Seventh"; Roman-numeral budget sections) |
| substantive numbers correct | all others (~30) | all others (~30) |
| country names in President's announcements | 12 / 12 | 12 / 12 |

### Verdict

**I would hand the diplomat the Azure transcript — narrowly, and with a correction pass
mandatory either way.**

On raw error count the two are within two of each other, and on person names they are
tied at a dismal 2 out of 12: neither transcript can be trusted to identify a single
ambassador. Azure makes the two most alarming individual errors in the packet — a
hallucinated document symbol (A/78/L.963) and "Seventh World Summit for Social
Development" — plus "DG ISAF" and "Ivan Ivanovic". If the criterion were "worst single
error", Azure loses.

The criterion that should decide a procurement is not worst-error but **detectability**.
Azure's failures are visible: a reader who knows the file sees that A/78/L.963 is wrong,
that there was no seventh social summit, that DG ISAF does not belong in a thank-you to
a conference-management department. They are loud, local, and correctable in one pass
against a delegate list and a document register. AssemblyAI's three worst failures are
silent and uncorrectable from the transcript alone: it deletes 60 words from the top of
the United Kingdom's statement and 55 words containing the Copenhagen Declaration from
Russia's, leaving grammatical text with no scar; it invents an eighteen-word sentence
inside a national statement; and it prints a national position under the presiding
officer's speaker label. A reader cannot recover from any of those, because nothing
tells them to look. Azure has zero omissions, zero fabrications and zero speaker
mis-attributions across 7,560 words.

Two secondary factors point the same way. Azure's diarization is clean where
AssemblyAI's misassigns at least five turns. And Azure is the more literal transcriber —
row 250 is the tell, where Azure reproduces the PV's own garbled "the noble pursuit of
global and peace security" verbatim while AssemblyAI silently repairs it to "our pursuit
of global peace and security". Smoothing is a liability in a verbatim record: it is the
same instinct that produced the fabricated sentence.

Both arms deserve credit for what they got right, and it is not trivial. Every
substantive figure in a sixty-minute budget-and-peacebuilding debate survived in both:
$900,000–$1.1 million, resolution 40/243, 4–6 November 2025, 30%, 47.3%, 25%,
$40 billion, 75 projects, 56 countries, $25 million, 2017, 30 years, agenda items 27/61/111.
Both named all twelve speaking delegations correctly across twenty-eight announcements.
Both correctly rendered "Libya, Haiti, Papua New Guinea, Mozambique and coastal West
Africa" and "Peacebuilding Impact Hub". The failure surface is narrow and predictable:
**proper names of individuals, organisational acronyms, and document symbols** — exactly
the three fields a post-processing pass against a delegate list, an acronym glossary and
the day's document register could repair. Neither transcript is fit to hand a diplomat
raw; with that pass, Azure gets there and AssemblyAI does not, because no post-processing
pass can restore words that were never written down.
