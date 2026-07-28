# Three-way difference report — S/PV.9642 (English track)

**Meeting:** Security Council, 9642nd meeting, 31 May 2024 — the situation concerning Iraq
(adoption of resolution 2732 (2024), final renewal of the UNAMI mandate).
**Audio duration:** 14.6 minutes.
**Word counts (from packet header):** PV (A) 1574 | AssemblyAI (B) 1729 | Azure-LLM (C) 1720.

Texts compared:
- **A** — official UN verbatim record (PV), non-spoken content removed.
- **B** — AssemblyAI Universal-3.5 Pro.
- **C** — Azure LLM Speech (enhanced mode, unnamed default model).

Read end to end by hand. No diff tool, no script, no code was used.

---

## 1. Difference table

Convention: `∅` = the passage is absent from that arm. Where a systemic phenomenon
recurs (President's linking passages, courtesy openers, capitalisation habits), it is
merged into a single row and the recurrence count is stated in the anchor.

### 1.1 President — opening and the vote (PV lines 8–27)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 1 | opening of the meeting | ∅ (PV renders as non-spoken heading) | "The 9,642nd meeting of the Security Council is called to order. The provisional agenda for this meeting is the situation Concerning Iraq, the agenda is adopted." | "The 9642nd meeting … is called to order. The provisional agenda for this meeting is the situation concerning Iraq. The agenda is adopted." | PV-EDIT | B+C |
| 2 | ordinal of the meeting number | ∅ | "9,642nd" | "9642nd" | NUMBER | unclear (same value; B's thousands comma is non-UN style) |
| 3 | "the situation Concerning Iraq" | ∅ | "Concerning" capitalised mid-phrase | "concerning" | PUNCT-CASE | C |
| 4 | "…Concerning Iraq, the agenda is adopted" | ∅ | comma splice joining two sentences | full stop | PUNCT-CASE | C |
| 5 | "begin its consideration of …" | "the item on its agenda" | "item two of the agenda" | "item 2 of the agenda" | PV-EDIT | B+C |
| 6 | "Members of the Council have before them …" | "Members of the Council have before them document" | "Members of the council have before them. Document" (spurious full stop; lowercase "council") | "Members of the Council have before them document" | PUNCT-CASE | A+C |
| 7 | symbol of the draft resolution | "S/2024/413" | "S/2024/413" | "S/2024/S/PV.21. 413" | DOC-SYMBOL | A+B |
| 8 | "…413, which contains the text of a draft resolution" | "which contains the text" | "the text" | "the text" | PV-EDIT | B+C |
| 9 | symbol of the SG's fortieth report | "document S/2024/368" | "document S/2024/413. 2024/368" (wrong symbol emitted first) | "document S/2024/368" | DOC-SYMBOL | A+C |
| 10 | "the fortieth report" | "fortieth" | "40th Report" | "fortieth report" | NUMBER | A+C (UN style spells ordinals) |
| 11 | "pursuant to paragraph 4" | "paragraph 4" | "paragraph 4" | "paragraph four" | NUMBER | unclear (same value) |
| 12 | citation form of resolution 2107 | "resolution 2107 (2013)" | "Security Council Resolution 2107 of 2013" | "Security Council Resolution 2107 of 2013" | PV-EDIT | B+C on the audio; A on UN citation style (lowercase "resolution", year in parentheses) |
| 13 | symbol of the second SG report | "document S/2024/369" | "document S/2024" (serial number lost) | "document S/2024/369" | DOC-SYMBOL | A+C |
| 14 | "implementation of resolution 2682 (2023)" | "2682 (2023)" | "2682 of 2023" | "2688, 2 of 2023" | NUMBER | A+B |
| 15 | call for the show of hands | ∅ | "Will those in favor of the draft resolution contained in document S/2024/413 please raise their hands?" | "Will those in favour of the draft resolution contained in document S/2024/S/413, please raise their hands." | PV-EDIT | B+C |
| 16 | symbol at the vote call | ∅ | "S/2024/413" | "S/2024/S/413" (spurious "S/") | DOC-SYMBOL | B |
| 17 | "in favor"/"in favour" at the vote call | ∅ | "favor" | "favour" | SPELLING-VARIANT | unclear (UN records use en-GB "favour") |
| 18 | announcement of the result | ∅ | "The result of the voting is as follows:" | "The result of the voting is as follows:" | PV-EDIT | B+C |
| 19 | resolution number of the adopted text | "as resolution 2732 (2024)" | "as Resolution 27." (truncated) | "as resolution 2732 of 2024" | NUMBER | A+C |
| 20 | "adopted unanimously. as resolution 2732 of 2024 I now give the floor…" | punctuated | punctuated | stray full stop then a ~30-word run with no sentence punctuation | PUNCT-CASE | A+B |
| 21 | invitation to explain the vote | "I shall now give the floor to those members of the Council … after the voting." | "I now give the floor to those members of the Security Council … after the vote." | same as B | PV-EDIT | B+C |
| 22 | President's linking passages between speakers (**7 occurrences**: "I now give the floor to the representative of X" / "I thank the representative of X") | ∅ throughout | present, all 7 | present, all 7 | PV-EDIT | B+C |

### 1.2 United States (PV lines 28–62)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 23 | courtesy openers/closers (**~12 occurrences** across all speakers: "Thank you, Mr. President", "I thank you") | ∅ throughout | present | present | PV-EDIT | B+C |
| 24 | first word of the US statement | ∅ | "Thank you, Mr. President." | "Uh thank you Mr. President" | INSERTION | A+B for record style; C is the faithful one but keeps the filler |
| 25 | "welcomes the unanimous adoption of this resolution…" | "this resolution (resolution 2732 (2024)), which renews the mandate of the United Nations Assistance Mission for Iraq (UNAMI)" | "this resolution renewing the mandate of the UN Assistance Mission for Iraq" | same as B | PV-EDIT | B+C (PV inserts the citation and expands "UN") |
| 26 | "to ensure that the mandate clearly reflected" | "reflected" | "reflects" | "reflects" | PV-EDIT | B+C |
| 27 | "the role that UNAMI can play" | "the role that UNAMI can play" | "the role of UNAMI, the role UNAMI can play" (self-correction) | same as B | PV-EDIT | B+C |
| 28 | title of the outgoing envoy | "outgoing Special Representative of the Secretary-General" | "outgoing SRSG" | "outgoing SRSG" | PV-EDIT | B+C (PV expands the acronym) |
| 29 | **name of the outgoing SRSG** | "Ms. Jeanine Hennis-Plasschaert" | "Janine Henni-Plachette" | "Janine Henni-Pleschard" | ENTITY-PERSON | A |
| 30 | **name of the strategic-review author** | "Mr. Volker Perthes" | "Volker Pertes" | "Volker Perthes" | ENTITY-PERSON | A+C |
| 31 | "the independent strategic review" | lowercase | "the Independent Strategic Review" | lowercase | PUNCT-CASE | A+C |
| 32 | "helped guide the revision and renewal of the mandate" | "revision and renewal" | "renewal and revision" | "renewal and revision" | PV-EDIT | B+C |
| 33 | "We all recognize that Iraq has changed" | ∅ | "Colleagues, we all recognize" | "Colleagues, we all recognize" | PV-EDIT | B+C |
| 34 | "monitor further progress towards achieving" | "towards" | "toward" | "toward" | SPELLING-VARIANT | unclear (A en-GB, B+C en-US) |
| 35 | "we, as members of the Council" | "the Council" | "this Council" | "this Council" | PV-EDIT | B+C |
| 36 | "much to be proud of. And we, as members" | full stop | comma | full stop | PUNCT-CASE | unclear |

### 1.3 Russian Federation (PV lines 63–98)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 37 | speaker attribution (**all 7 speakers**) | "Ms. Evstigneeva (Russian Federation) (spoke in Russian):", "Mrs. Broadhurst Estival (France) (spoke in French):" etc. | "[spk B]", "[spk D]" … (opaque) | "[spk 3]", "[spk 6]" … (opaque) | OMISSION | A |
| 38 | what Russia voted for | "voted in favour of the resolution (resolution 2732 (2024))" | "voted in favor of the draft Security Council resolution" | "voted in favor of the draft Security Council resolution" | PV-EDIT | B+C |
| 39 | **name of the Mission** | "United Nations Assistance Mission for Iraq (UNAMI)" | "United Nations Assistance Mission in Iraq" | "United Nations Assistance Mission in Iraq" | ENTITY-ORG | A (the official name is "for Iraq"); B+C are faithful to the interpreter's slip |
| 40 | "the United States penholders" | "the United States penholders" | "the U.S. penholders" | "the U.S. penholders" | PV-EDIT | B+C |
| 41 | "took into account the priorities" | "took into account" | "have taken into account" | "have taken into account" | PV-EDIT | B+C |
| 42 | end date of UNAMI's work | "31 December 2025" | "December 31st, 2025" | "December 31, 2025" | NUMBER | all correct on value; A uses UN date style |
| 43 | "…2025, and by the end of 2024, an agreement" | one sentence | one sentence | split into two sentences ("2025. And by the end of 2024…") | PUNCT-CASE | A+B |
| 44 | "Its mandate(s) will be limited" | "Its mandates" (plural) | "Its mandate" | "Its mandate" | GRAMMAR | B+C (a mission has one mandate; A's plural looks like an editing artefact) |
| 45 | "We trust that the Secretariat will coordinate" | "the Secretariat" | "the United Nations Secretariat" | "the United Nations Secretariat" | PV-EDIT | B+C |
| 46 | "the Mission" / "the Government" / "the Council" (**~25 occurrences packet-wide**) | institutional nouns capitalised throughout | inconsistent (mostly lowercase "mission", "government") | inconsistent (mostly lowercase) | PUNCT-CASE | A |
| 47 | "restoration of Iraqi statehood" | "statehood, and that" | "statehood, statehood, and that" (stutter kept) | "statehood, and that" | INSERTION | A+C |
| 48 | "We highly appreciate Iraq's readiness" | "Iraq's readiness" | "the Republic's readiness" | "the republic's readiness" | PV-EDIT | B+C (both heard the same thing; PV substituted the country name). B is right on capitalisation |
| 49 | "relations with its neighbours" | "neighbours" | "neighbors" | "neighbors" | SPELLING-VARIANT | unclear |
| 50 | "determination to resolve all outstanding issues" | "to resolve all outstanding issues" | "to resolve out— all outstanding issues" (false start, marked) | "to resolve out all outstanding issues" ("out" reads as a stray word) | INSERTION | A for a record; B handles the disfluency better than C |
| 51 | "including the national archives" | "the national archives" | "the National Archives" | "the national archives" | PUNCT-CASE | A+C (B's capitals imply a named institution) |
| 52 | statement closers "I thank you." (**6 occurrences**) | ∅ | present | present | PV-EDIT | B+C |
| 53 | President after Russia's statement | ∅ | "All right. I thank the representative of the Russian Federation." | "I thank the representative of the Russian Federation." | INSERTION | unclear (B's "All right." may be genuine audio) |

### 1.4 United Kingdom (PV lines 100–117)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 54 | "The United Kingdom voted in favour" | "The United Kingdom" | "The UK" | "The UK" | PV-EDIT | B+C |
| 55 | what the resolution renews | "the mandate of the United Nations Assistance Mission for Iraq for a final 19-month period (resolution 2732 (2024))" | "UNAMI's mandate for a final 19-month period" | "UNAMI's mandate for a final 19-month period" | PV-EDIT | B+C |
| 56 | "The Mission has made an important contribution" | "The Mission" | "The UN assistance mission" | "The UN Assistance Mission" | PV-EDIT | B+C on wording; C on capitalisation |
| 57 | "We are pleased that…" | "We are" | "We're" | "We're" | PV-EDIT | B+C |
| 58 | "that the resolution prioritizes support" | "the resolution" | "this resolution" | "this resolution" | PV-EDIT | B+C |
| 59 | serial ("Oxford") comma before the final list item (**~10 occurrences**) | not used | used consistently | not used | PUNCT-CASE | unclear (style); C matches UN house style, B does not |
| 60 | "It is also important that…" | "It is also" | "It's also" | "It's also" | PV-EDIT | B+C |
| 61 | "the opportunity … be realized" | "be realized" (subjunctive) | "is realized" | "is realized" | PV-EDIT | B+C |
| 62 | "further updates on that/this" | "on that" | "on this" | "on this" | PV-EDIT | B+C |
| 63 | "for its hard work" | "its" | "their" | "their" | PV-EDIT | B+C |
| 64 | "for their hard work and all Council members" | continuous | "for their hard work. and all Council members" (spurious full stop, lowercase "and") | continuous | PUNCT-CASE | A+C |
| 65 | UK opener/closer "Thank you, President." | ∅ | present ×2 | present ×2 | PV-EDIT | B+C |

### 1.5 China (PV lines 118–159)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 66 | what China voted for | "the resolution (resolution 2732 (2024)) on the extension of the mandate of the United Nations Assistance Mission for Iraq (UNAMI)" | "the draft resolution on the extension of the mandate of UNAMI" | same as B | PV-EDIT | B+C |
| 67 | "voted in favour/favor" (China) | "favour" | "favor" | "favour" | SPELLING-VARIANT | unclear; note B is internally inconsistent (it wrote "favour" for the UK) |
| 68 | "Since its establishment, in 2003" | comma before the date | no comma | no comma | PUNCT-CASE | B+C |
| 69 | "embark upon a gradual withdrawal" | "embark upon" | "embark on" | "embark on" | PV-EDIT | B+C |
| 70 | **"Respecting the sovereignty of the countries concerned"** | "the countries concerned" | "the countries concerned" | "the country's consent" | WORD | A+B |
| 71 | **"the sine qua non conditions whereby"** | "the sine qua non conditions whereby" | "the sine qua non whereby why" | "the sinon whereby" | TERM | A (B mangles the connective; C destroys the Latin term) |
| 72 | China's statement, "respecting the sovereignty…" → "…just adopted" (**~120 words**) | fully punctuated | fully punctuated | no sentence-initial capitals, almost no full stops for ~120 words | PUNCT-CASE | A+B |
| 73 | "United Nations special political missions" | "United Nations special political missions" | "the UN Special Political Missions" | "the UN special political missions" | PUNCT-CASE | A+C |
| 74 | date of the Iraqi Prime Minister's letter | "On 8 May" | "On the 8th of May this year" | "on the 8th of May this year" | PV-EDIT | B+C (PV drops "this year" and restyles the date) |
| 75 | symbol of the Prime Minister's letter | "(S/2024/378, annex)" | ∅ | ∅ | DOC-SYMBOL | A (an editorial cross-reference the PV adds; not spoken) |
| 76 | "sent a letter to the Secretary-General" | "Secretary-General" | "Secretary-General" | "secretary general" | PUNCT-CASE | A+B |
| 77 | termination date of the mandate | "calling for UNAMI's mandate to be terminated on 31 December 2025" | "calling for the mandate of UNAMI to be terminated on the 31st of December 2025" | same as B, lowercase | PV-EDIT | B+C |
| 78 | "with specific requirements outlining streamlining" | "requirements outlining streamlining, transition and liquidation" | "requirements on mandate streamlining, transition, and liquidation" | same as B | PV-EDIT | B+C (their reading is the coherent one) |
| 79 | "It was on that basis" | "on that basis that the Council members" | "on such a basis that the Council members" | "on such a basis that Council members" | PV-EDIT | B+C |
| 80 | **end of "…the final phase of UNAMI's work"** | "as set out in the resolution just adopted." | "as contained" — sentence breaks off; the clause is lost | "as contained in the resolution just adopted." | OMISSION | A+C |
| 81 | **same point in the sentence** | ∅ | "Thank you, Mr. President. **Thank you, Mr. Ban Ki-moon.** Mr. President," inserted mid-sentence | ∅ | ENTITY-PERSON / INSERTION | A+C |
| 82 | what China hopes the SG will prepare | "a feasible plan for the withdrawal of the Mission's personnel and the liquidation of its assets as required by the resolution" | "a practical transition and liquidation plan" | "a practical transition and liquidation plan" | PV-EDIT | B+C (PV reflects the delegation's submitted text, not the interpretation) |
| 83 | "begin its work in those areas" | "those" | "these" | "these" | PV-EDIT | B+C |
| 84 | "As part of that process" | "As part of that process" | "In this process" | "In this process" | PV-EDIT | B+C |
| 85 | "with respect to its wishes" | "with respect to" (= regarding) | "with respect for" (= deferring to) | "with respect for" | PV-EDIT | B+C on the audio; note the meaning is not identical |
| 86 | "so as to ensure a smooth transition and bring…" | "so as to ensure … and bring" | "to ensure … and to bring" | "to ensure … and to bring" | PV-EDIT | B+C |
| 87 | China's closer | ∅ | "I thank you, President." | "I thank you, President." | PV-EDIT | B+C |

### 1.6 France (PV lines 160–188)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 88 | "thank the United States for its efforts" | "its" | "their" | "their" | PV-EDIT | B+C |
| 89 | "the positions of all the members" | "all the members" | "all members" | "all members" | PV-EDIT | B+C |
| 90 | "as well as the expectations of Iraq" | "as well as" | "and" | "and" | PV-EDIT | B+C |
| 91 | "an illustration of those efforts" | "those" | "these" | "these" | PV-EDIT | B+C |
| 92 | "the United Nations Assistance Mission for Iraq (UNAMI) has played" | full name + acronym | "UNAMI" | "UNAMI" | PV-EDIT | B+C |
| 93 | "in a number of areas, while fully respecting its sovereignty" | "areas, while fully respecting" | "areas, fully respecting" | "areas. fully respecting" (sentence break mid-clause) | PV-EDIT + PUNCT-CASE | B+C on wording; A+B on punctuation |
| 94 | "A new chapter is now beginning for Iraq" | "is now beginning" | "is opening now" | "is opening now" | PV-EDIT | B+C |
| 95 | "France voted in favour of resolution 2732 (2024)" | "voted in favour of resolution 2732 (2024)" | "voted today in favor of Resolution 2732" | "voted today in favor of Resolution 2732" | PV-EDIT | B+C ("today" spoken, dropped by PV; year added by PV) |
| 96 | "It is essential that the liquidation be done" | "It is essential that the liquidation" | "It's essential that this liquidation" | "It's essential that this liquidation" | PV-EDIT | B+C |
| 97 | "the United Nations teams … coordinate with the teams" | plural "teams" ×2 | singular "team" ×2 | singular "team" ×2 | GRAMMAR | B+C |
| 98 | "to ensure as smooth a transition as possible" | "as smooth a transition as possible" | "a fluid transition" | "a fluid transition" | PV-EDIT | B+C (the interpreter's Gallicism; PV idiomatised it) |
| 99 | "property, including the national archives" | "including" | "as well as" | "as well as" | PV-EDIT | B+C |
| 100 | "pay close attention to it" | "close attention to it" | "great attention to this" | "great attention to this" | PV-EDIT | B+C |
| 101 | "including after the closing of UNAMI" | "including after the closing of UNAMI" | "including the liquidation of UNAMI" | "including the liquidation of UNAMI" | PV-EDIT | B+C on the audio; A is the clearer proposition |
| 102 | citation of resolution 2107 (France) | "resolution 2107 (2013)" | "Resolution 2107" | "resolution 2107" | PV-EDIT + PUNCT-CASE | B+C on the audio (no year spoken); A+C on capitalisation |
| 103 | "a resolution of this humanitarian issue" | "this" | "the" | "the" | PV-EDIT | B+C |
| 104 | closer of France's statement | ∅ | ∅ | "Thank you." | OMISSION | C (B appears to have dropped it) |
| 105 | mid-text page furniture | "S/PV.9642 The situation concerning Iraq 31/05/2024" embedded in the running text (PV line 177) | ∅ | ∅ | PUNCT-CASE | B+C (a PV page header leaking into the ground-truth text) |

### 1.7 Guyana on behalf of the A3+ (PV lines 189–210)

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 106 | **speaker cluster for the A3+ statement** | attributed to Guyana | "[spk D]" — the same cluster already used for the United Kingdom | "[spk 7]" — a distinct cluster (C uses 7 clusters for 7 speakers; B uses 6 for 7) | ENTITY-PERSON | C |
| 107 | form of address to the Chair | ∅ | "Mr. President" | "Ms. President" | WORD | B (the May 2024 presidency was held by Mozambique, Ambassador Pedro Comissário Afonso) |
| 108 | "I have the honour" | "honour" | "honor" | "honor" | SPELLING-VARIANT | unclear |
| 109 | composition of the A3+ | "the three African members of the Security Council — Algeria, Mozambique and Sierra Leone — as well as my own country, Guyana (A3+)" | "the A3+ members, namely Guyana, Mozambique, Sierra Leone, and Algeria" | same as B | PV-EDIT | B+C (same four countries; PV expands the formula and reorders) |
| 110 | "the resolution … which charts a new course" | "which charts" | "charting" | "charting" | PV-EDIT | B+C |
| 111 | "the United Nations presence and engagement" | "the United Nations presence" | "the United Nations' presence" (spurious possessive) | "the United Nations presence" | PUNCT-CASE | A+C |
| 112 | citation after "engagement in Iraq" | "(resolution 2732 (2024)." — unbalanced parenthesis | ∅ | ∅ | PUNCT-CASE | B+C (by absence); this is a typo in the PV |
| 113 | "the Security Council's resolute support" | "resolute support" | "resolute, resolute support" (stutter kept) | "resolute support" | INSERTION | A+C |
| 114 | "The resolution reflects the progress" | "The resolution" | "This resolution" | "This resolution" | PV-EDIT | B+C |
| 115 | "The constructive engagement … was vital" | "was vital" | "has been vital" | "has been vital" | PV-EDIT | B+C |
| 116 | "in reaching this unanimous resolution" | "unanimous resolution" | "unanimous decision" | "unanimous decision" | PV-EDIT | B+C |
| 117 | close of the meeting | ∅ | "I thank you." + "I thank the representative of Guyana for this statement and the last statement. There are no more names inscribed on the list of speakers. So the meeting stands adjourned." | identical to B | PV-EDIT | B+C |

### 1.8 Systemic, packet-wide

| # | anchor | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |
|---|---|---|---|---|---|---|
| 118 | en-GB/en-US consistency | consistently en-GB ("favour", "honour", "neighbours", "towards") | mixed: "favour" for the UK speaker, "favor" for Russia/China/France | mixed: "favour" for the UK/China, "favor" for Russia/France | SPELLING-VARIANT | A |
| 119 | capitalisation of "resolution", "Government", "Council", "Mission" | consistent UN house style | inconsistent, over-capitalises "Resolution" | inconsistent, under-capitalises whole passages | PUNCT-CASE | A |

**Total difference rows: 119.**

---

## 2. Reader-harming errors

Only rows where a reader of the transcript would be actively misled — a wrong-but-real
institution or person, a wrong number or document symbol, a reversed or destroyed
meaning. Cosmetic noise (contractions, serial commas, en-GB/en-US, "the Mission" vs
"the mission", the ~90 PV-EDIT rows) is excluded.

### AssemblyAI (B) — 8 strict, 2 borderline

| row | error | why it harms |
|---|---|---|
| 81 | **"Thank you, Mr. Ban Ki-moon."** hallucinated into the middle of China's statement | Invents a greeting to a real, famous former Secretary-General who was not present and had no role in this meeting. A reader — or any downstream index, quote extractor or search — takes this as a fact about who was in the room. This is the single worst error in the packet: it is fluent, plausible and entirely fabricated. |
| 19 | **"adopted unanimously as Resolution 27."** | The resolution number is truncated. The transcript of a meeting whose sole purpose was adopting resolution **2732 (2024)** never states which resolution was adopted. |
| 9 | **"document S/2024/413. 2024/368"** | Emits the draft-resolution symbol where the Secretary-General's fortieth report symbol belongs, then self-corrects. A reader looking up S/2024/413 expecting the SG report gets the wrong document. |
| 13 | **"and document S/2024"** — serial number of S/2024/369 lost | The second SG report becomes uncitable. |
| 29 | **"Janine Henni-Plachette"** for Jeanine Hennis-Plasschaert | The outgoing SRSG's name is unrecognisable and unsearchable. |
| 30 | **"Volker Pertes"** for Volker Perthes | The author of the independent strategic review is misnamed; C got this right, so it is not an unavoidable audio problem. |
| 106 | **Guyana's A3+ statement given the UK's speaker cluster [spk D]** | Merges two different delegations into one speaker. Downstream speaker identification will attribute the A3+ statement — made on behalf of Algeria, Mozambique, Sierra Leone and Guyana — to the United Kingdom. |
| 80 | **"as contained"** — "in the resolution just adopted" dropped | China's sentence about the arrangements for UNAMI's final phase ends mid-clause, losing the reference to the adopted text. Directly adjacent to, and probably caused by, error 81. |
| 51 | *(borderline)* "the National Archives" | Capitalisation turns Kuwait's national archives into what reads as a named institution. |
| 53 | *(borderline)* "All right." attributed to the President | May be genuine; if not, it puts an informalism in the presiding officer's mouth. |

### Azure LLM Speech (C) — 6 strict, 2 borderline

| row | error | why it harms |
|---|---|---|
| 7 | **"document S/2024/S/PV.21. 413"** | Corrupts the draft-resolution symbol by splicing in a fabricated meeting-record symbol. "S/PV.21" is the *shape* of a real UN symbol class, which makes it worse than noise: it looks citable and is not. |
| 14 | **"Resolution 2688, 2 of 2023"** for resolution 2682 (2023) | Resolution 2682 (2023) is the resolution whose implementation the SG reported on. **2688 (2023) is a real, different Security Council resolution.** A reader is pointed at the wrong instrument. |
| 16 | **"document S/2024/S/413"** at the vote call | Second corrupted symbol for the text actually being voted on. |
| 70 | **"respecting the sovereignty of the country's consent"** for "the countries concerned" | Destroys China's central point of principle. "Sovereignty of the country's consent" is not a proposition; a reader cannot recover what was said, and the passage carries China's stated *sine qua non* for establishing special political missions. |
| 71 | **"the sinon whereby"** for "the sine qua non conditions whereby" | Erases the operative diplomatic term in the same sentence. Combined with row 70, roughly the most substantive sentence in China's statement is unusable. |
| 29 | **"Janine Henni-Pleschard"** for Jeanine Hennis-Plasschaert | Same class of failure as B: the SRSG's name is unrecognisable. |
| 72 | *(borderline)* ~120 words of China's statement with no sentence capitals or full stops | Not a factual error, but it makes that passage unquotable and signals to a reader that the record is unreliable exactly where the substance is densest. |
| 107 | *(borderline)* **"Ms. President"** | Misgenders the presiding officer of the Security Council in the official-looking record of a formal address. |

### Ground truth (A) — 2 defects worth noting

- Row 112: `(resolution 2732 (2024).` — unbalanced parenthesis, a typo in the PV itself.
- Row 105: the running page header `S/PV.9642 The situation concerning Iraq 31/05/2024` sits inside the running text. Both transcribers are correctly free of it.
- Row 44 (`"Its mandates"`, plural) also looks like a PV editing artefact rather than what was said.

### Head-to-head on the harming errors

Both arms lose the same person's name (row 29) and neither is close. Beyond that the
two arms fail in **different places and in different ways**:

- **B's failures are insertions and truncations**: it fabricates a person, truncates a
  resolution number, drops a document serial, drops a clause, and collapses two
  delegations into one speaker. B got right the two things C got most badly wrong
  (S/2024/413, resolution 2682, "the countries concerned", "sine qua non").
- **C's failures are corruptions of symbols and of one dense passage**: three mangled
  document symbols, one wrong-but-real resolution number, and one destroyed sentence of
  substance. C got right the two things B got most badly wrong (the full resolution
  number 2732, "Volker Perthes", "in the resolution just adopted") and never
  hallucinated content.

---

## 3. Conservation check

**Stated in the packet header (not recounted here):**

- PV (A) words total: **1,574**
- AssemblyAI (B): **1,729**
- Azure (C): **1,720**

**Accounting for the 1,574 PV words:**

| bucket | words (approx.) | share |
|---|---|---|
| PV words that appear inside a row of the difference table | **~660** | ~42% |
| PV words identical across all three texts, therefore not in the table | **~890** | ~57% |
| PV-only non-speech material (2 speaker-attribution lines ≈ 14 words; the mid-text running header ≈ 7 words) — in the table as rows 37 and 105 but not speech | **~21** | ~1% |
| unaccounted for | **0** | — |

These are estimates derived from the spans quoted in the table, not a recount: the
instructions forbid running code, and the header word count is authoritative. The
~660 figure comes from ~95 rows with a non-empty PV cell averaging ~7 PV words, plus
the systemic rows (22, 23, 37, 46, 52, 59, 119) which cover recurring spans.

**Coverage statement:** I read all three texts end to end — PV lines 8–210, B lines
214–226, C lines 230–242. **No section was skipped and I did not stop early.** Every
paragraph of every speaker (President, United States, Russian Federation, United
Kingdom, China, France, Guyana/A3+) is represented by at least one row, and the dense
passages (the President's document announcements, China's sovereignty paragraph,
France's archives paragraph) are covered clause by clause.

**Independent cross-check on the word-count gap.** B and C are 155 and 146 words longer
than the PV. The material present in B and C but absent from A is almost entirely
procedural: 7 presidential linking passages (~84 words), ~12 courtesy openers and
closers (~50 words), the vote-call and result-announcement sentences (~30 words), minus
the PV's own added citations `(resolution 2732 (2024))` ×5 and `(S/2024/378, annex)`
(~25 words). That nets to roughly **+140 to +155 words**, which matches the observed
gaps of +155 (B) and +146 (C). The residue — a handful of stutters kept by B, the "Uh"
kept by C — accounts for the ~9-word difference between B and C. **Nothing substantive
is missing from either transcriber that the PV contains**, with the single exception of
row 80 (B dropping "in the resolution just adopted"). The PV's own condensations
(rows 82, 109) run the other way.

---

## 4. Scorecard

### 4.1 Rows by class

| class | rows | of which A is the odd one out (PV editing or PV defect) | B wrong | C wrong | both wrong / unclear |
|---|---|---|---|---|---|
| PV-EDIT | 65 | 65 | — | — | — |
| PUNCT-CASE | 19 | 3 | 7 | 6 | 3 |
| NUMBER | 6 | — | 2 | 1 | 3 |
| SPELLING-VARIANT | 6 | 1 | — | — | 5 |
| DOC-SYMBOL | 5 | 1 | 2 | 2 | — |
| INSERTION | 5 | — | 3 | 1 | 1 |
| ENTITY-PERSON | 4 | — | 3 | 1 | 1 (row 29, both wrong) |
| OMISSION | 3 | 1 | 2 | — | — |
| GRAMMAR | 2 | 2 | — | — | — |
| WORD | 2 | — | — | 2 | — |
| ENTITY-ORG | 1 | — | — | — | 1 (B+C share the interpreter's slip) |
| TERM | 1 | — | 1 | 1 | — |
| ENTITY-PLACE | 0 | — | — | — | — |
| **total** | **119** | **73** | **20** | **14** | **14** *(rows counted once; a few rows charge both arms)* |

### 4.2 Which arm was wrong, in substance

| | AssemblyAI (B) | Azure (C) |
|---|---|---|
| substantive errors (entity / number / symbol / meaning / omission / diarization) | **13** | **10** |
| of those, strictly reader-harming | **8** | **6** |
| hallucinated content not in the audio | **1 (a named person)** | **0** |
| document symbols corrupted or lost | **2** | **3** |
| resolution numbers wrong | **1 (truncated to "27")** | **1 (2682 → 2688)** |
| speaker clustering | **6 clusters for 7 speakers — UK and Guyana merged** | **7 clusters for 7 speakers — correct** |
| disfluency handling | keeps stutters, marks false starts with a dash | keeps "Uh", renders false starts as stray words |
| punctuation/capitalisation discipline | good; occasional spurious sentence breaks | poor; two long runs with no sentence structure at all |
| spelling consistency | inconsistent (favour/favor) | inconsistent (favour/favor) |

### 4.3 The PV's share

73 of the 119 rows are rows where the two transcribers agree with each other against
the PV — that is, **61% of all differences in this packet are the PV's editing, not
transcription error.** The pattern is consistent and it matters for how these numbers
should be read: the PV removes every courtesy phrase and every presidential linking
passage, expands acronyms ("SRSG" → "Special Representative of the Secretary-General",
"UN" → "United Nations", "UNAMI" → the full mission name on first use), inserts formal
citations that were never spoken (`(resolution 2732 (2024))` five times,
`(S/2024/378, annex)` once), converts contractions, restyles dates to UN house style,
and in two places (rows 82 and 109) substitutes the delegation's submitted written text
for what the interpreter actually said. Any WER-style metric that scores B and C against
this PV is charging both arms for ~150 words of the PV editor's work. Where B and C
agree against A — "the Republic's readiness", "a fluid transition", "requirements on
mandate streamlining", "including the liquidation of UNAMI" — **the transcribers are
the faithful record and the PV is the edited one.**

### 4.4 Verdict

**I would hand a diplomat the Azure transcript, but with visible reservations, and I
would not hand either one over unreviewed.**

The decisive factor is the *kind* of error, not the count. B makes marginally more
substantive errors (13 vs 10) and more reader-harming ones (8 vs 6), but the gap in
counts is small enough that it would not settle the question on its own. What settles
it is row 81: B inserted **"Thank you, Mr. Ban Ki-moon."** into the middle of China's
statement. That is a fluent, grammatical, entirely fabricated sentence naming a real
former Secretary-General, and it is the one error class a reader has no defence
against. A garbled document symbol announces itself — "S/2024/S/PV.21. 413" is visibly
broken and a reader knows to go and check. A fabricated greeting to Ban Ki-moon does
not announce itself; it reads as record. On the same page B also truncates the meeting's
only resolution number to "Resolution 27", loses the serial of S/2024/369, and merges
the United Kingdom and Guyana into one speaker — so a reader who trusts B comes away
not knowing which resolution was adopted, and believing the A3+ statement was made by
the UK.

Azure's failures are real and should not be minimised. Three corrupted document symbols
in the President's opening is a bad look for a body whose entire output is
document-referenced, and "Resolution 2688, 2 of 2023" is the more dangerous of the two
resolution-number errors in the packet because 2688 (2023) is itself a real Security
Council resolution — a reader can follow that citation all the way to the wrong text
without ever noticing. Its destruction of China's sovereignty sentence ("the sovereignty
of the country's consent", "the sinon") and the ~120-word unpunctuated run in the same
statement mean Azure's weakest passage is precisely the passage a Council-watcher would
most want to quote. But every one of those defects is *visible*. None of them invents a
fact.

Two further points favour Azure. Its diarization is correct — 7 clusters for 7 speakers,
against B's 6 — and speaker attribution is the property a diplomatic reader relies on
most heavily, since the value of the record is knowing who said what. And Azure gets
right the two proper-noun and number checks that B fails (Volker Perthes, resolution
2732), while B gets right what Azure fails (S/2024/413, resolution 2682, "the countries
concerned"). The errors are not nested; neither arm dominates.

Practical reading of this packet for procurement: **both arms need a post-pass, and the
post-passes required are different.** Azure needs a document-symbol and
resolution-number validator — a regex-plus-registry check against real UN symbol
patterns would have caught all four of its worst errors mechanically, and would have
caught B's two symbol errors as well. B needs something much harder: detection of
fluent insertions that no pattern check can see. Given the choice of which residual risk
to carry, a validator I can build beats a hallucination I cannot detect.
