# Live captioning with translation — can we do what YouTube does?

Phase 1 (landscape) and Phase 2 (evaluation) of the live-captioning question,
run 2026-07-22. Landscape detail: `eval/analysis/live-captioning-research.md`.
Result tables: `eval/live/out/REPORT.txt`.

---

## The short answer

**YouTube cannot do this for our content, and neither can any platform.**
Automatic captions on YouTube are **English-only for live streams** — auto-
translate operates on a caption track that already exists, so a live
non-English UN meeting gets no captions to translate in the first place. The
"just point it at YouTube" option does not exist.

Every other platform is closed. Google Meet, Teams and Zoom all have live
translated captions covering Arabic, Chinese and Russian, but essentially none
exposes the live caption stream through an API — Zoom's Video SDK is the single
exception. Kaltura, which we already use for UN Web TV, does not do ASR at all:
its REACH module brokers captions out to partner vendors (Verbit, dotSUB), and
only for Webcasting-scheduled events, not plain live entries.

So the real choice is between **cloud building blocks you assemble yourself**,
which is what Phase 2 measures.

---

## The two architectures

Every captioning stack in the survey is one of two shapes, and they fail
differently enough that they must be measured separately.

The dividing line is **not** pipeline-vs-single-model, which is what I assumed
at first and had to correct after measuring. It is whether the system must
**commit to one source language**:

| | **Fixed source language** | **Natively multilingual** |
|---|---|---|
| shape | ASR→MT pipelines, *and* single models that take a `from` parameter | one model, many source languages at once |
| who uses it | YouTube, Meet, Teams, Zoom, AWS reference architecture, broadcast vendors, **Azure Speech Translation** | Soniox, OpenAI Realtime |
| tested here | Deepgram→Google Translate; Azure Speech Translation | Soniox, OpenAI Realtime |
| result on a 5-language floor | **collapse** — 23–41% coverage, nonsense output | degraded but coherent |

Azure Speech Translation is a single model, yet its API requires `from`, and it
fails exactly like the pipelines do. That is why the architectural axis that
matters is source-language handling, not model count.

This distinction turns out to be the whole story for UN audio.

---

## What broke, and why it matters

**The caption-then-translate arm produced nonsense.** Deepgram's multilingual
mode, fed the UN floor, emits things like *"Le message secret est…"* and stray
`安就啦会，一是会做的`, at **35–41% coverage** on the five-language session.
The translation layer then faithfully renders nonsense into nonsense.

On the most multilingual session (S/PV.10168, floor switching between six
languages) it collapses further still: chrF++ **5.1–13.6**.

The failure is in **language detection**, not translation and not the
architecture. A control run pins the same pipeline's ASR to English, changing
one variable, to quantify exactly how much of the damage is attributable to
that stage.

This is the same constraint every platform captioning product operates under:
a caption track has one language. On a floor that switches language every few
minutes, whatever the ASR commits to is wrong for part of every meeting.

**Azure Speech Translation fails the same way, and it is not a pipeline.**
Probed on a 45-second English passage it looked like the best system tested:
1.13 s median, clean French. Run over the whole five-language session with
`from=en-US` it drops to **23–28% coverage** and emits *"Shambu Anchuan Li
Shuhui était-elle en argent ?"* — English phonetics imposed on Chinese speech,
then fluently translated. A short monolingual probe would have sold it.

**The natively multilingual systems do not have this problem.** Soniox takes
language hints for all six UN languages simultaneously, which is why it holds
up on this content despite being slower and despite scoring worse on any
single monolingual excerpt.

---

## Metrics: WER was the wrong instrument, twice over

Two additions came out of the research, and both changed conclusions.

### NTR — how broadcasters actually certify live subtitles

WER, CER and chrF++ weight every error equally. The **NER model** and its
translated-subtitle variant **NTR** (Romero-Fresco & Pöchhacker) do not: each
error is weighted by how much *meaning* it destroys (minor 0.25, standard 0.5,
serious 1.0), and split by origin — **T**ranslation error vs **R**ecognition
error. The accepted broadcast threshold is **98**. Vendors report in it:
AI-Media publishes 98.7% NTR, not a WER.

