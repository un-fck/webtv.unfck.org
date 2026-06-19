# Transcript Realignment: Re-Aligning Timestamps After WebTV Re-Cuts a Video

## The problem

UN Web TV sometimes **re-cuts a video after it has been uploaded** — most often trimming dead air off the **front** (the pre-meeting holding shot, room noise, "the meeting will begin shortly"). When this happens *after* we've already transcribed the original upload, every timestamp we stored is now ahead of the audio by a constant amount, and the transcript no longer tracks the player.

Worked example — `/sc/10155` (Security Council 10155th meeting):

```
Original upload we transcribed:   first statement at 00:17:24, last ends at 03:20:13
WebTV later trimmed ~17 min off the front
Current audio:                    03:03:10 long
```

The transcript's last statement (`03:20:13`) now sits **17 minutes past the end of the audio**. Playing the video, the highlighted statement runs ~17 min ahead of what's being said. The content is identical — it's just shifted. The fix is a **single constant offset** added to every timestamp at render time.

This is **not a transcription bug**; it's WebTV editing the source out from under us. So we don't re-transcribe — we detect the shift and store an offset.

## TL;DR of the design

- A nightly→hourly cron and a one-off backfill detect affected transcripts and compute the offset.
- The offset comes from **Gemini**, given only the **first 5 minutes** of audio (server-side clipped, ~7 MB) plus the opening statements' old timestamps. It returns the constant shift.
- We **validate geometrically** that a single front-shift actually explains the change; if not (a mid-cut or content truncation) we flag the row instead of writing a wrong offset.
- The offset (`time_offset_ms`) is **applied at the data-access boundary**, never baked into stored content — reversible and re-runnable.
- Three columns on `transcripts`: `source_duration_ms`, `time_offset_ms`, `aligned_duration_ms` (migrations 008 + 009).

---

## How we got here: the experiments

The approach was reverse-engineered empirically against `/sc/10155`. The exploration harness was `scripts/dev/align-experiments.ts` (since removed — its conclusions are baked into `lib/realignment.ts`). The findings are worth keeping because they justify several non-obvious choices.

### Can a single Gemini prompt find the offset?

We uploaded the full 3-hour audio **once** and reused the Gemini file handle across six probe prompts. Anchors were distinctive phrases pulled from the existing transcript, at known (old) timestamps.

| Experiment | Approach | Result |
|---|---|---|
| **1** | Ask the timestamp of the **opening** phrase ("…10155th meeting…is called to order") | `00:00:02` → offset **−1042s** ✅ |
| **5** | Ask "how many seconds until the meeting is called to order" | `2.56s` → **−1042s** ✅ |
| **4** | Give it old timestamps + phrases, let it **compute** the offset (thinking on) | `{offset: −1041, confidence: high, constant: true}` ✅ |
| **2** | Ask the timestamp of a phrase **near the end** of the 3h file | `30:28:54` — **hallucinated** ❌ |
| **3** | Multi-anchor: locate phrases at start / middle / end | only the *start* anchor correct; mid/end **hallucinated** ❌ |
| **6** | Two-point (start + end) | start correct, end garbage ❌ |

**The decisive lesson:** Gemini reliably pinpoints content **near the start** of a long recording (to within ~2 s) but **hallucinates absolute timestamps deep into a multi-hour file**. So the robust strategy is to **anchor on the front** and rely on the constant-shift assumption — which is exactly what a front-trim produces.

Independent confirmation: transcribing just the first 15 s of the (cut) audio returned *"0:02 The 10155th meeting … is called to order"* — and, amusingly, `0:00 我宣布` (the Chinese-floor "I declare"), confirming the real content starts at ~2 s.

### Cost: it's the audio input tokens, not the output

We initially hoped this would be near-free since Gemini bills by output tokens and the answer is tiny. **Wrong:** each call to the full 3 h file was ~**275 k input tokens** (~25 tokens/audio-second) ≈ $0.08, with the 6-token answer costing nothing. Input dominates.

### Therefore: send only the front, clipped server-side

Two optimizations followed directly:

1. **Only the front is needed.** A front-trim, by definition, puts the first real statement at the very start of the cut file, so the first few minutes are sufficient. We send **5 minutes** (margin over the observed ~2 s) → ~**15 k input tokens** ≈ **$0.005**, ~15 s. (Production confirmed: identical `00:00:02` answer from the clip alone.)
2. **Download only the front from Kaltura.** The `playManifest` URL 302-redirects to a `serveFlavor` URL that honours a **`/clipTo/<ms>`** path segment (server-side time clip):

   ```
   …/serveFlavor/entryId/1_…/clipTo/300000/fileName/x.mp4
   ```

   → ~7 MB instead of 251 MB, ~4 s to download, and a clean standalone MP4. Under 20 MB it can be sent **inline** to Gemini (no Files API upload round-trip). See `buildFrontClipUrl()` in `lib/realignment.ts`.

