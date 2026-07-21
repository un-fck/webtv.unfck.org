# Phase 1 findings — how far behind do the UN interpretation booths run?

Measured from transcripts, not audio, over 7 Security Council / briefing
meetings (7.9 hours of floor audio) that carry a floor track plus 2–5
interpreted tracks.

## Headline

**Median interpretation lag ≈ 1.6 s** (IQR 1.0–2.5 s, p90 4.7 s), but the
figure is strongly language-dependent, and the spread between language pairs
is larger than the central value:

| source → target | n | median | IQR |
|---|---|---|---|
| ar → en | 8 | **4.7 s** | 4.0 – 5.7 |
| fr → en | 11 | 1.9 s | 1.7 – 2.1 |
| es → en | 14 | 1.3 s | 0.9 – 1.8 |
| en → zh | 13 | 1.2 s | 0.9 – 1.6 |
| en → fr | 9 | 0.2 s | −0.1 – 0.5 |

Pooled by **source** language — how hard the floor is to interpret *from*:

| source | n | median | IQR |
|---|---|---|---|
| ar | 10 | **4.7 s** | 4.0 – 7.9 |
| fr | 14 | 2.0 s | 1.7 – 2.3 |
| ru | 8 | 1.7 s | 1.1 – 1.7 |
| es | 17 | 1.3 s | 1.1 – 1.8 |
| en | 29 | 0.9 s | 0.2 – 1.6 |

**Arabic is the outlier**, at roughly 3–5× the lag of any other source
language. That is the expected direction — Arabic's word order and its
heavy use of clause-initial particles force the interpreter to wait for more
of the sentence before committing — but the size of the gap is the finding.

Pooled by **target** booth: en 1.8 s, ru 1.7 s, zh 1.6 s, fr 0.3 s.

## Why these numbers can be trusted

**The null test.** When the floor is already being spoken in language L, the L
track is not interpreting anything — it is the floor relayed — so its true lag
is zero *by construction*. Across 130 such anchor pairs the measured null is
**0.07 s**. The instrument reads zero when the answer is zero.

**Threshold stability.** The estimate barely moves as the timing-precision
filter is swept over an order of magnitude:

| max anchor uncertainty | n | median lag | null |
|---|---|---|---|
| 1 s | 63 | 1.76 s | 0.07 s |
| 2 s | 71 | 1.68 s | 0.07 s |
| 3 s (headline) | 84 | 1.63 s | 0.07 s |
| 5 s | 125 | 1.61 s | 0.08 s |
| 8 s | 158 | 1.63 s | 0.08 s |
| 15 s | 188 | 1.75 s | 0.08 s |
| unfiltered | 316 | 2.17 s | 0.09 s |

**The anticipation bias probe came back negative.** Country names inside
formulaic chair announcements ("I give the floor to the representative of X")
are anticipatable, so an interpreter can produce them almost in step; numbers
cannot be anticipated at all — they must be heard in full. If the anchor
method were systematically flattered by predictable tokens, numbers would lag
noticeably further. They do not: countries 1.6 s (n=53) vs numbers 1.5 s
(n=31). The estimate is not an artifact of anchor choice.

## How it was measured

Two layers, because neither alone is sufficient.

1. **Chunk-level monotonic DTW** over multilingual embeddings
   (`text-embedding-3-large`, validated at 5/5 cross-lingual retrieval on
   realistic UN sentences with cosine margins of 0.51–0.59 including Arabic
   and Chinese) establishes *which passage corresponds to which*.
2. **Translation-invariant anchors** — numbers and official UN country names,
   which we hold in all six languages — then measure the lag *exactly*.

The DTW cannot do step 2 itself. Its two chunk grids have an arbitrary phase
offset worth up to half a chunk, and worse, when both tracks have similar
chunk counts the diagonal path is cheap, so the DTW is **systematically biased
toward zero lag**. On the null test its spread was ±4.5 s — as large as the
effect being measured. Anchors have neither problem: when the floor says
"10156" at 3.4 s and the English track says "10,156" at 8.1 s, the lag is
4.7 s with no model and no interpolation in the answer. The DTW is retained
only to predict *where to look*, so the tenth "Pakistan" pairs with the tenth
and not the third.

Anchor pairing is a monotone DP, not greedy, and values recurring more than
six times per session are discarded as mispairing hazards.

## What had to be fixed first

**The stored floor transcripts were unusable.** Every meeting in the DB with a
floor track plus two or more interpreted tracks predates the 2026-07-10 switch
to Speechmatics Melia, so its floor came from Gemini — whose timestamps drift
by tens of seconds and, in S/PV.10168, emit onsets at 8085 s in a 4898 s
video. The floor was re-transcribed with Melia ($1.02 for 7.9 h). Melia also
labels every word with the language actually being spoken, which is how each
speaker's source language is recovered; the adapter was discarding those
labels and now carries them.

## Limitations, stated plainly

- **Small n.** 84 anchor pairs at the headline threshold. The per-pair cells
  (n=8–14) are indicative, not precise; the pooled and overall figures are the
  defensible ones. `ar→en` rests on 8 observations.
- **Coverage is uneven.** fr/es/ar/ru tracks come from Azure LLM Speech, which
  returns no word timestamps and merges whole statements into single segments,
  so most of their anchors are only located to ±13 s and are filtered out.
  Lag *into* those booths is therefore measured on many fewer points than lag
  into English or Chinese.
- **One session is excluded by its own null test.** The SG briefing
  (`1_siluxlip`) reads a 3.4 s en→en null where zero is required, meaning its
  tracks disagree about their own clock; it is flagged and dropped rather than
  silently corrected.
- **Anchors are instants, not propositions.** This measures when a specific
  identifiable item is uttered in each language. That is the classical
  ear-voice-span construct, but it is not the same as "when is the full
  meaning available".
- **UN speech is unusually scripted.** Delegations frequently submit texts in
  advance, and much floor time is formulaic procedure. Both compress lag
  relative to spontaneous speech, so these figures should be read as
  *institutional* interpretation lag, not a general EVS estimate.

## What this sets up

Any live machine pipeline has to be compared against **~1.6 s median / 4.7 s
p90**, and specifically against **~4.7 s for Arabic source**. That is the bar
Phase 2 measures the machines against.
