# PLAN — AssemblyAI Universal-3.5 Pro vs `azure-llm-speech`, English only

**Date:** 2026-07-28. **Status:** design, pre-registration. Not yet run.

## The decision this has to serve

English is ~96% of production audio and is what the product is judged on. Today it runs on
AssemblyAI Universal-3.5 Pro, paid **out of the user's own pocket**. Two ways out:

- **Procure AssemblyAI.** Locks in a vendor in a landscape that moves every few months.
- **Move to `azure-llm-speech`.** Zero marginal procurement — Azure is already contracted.
  But it is an unnamed, unpinnable Microsoft preview model.

§14/§15 of `SYNTHESIS.md` said azure-llm wins on paired WER by ~1.3 points and passes the
hallucination gate, but flagged **reliability, model governance, and entity rendering** as
open. This run is supposed to close them, for English only.

## What §14/§15 did NOT establish (the gap this run fills)

1. **Speed** — never measured at all. Not one latency number in SYNTHESIS.
2. **Reliability** — n≈26 runs, anecdotally "one HTTP 500 and one hard failure". No rate.
3. **Cost** — azure-llm's cost was written as "~gpt-4o class / ~$0 marginal", which is a
   guess, not a rate card.
4. **The audio the two providers actually receive is different** (see confound C1 below) —
   so the §14/§15 WER delta is not a clean comparison.
5. **No qualitative three-way read** against ground truth. WER is blind to the §15.5a
   entity-mangling class, which is the error class that matters most in a UN record.

## Corpus

English track only. 25 English `.m4a` files exist on SSDAStorage; 22 have cached ground-truth
PV text in `eval/results/ground-truth/<symbol>/en.txt`.

**Exclusions, fixed in advance (not by any WER threshold):**

- `Nebenzia-Starobelsk`, `UN80-Apr06-keita`, `UN80-Apr29-timestamps` — anecdotal-battery
  clips, no PV.
- `S/PV.9606`, `S/PV.9614`, `S/PV.9686`, `S/PV.9732` — the four PV↔video mismatch sessions
  identified in §14.1 (the record does not match the recording; every arm scores >85%).

**→ 18 scored sessions, 16.5 h of English audio.** Session list is written to
`eval/analysis/out-en/sessions.json` before any run and is not edited afterwards.

Duration spread (min → max): 81 s (S/PV.9675) → 2 h 33 m (S/PV.9596). This spread is
deliberate — §14.3 found AssemblyAI's diarization collapses on long files, so short and long
must both be represented.

## Arms

| arm | model | how audio is delivered |
| --- | --- | --- |
| `assemblyai-universal-3-5-pro` | `speech_models: [universal-3-5-pro, universal-2]` | today: URL. **See C1.** |
| `azure-llm-speech` | enhanced mode, no `model` → unnamed default speech-LLM, `locales: [en-US]` | multipart MP3 upload |

## Confounds identified before running, and how each is handled

**C1 — the two arms are not fed the same audio.** `assemblyai.ts` sends `audio_url` and
AssemblyAI fetches the original 190 kbps 44.1 kHz AAC itself. `azure-llm-speech.ts` runs
`ffmpeg -ac 1 -b:a 64k` first and uploads a **64 kbps mono MP3**. Azure has been competing on
degraded audio. Two things follow:

- *Fairness:* every §14/§15 azure-llm number is a lower bound.
- *Handling:* **arm A3** — azure-llm on a 128 kbps mono MP3 — is added to measure whether the
  transcode costs anything. If A3 ≈ A2 the confound is nil and §14/§15 stand as-is; if A3 is
  materially better, azure-llm has been underrated and our production provider config has a
  free quality win sitting in it.
- Also **arm A0** — AssemblyAI fed the *same* 64 kbps mono MP3 via `/v2/upload` — to close the
  loop from the other side. A0 vs A1 isolates codec; A0 vs A2 is the truly matched comparison.

**C2 — wall-clock is not comparable as measured.** AssemblyAI pulls from a CDN at datacenter
speed; Azure receives an upload from a laptop on a home connection. And `assemblyai.ts` polls
every **5 s**, quantizing every AssemblyAI latency to a 5 s grid — on an 81 s file that is the
whole measurement.

*Handling:* the timing harness does not reuse the production providers' timing. It measures,
per run, separately:
  - `t_prep` — ffmpeg transcode (Azure only; AssemblyAI URL arm has none)
  - `t_upload` — bytes on the wire (measured directly for AssemblyAI `/v2/upload`; for Azure
    it is inside the single POST and is **estimated** from measured throughput to the same
    host, reported as an interval, never as a point estimate)
  - `t_process` — provider-side work
  - `t_total` — end to end
Polling for AssemblyAI is cut to **1 s**. Uplink bandwidth is measured before and after every
batch and logged, so a slow-network run can be identified rather than silently averaged in.
**The headline speed number is `t_process` normalized by audio duration (RTF).** `t_total` is
reported alongside but flagged as environment-dependent.