Neither the FCC nor WCAG actually mandates a numeric accuracy threshold — the
famous "99%" is industry convention, not regulation.

The T/R split is the useful part: it says *which stage to fix*, which WER
cannot. A pivot pipeline can only add translation errors on top of what the ASR
already got wrong; a single-model translator fuses the two.

### …and the trap in it, found by testing

NTR scored the Deepgram-multi pipeline at **96.6 on French — while its output
was nonsense.** That is not a vendor problem, it is a property of the metric:
NTR's denominator is the candidate's *own* word count, and the compared windows
are proportional slices, so a system emitting 40% of a meeting is graded on 40%
of the material against a reference slice it does not correspond to.

NTR answers *"how good were the subtitles that appeared"*, which is a real and
useful question — but quoting it without coverage beside it is indefensible.
The report now **suppresses NTR below 80% coverage** and prints the coverage
figure in its place.

### Caption readability

A stream of correct words is not captioning. Live-subtitle practice judges
whether a viewer can *read* the output: characters per caption, how fast
captions are replaced, and the resulting reading rate against the ~21 char/sec
adult ceiling.

Measured on the caption pipeline: 38.3 characters per caption, 8.1 captions per
minute, median reading rate 11.4 chars/sec — comfortably inside the ceiling on
average, but **28% of its captions are replaced faster than a person can read
them.** More than a quarter of the output is, in captioning terms, unreadable
regardless of whether the words are right. No accuracy metric of any kind would
have surfaced that.

This also surfaces something WER completely hides: **a raw streaming translator
is not a captioning system.** Soniox and OpenAI Realtime emit token fragments with
no caption-unit boundaries at all. Shipping either as captions means building
segmentation, line-breaking and timing yourself. The report records that as
`segmented: no` rather than pretending a number exists.

---

## Latency

Both halves of the caption pipeline are separately observable, which no
single-model translator allowed: Deepgram returns word-level timestamps on
final results, so the ASR half is exact, and the MT half is a round trip we
time. The sum models an inline pipeline.

One correction worth recording, because it nearly produced a false headline: the
first implementation divided each translation batch's round trip across its 16
captions, yielding 0.3 s and making the pipeline look *faster than a human
interpreter*. A caption waits the **whole** round trip, not a 1/16 share. The
corrected figure still excludes queueing delay while a batch fills, so it
remains a floor.

Caption-arm latency is reported from the tier-1 cells only. The tier-2 cells
were measured before the accounting fix above and are excluded rather than
mixed in — re-streaming 82 minutes to correct a latency figure on an arm whose
quality is 5–14 chrF++ is not a good use of the budget, but silently reporting
two different accountings in one column would be worse.

Azure Speech Translation — the engine behind Teams' live translated captions —
probed at **1.13 s median** with clean French output, the fastest credible
figure of any system tested, and it emits whole phrases with explicit
Offset/Duration, so its latency is exact rather than inferred.

---

## Practical notes for anyone building this

- **Speechmatics real-time rejects `language: multi`.** Melia, our production
  floor model, is batch-only. Our best multilingual transcription has no live
  equivalent, so the offline pivot pipeline cannot simply be "made live".
- **Azure Speech Translation only answers on `northeurope`** for our key;
  westeurope and eastus both 401. It needs no SDK — the raw WebSocket protocol
  is implemented in `providers/azure-speech-translation.ts`.
- **3Play and ENCO both run Speechmatics underneath**, per Speechmatics' own
  case studies. Buying either is partly buying a vendor we already hold a key
  for.
- **Deepgram's "Live Captions" product page returns HTTP 410.** Treat that
  branding as possibly discontinued; the streaming API itself is fine.
- Rev.ai is the cheapest self-serve entry point if a real vendor trial is ever
  wanted; everything else in the dedicated-vendor tier needs a commercial
  contract.
