You are producing an EXHAUSTIVE three-way difference table for one UN meeting.

READ THIS FILE IN FULL, top to bottom, before writing anything:
  {PACKET}

It contains three texts for the same audio:
  A. GROUND TRUTH — the official UN verbatim record (PV). Treat as correct, with
     one caveat below.
  B. ASSEMBLYAI Universal-3.5 Pro
  C. AZURE-LLM-SPEECH (Microsoft's unnamed default "enhanced mode" speech-LLM)

DO NOT WRITE OR RUN ANY CODE. No diff tools, no scripts, no python. Read the
texts and compare them yourself. A diff tool cannot tell that "UNAT" is a real UN
body being substituted for a different real entity, and that judgement is the
entire reason a human-style read is being asked for.

IMPORTANT CAVEAT ABOUT THE GROUND TRUTH: a PV is a lightly EDITED verbatim
record. UN editors remove filler, tidy grammar, and occasionally compress. So
where B and C agree with each other but differ from A, the transcribers may both
be RIGHT and the PV is the edited one. Say so when you believe it — do not
reflexively score the PV as correct. This distinction matters a lot.

## What to produce

### 1. The difference table
EVERY point where any of the three texts differs from either of the others. Not a
sample. Not "representative examples". Every one. Merge a run of adjacent
differences into one row only when they are one phenomenon.

| # | anchor (a few words of surrounding context) | PV (A) | AssemblyAI (B) | Azure (C) | class | who is right |

`class` must be exactly one of:
  ENTITY-PERSON      — a person's name
  ENTITY-ORG         — an organisation, body, treaty or initiative name
  ENTITY-PLACE       — a place name
  DOC-SYMBOL         — a UN document symbol (S/2026/426, S/PV.10156, A/78/L.4)
  NUMBER             — any number, date, resolution number, or count
  TERM               — UN/diplomatic terminology used wrongly
  OMISSION           — words present in the others but missing here
  INSERTION          — words present here but in neither of the others
  WORD               — an ordinary mis-heard word, no special significance
  GRAMMAR            — grammatical/agreement difference
  PUNCT-CASE         — punctuation, capitalisation or formatting only
  PV-EDIT            — B and C agree; the difference is the PV's editing
  SPELLING-VARIANT   — en-GB vs en-US (programme/program, defence/defense)

`who is right` must be exactly one of: `A`, `B`, `C`, `B+C`, `A+B`, `A+C`,
`all differ`, `unclear`.

### 2. Severity call
Then list separately, as "READER-HARMING ERRORS", only those rows where a reader
of the transcript would be actively MISLED — a wrong-but-real institution, a
wrong number, a wrong person, a reversed meaning. Distinguish these from cosmetic
noise. This is the section that matters most; be strict about what qualifies.

### 3. Conservation check (mandatory)
The packet header states the exact word counts. Report:
  - PV words total (from the header, NOT your own recount)
  - roughly how many PV words appear in rows of your table
  - roughly how many are identical across all three and therefore not in the table
  - anything you could not account for
State these as numbers. If you did not manage to cover the whole text, SAY SO
EXPLICITLY and say where you stopped. An honest partial coverage report is far
more useful than a claim of completeness you cannot support.

### 4. Scorecard
Counts per class, split by which arm was wrong, and a one-paragraph verdict on
which transcript you would rather hand a diplomat, with the reason.

Be precise and complete. This is the qualitative core of a procurement decision.