**Per-video cost ≈ $0.012** (thinking is on, so output is ~3–4 k tokens; turning thinking off drops it to ~$0.003 but loses the self-reported `constant` signal — not worth it at this scale).

---

## Detection: which transcripts need realigning?

### Why not just compare durations?

The naive signal "current audio is shorter than `videos.duration`" fails twice over:

1. **`videos.duration` goes stale.** The sync cron only re-scrapes tomorrow + the last ~3 days, and `backfillDurations` only fills rows where duration is `0`/`NULL` — it **never refreshes** an existing value. WebTV usually re-cuts days/weeks after upload, by which point the video has aged out of the window, so `videos.duration` still holds the *old* length. **The cron reads the live duration from Kaltura instead** (`fetchKalturaDurations`, batchable 500/call).

2. **We had no record of the original length.** `videos.duration` is overwritten on every sync; `transcripts` stored no length at all. → migration 008 adds **`source_duration_ms`**, the actual audio length captured at transcription time (from the provider's `durationMs`).

### The trigger: any *reduction* in duration

We considered triggering on **content overshoot** (`last_statement_end > current_duration`) — but that **misses front cuts hidden behind trailing silence**:

```
Original: 3:30 audio, last statement at 3:00 (30 min trailing silence)
Front-trim 17 min → audio now 3:13
last_statement_end (3:00) < current (3:13)  →  no overshoot  →  MISSED, yet shifted 17 min
```

So the trigger is **any reduction in duration** versus the length we last reconciled to:

```
baseline = COALESCE(aligned_duration_ms, source_duration_ms, last-statement-end proxy)
trigger when:  baseline − current_duration  >  REDUCTION_TRIGGER_S (30 s)
```

Trailing-silence trims also reduce duration and so will trigger — but they resolve to a **~0 offset** and pass validation harmlessly (a no-op shift, marked done). That false-positive is cheap; missing a real front cut is not.

> **Subtlety (why `source_duration_ms` isn't the trigger directly):** trimming only *trailing* silence changes the file length without moving any content. Triggering on raw length change would fire on those harmlessly, but more importantly, once a row is aligned its length permanently differs from `source_duration_ms`, so it would re-fire forever. Hence the `aligned_duration_ms` baseline below.

---

## Computing & validating the offset

`realignTranscript()` in `lib/realignment.ts` is the shared core:

1. **Resolve & screen.** Get the current Kaltura duration; if `reduction < 30 s`, return `no_change`.
2. **Clip + ask Gemini.** Download the 5-min front clip, send it inline with the first ~8 statements' opening words + old timestamps, ask for the constant `offset_seconds` (+ `confidence`, `constant`).
3. **Validate geometrically** that a single front-shift explains the change (we trust geometry over the model's self-report):
   - after shifting, content must **not stick out past the audio end** (`predictedEnd ≤ current + OVERSHOOT_TOL_S`) — catches mid-cuts / truncation that one offset can't explain;
   - after shifting, content must **not start before zero** (`predictedStart ≥ −START_TOL_S`);
   - the offset is **≤ ~0** (a front trim removes content);
   - `|offset| ≤ source − current` when `source_duration_ms` is known (the front trim can't exceed the total length change).

   We deliberately **don't** require the shifted end to *equal* the audio end — trailing silence (or a trailing-silence trim) legitimately leaves content ending before the audio does. That asymmetry is the whole point.

4. **Write or flag.**
   - Valid → write `time_offset_ms` + `aligned_duration_ms = current`.
   - Invalid (mid-cut / truncation) → clear any stale `time_offset_ms`, set `aligned_duration_ms = current` (so we don't re-run Gemini on it every hour), and report it as `flagged` for manual re-transcription.

### The `constant` field

`constant` asks Gemini whether **every anchor it could locate shifts by the same amount** (a clean front trim → `true`) or whether different phrases need different shifts (content also cut from the middle → `false`, no single offset works). It's a complementary signal to the geometric validation; the prompt defines it explicitly.

---

## Handling multiple re-cuts: `aligned_duration_ms`

A video can be cut **more than once**. `time_offset_ms` alone can't tell us when it has gone stale, and "current ≠ source" stays true forever after the first cut (so the cron would re-burn Gemini every run). Migration 009 adds **`aligned_duration_ms`** — the audio length each offset was reconciled to:

- Trigger compares `current` against `COALESCE(aligned_duration_ms, source_duration_ms)`, so an aligned row **self-quiesces** (reduction = 0 → skipped) until a *new* cut drops the duration further.
- A new clean cut → recompute and overwrite both columns.
- `aligned_duration_ms` set **with** `time_offset_ms` NULL = "checked at this duration, not a clean front-shift — needs manual reprocess."

---

## Applying the offset (DRY, single chokepoint)

The offset is applied at the **data-access layer**, so no display surface has to remember to do it:

- **Display getters auto-shift.** `mapTranscriptRowForDisplay()` in `lib/db.ts` runs `applyTimeOffset()` on the returned content. Wired into `getTranscript`, `getTranscriptByKalturaId`, `getActiveTranscriptByKalturaId`, `getActiveTranscriptByEntryId` — so the poll API, the `check` route, the `.json`/`.txt` data routes, and the POST cache-hit are all correct for free.
- **Speaker feed.** `getStatementsForRefs` projects `start` in raw SQL (for performance across many refs), so it adds `+ COALESCE(time_offset_ms, 0)` directly in the query — kept in lockstep with the getters.
- **Raw getters stay raw.** `getTranscriptById` (pipeline, analysis, poll re-entry) and the realignment scripts' own queries read **un-shifted** timestamps. This is the crucial invariant: the offset is computed from, and re-saved relative to, the *original* timeline, so reprocessing must never see shifted data.

The shift logic itself is one pure, non-mutating module: `lib/transcript-offset.ts` (`applyTimeOffset` / `shiftStatements` / `shiftRawParagraphs`), clamped at 0 so a negative offset can't produce negative timestamps.

> **Rule of thumb:** reading a transcript to *show* it → use a display getter (already shifted). Reading to *reprocess* it → use `getTranscriptById` (raw).

---

## Operations

### Schema (apply once each)

```bash
psql "$DATABASE_URL" -f sql/migrations/008_transcript_duration_and_offset.sql
psql "$DATABASE_URL" -f sql/migrations/009_transcript_aligned_duration.sql
```

`source_duration_ms` is populated automatically for all new transcriptions (via `saveTranscript`).

### Recurring cron — `app/api/cron/realign` (hourly, `vercel.json`)

Future-proof path: surveils meetings from the **last 10 days** (re-cuts happen within days of upload) that have a `source_duration_ms`, batch-fetches live durations, runs the core on those that shrank, and **auto-applies** validated offsets. Bounded to 10 realigns/run, `maxDuration = 300`. Returns `{candidates, shrunk, processed, applied, flagged, summary, estCostUsd}`.

### One-off backfill — `scripts/realign-backfill.ts` (legacy cleanup)

For transcripts produced **before** migration 008 (no `source_duration_ms`), using the last-statement-end as the baseline proxy. **Temporary** — once the backlog is cleared it has no rows to act on and can be deleted.

```bash
pnpm exec tsx scripts/realign-backfill.ts sc/10155            # one id (asset_id / slug / entry / kaltura)
pnpm exec tsx scripts/realign-backfill.ts --limit=5           # first 5 detected candidates (dry-run)
pnpm exec tsx scripts/realign-backfill.ts                     # dry-run ALL candidates
pnpm exec tsx scripts/realign-backfill.ts --apply --limit=5   # write offsets for 5
pnpm exec tsx scripts/realign-backfill.ts --apply             # write the whole backlog
```

Dry-run by default; `--apply` writes. Explicit ids bypass the cheap pre-filter (the precise Kaltura check still runs). Both entry points select only the **active** row per video+language (latest completed — the row the app actually serves), so duplicate transcriptions aren't processed twice. Each row is ~$0.012 and self-skips once aligned, so re-running is idempotent and safe.

---

## Files

| File | Role |
|---|---|
| `lib/realignment.ts` | Shared core: detection trigger, `clipTo` download, Gemini prompt, geometric validation, write/flag |
| `lib/transcript-offset.ts` | Pure offset application (`applyTimeOffset` / `shiftStatements` / `shiftRawParagraphs`) |
| `app/api/cron/realign/route.ts` | Hourly cron (auto-apply) for post-008 transcripts |
| `scripts/realign-backfill.ts` | One-off legacy backfill (heuristic baseline) |
| `lib/db.ts` | `mapTranscriptRowForDisplay`, the `getStatementsForRefs` SQL offset, `source_duration_ms` on `saveTranscript` |
| `sql/migrations/008_*.sql`, `009_*.sql` | `source_duration_ms`, `time_offset_ms`, `aligned_duration_ms` |