**C3 — provider-side queueing is time-of-day dependent.** A single sequential pass confounds
provider speed with "what else was on their queue at 03:00". *Handling:* runs are
**interleaved** (session i: A1, A2, A1, A2 …) rather than blocked by provider, and the
3 repeats of each cell are spread across ≥2 separate hours. Timestamp of every run is logged.

**C4 — repeats measure nothing if the provider caches.** *Handling:* checked explicitly — if
repeat 2 and 3 of a cell return byte-identical transcripts *and* an implausibly low
`t_process`, caching is suspected and reported rather than averaged.

**C5 — the ground-truth normalizer bug (§14.0) inflated absolute WER on vote-bearing
meetings.** Fixed already, guarded by `ground-truth-normalizer.test.ts`. *Handling:* the test
is re-run before scoring, and a negative control is added — see "Verification" below.

**C6 — WER is blind to the failure class that matters (§15.5a).** *Handling:* the three-way
qualitative diff is a first-class deliverable, not a footnote, and is produced by subagents
reading the full transcripts, not by code.

## Measurements

### M1 — Accuracy
Paired normalized WER vs the PV, per session, bootstrap 95% CI over per-session paired
deltas (same method as §14.1, so the numbers are comparable). Reported for A0/A1/A2/A3.
Plus CER, and substitution/insertion/deletion split.

### M2 — Speed
Per run: `t_prep`, `t_upload`, `t_process`, `t_total`, and RTF = `t_process` / audio duration.
**Error bands:** 3 repeats × 18 sessions per arm → within-session SD (measurement noise) and
across-session spread (what a user experiences) reported *separately*. Bootstrap 95% CI on
mean RTF. Also reported: worst-case observed latency, and latency vs duration regression (does
either provider degrade super-linearly on long files?).

### M3 — Cost
From the **published rate cards** (researched separately, with citations), applied to the
actual measured billed quantity, plus the real observed `usage.audioSeconds` per run.
Scenarios: current 1 811 h English backlog, and monthly run-rate. Azure enhanced mode's
billing unit must be established as fact, not assumed.

### M4 — Reliability
Every HTTP status, every retry, every exception, per run, logged. Denominator = attempted
runs, **not** successful runs. Reported as failure rate with a Wilson 95% interval, split by
first-attempt failure vs after-retry failure. Any run that needed a retry is flagged even
though it eventually succeeded — that is latency the user pays.

### M5 — Diarization
Speaker count and utterance count per run, vs audio duration. §14.3's finding (AssemblyAI
collapses to 1 speaker on long files) is re-tested on this corpus, which has files up to 2h33m.

### M6 — Three-way qualitative diff (the big one)
For a chosen subset, subagents read AssemblyAI output, azure-llm output, and the PV **in
full**, and enumerate *every* difference into a table with: location, PV text, AssemblyAI
text, azure-llm text, class (entity / number / symbol / omission / insertion / segmentation /
punctuation / substantive-meaning), and which arm is right. No code — a diff tool cannot
classify "UNAT for UN80" as a wrong-real-institution error.

## Verification — how this run gets caught if it is wrong

Per `CLAUDE.md`: a check that has never failed is absent.

1. **Negative control on the WER scorer.** Before scoring, feed the scorer (a) a transcript
   with 30% of its words deleted, (b) a transcript with every proper noun replaced, (c) the
   *wrong session's* transcript. The scorer must produce visibly worse numbers in all three.
   If a damaged input scores the same, the scorer is not measuring what we think.
2. **Conservation check on the diff.** The three-way diff must account for every word of the
   PV: matched, or listed as a difference, or explicitly classified ignorable. Unaccounted
   words are reported as a residue count — never rounded to zero.
3. **Independent scoring.** The agent that runs transcription does not compute the verdict.
4. **Adversarial review at each stage**, instructed to prove the step is broken.
5. **Timing sanity floor.** Any `t_process` below (audio_duration / 200) is treated as
   suspicious (cache/short-circuit) and investigated, not averaged in.

## Resource budget (the machine)

Internal disk has **12 GiB free (95% full)** — everything (transcodes, transcripts, logs)
goes to `/Volumes/SSDAStorage/un-en-bakeoff/`. MP3 transcodes of 16.5 h: ~475 MB at 64 kbps,
~950 MB at 128 kbps. Concurrency capped at 2 in-flight transcriptions; CPU/memory/disk sampled
every 30 s to a log.

## Money budget

18 sessions × 16.5 h. AssemblyAI at $0.23/h: **$3.80 per full pass**; A0+A1 × 3 repeats =
6 passes = **~$23**. Azure billed separately (rate TBD). Hard ceiling: **$40**. If the design
would exceed it, repeats are cut on the long sessions first (they contribute least to
within-session variance per dollar) and that is recorded.

## Open questions to resolve before running

- Does Azure fast transcription accept a URL instead of a multipart upload? If yes, C2 mostly
  dissolves and the arms become directly comparable.
- Is there a max audio length for enhanced mode? Docstring says ≤5 h / ≤500 MB — a 2h33m
  190 kbps file is 220 MB as AAC, ~74 MB as 64 kbps MP3, so within limits, but this must be
  confirmed rather than assumed.
</content>
