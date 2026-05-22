# Code Review — webtv.unfck.org

Comprehensive review of the codebase as of 2026-05-08. Findings are ranked
**P0 → P3**:

- **P0** — production-blocking, data-correctness, or security risk. Fix soon.
- **P1** — real bugs or wrong-by-design behaviour with limited blast radius.
- **P2** — refactor opportunities; not bugs, but they are slowing us down.
- **P3** — documentation / hygiene drift (most are now fixed in this PR).

Each item lists `path:line` so it can be picked up directly.

> **Resolution status (2026-05-21).** Addressed this pass:
> P0-1 (already removed), P0-2 (HTTP self-calls dropped → in-process
> `runSpeakerIdentification()` + `after()`), P0-3 (deletes wrapped in a
> transaction), P0-4 (lock heartbeat via `touchPipelineLock()`), P1-1 (statuses
> already wired), P1-2 (`daysBack` in cache keyParts), P1-3 (`ensureInitialized`
> deleted), P1-4 (Kaltura resolution consolidated into `resolveEntryIdFromKaltura`),
> P1-5 (`KALTURA_PARTNER_ID`/`KALTURA_WIDGET_ID` constants), P1-7 (usage-event
> JSONL spool), P1-8 (FTS fallback warn), P1-9 (TODO already gone), P2-7 (dev-tool
> aliases), P2-8 (`normalizeSpeakers` doc reconciled, dead usage key removed).
>
> **Second pass — P2 refactors (behind a Layer 1 + characterization test net):**
> P2-1 (`speaker-identification.ts` → `lib/pipeline/`), P2-3 (`pv-parser`
> language patterns → `pv-parser-patterns.ts`), P2-4 (component filenames →
> kebab-case), P2-5 (Gemini plumbing dedup via `gemini-utils`), P2-6
> (`error.tsx`/`loading.tsx` boundaries). P2-2 (big component splits) **partly
> done**: pure logic extracted with unit tests (`pv-reference-linking`,
> `transcript-formatting`) + component test harness added; the stateful-hook /
> sub-component decomposition of the three large components remains as dedicated
> PRs (needs per-component characterization tests first).
>
> **Third pass — P1-6 (resolved, pipeline-wide).** Removed all fabricated
> per-word interpolation. Providers without real word timing (gemini [default],
> azure-openai, groq-whisper, alibaba, mistral) now carry their real
> per-segment timestamps as the smallest timed unit; the UI seeks/highlights at
> the sentence (segment) level instead of showing a drifting word cursor.
> Providers with real word timing (assemblyai, deepgram, cohere, azure-speech,
> elevenlabs, google-chirp) are unchanged. The inert `confidence: 0.6` field is
> gone. See the updated P1-6 entry below.
>
> **Deferred:** the remaining P2-2 component decomposition described above.

---

## P0 — Fix soon

### P0-1. `pnpm test-gemini` is broken (missing script file)
`package.json:23` declares `"test-gemini": "tsx scripts/test-gemini.ts"`, but
`scripts/test-gemini.ts` does not exist. Anyone running it gets a tsx error.

**Fix:** delete the entry in `package.json`, or restore the script from the
git history if it's still wanted.

### P0-2. Internal API self-calls fall back to `localhost:3000` in production
`app/api/transcripts/route.ts:58-67` and `app/api/transcripts/check/route.ts:47-56`
fire a non-awaited `fetch()` to `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/identify-speakers`.
If `NEXT_PUBLIC_BASE_URL` is missing in production, the trigger goes to
localhost and silently fails (`.catch(console.error)` only). The user sees
`stage: "identifying_speakers"` but no work ever happens — the transcript is
stuck with empty statements forever.

**Fix options (pick one):**
1. Validate `NEXT_PUBLIC_BASE_URL` at startup (throw if unset and
   `NODE_ENV === "production"`).
2. Stop self-calling over HTTP. Move the `identifySpeakers` call into the
   same process — this whole file currently exists only to re-acquire the
   pipeline lock and run analysis, both of which can be invoked directly
   from `lib/transcription.ts`.

Option 2 is the right answer. The HTTP indirection adds latency and a new
failure mode and gains nothing — both endpoints run on the same Vercel
function.

### P0-3. Cascading deletes are non-atomic
`lib/db.ts:431-437` (`deleteTranscript`) and `lib/db.ts:449-458`
(`deleteTranscriptsForEntry`) issue two separate DELETE statements
(`processing_usage_events` then `transcripts`) without a transaction. If the
second fails mid-flight, you're left with orphaned usage rows and a partial
delete.

**Fix:** wrap both in a single `BEGIN/COMMIT` using a pooled client, or add a
`ON DELETE CASCADE` foreign key (currently there are no FKs at all between
these tables).

### P0-4. Pipeline lock has no heartbeat and a 30-min hard timeout
`lib/db.ts:404-426`. The lock is acquired with
`pipeline_lock IS NULL OR pipeline_lock < NOW() - INTERVAL '30 minutes'`.
A long transcription (e.g. a 3-hour General Assembly debate that times out
in retry loops) can exceed 30 minutes; while the original worker is still
running, a polling client can re-acquire the lock at `lib/transcription.ts:188`
and start `runAnalysisPipeline` *concurrently*. Both paths then call
`identifySpeakers()` and write to the same row — the last writer wins, costs
double, and may corrupt the speaker mapping.

**Fix:**
- Add a heartbeat (UPDATE the lock timestamp every ~30s during long stages),
  *or*
- Use `pg_advisory_xact_lock()` for true mutual exclusion within a transaction,
  *or*
- Set the timeout substantially higher (e.g. 4 hours) and accept that
  abandonments need a manual sweep.

---

## P1 — Real bugs

### P1-1. Status `analyzing_propositions` is documented but never set in the auto pipeline
`lib/transcription.ts:323-326` calls
`identifySpeakers(..., { skipPropositions: true })` and immediately transitions
`identifying_speakers → completed`. The intermediate `analyzing_topics` and
`analyzing_propositions` statuses appear in the type union (`lib/db.ts:4-11`)
and the poll handler (`lib/transcription.ts:181-184`), but the main pipeline
never writes them — they are only set if `identifySpeakers()` is called outside
the `skipPropositions` path (proposition analysis route).

**Fix:** either remove the unused statuses or make `runAnalysisPipeline` step
through them explicitly.

### P1-2. `cached-db.ts` does not paramaterize cache keys per arg
`lib/cached-db.ts:14-23`. `unstable_cache` *does* hash arguments into the key
internally, so this is technically safe — but the explicit `keyParts` array
(`["available-dates"]`, `["filter-options"]`) ignores the `daysBack` argument.
That makes cache observability and manual `revalidateTag()` harder than it
needs to be.

**Fix:** include `daysBack` in `keyParts` (e.g. `["available-dates", String(daysBack)]`)
so the cache entries are introspectable and explicitly distinct.

### P1-3. `db.ts:47-52` `ensureInitialized()` is a no-op
```ts
let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  initialized = true;
}
```
The function does nothing and is never called. Either delete it or wire it up
(e.g. to run schema bootstrap, set search_path explicitly, etc.). The pool's
`SET search_path` is currently set per connection by another mechanism; the
dead function adds confusion.

### P1-4. `sync-videos.ts` ships its own copy of the Kaltura resolution logic
`docs/webtv.md` itself flags this: "[`scripts/sync-videos.ts`] contains its own
inline copy of the Kaltura resolution logic." Two implementations, one bug
fix per change.

**Fix:** move the resolution logic to `lib/kaltura-helpers.ts` (already exists)
and import it from both the route handler and the script.

### P1-5. Hardcoded Kaltura partner / widget IDs scattered in code
`lib/transcription.ts:52,71` (`widgetId: "_2503451"`, `partnerId: 2503451`),
plus likely the same constants in `scripts/sync-videos.ts`. There is no
single source of truth; if the UN ever rotates this, we have to grep.

**Fix:** export `KALTURA_PARTNER_ID = 2503451` and `KALTURA_WIDGET_ID = "_2503451"`
from `lib/kaltura.ts` and reuse.

### P1-6. Word timestamps from Gemini are uniformly interpolated — RESOLVED (pipeline-wide)
**Was:** `lib/gemini-transcription.ts` and `lib/providers/convert.ts` spread
words evenly across a segment with a fake `confidence: 0.6` when the provider
returned no word-level timing. The UI used these for active-word highlighting,
so the cursor drifted visibly. This affected every word-less provider, not just
Gemini.

**Fixed:** interpolation is removed everywhere. The branch point is the
presence of real `words` (≡ the `ProviderCapabilities.wordTimestamps` flag):

- Word-less providers (gemini [default], azure-openai, groq-whisper, alibaba,
  mistral) now carry their real per-segment timestamps. The pipeline keeps each
  provider segment as a sentence with its real start/end (no `sbd` re-split, no
  fabricated word timing); same-speaker segments are still grouped into one
  speaker-turn statement (`lib/pipeline/index.ts` carries a per-segment
  `segments` list through the merge). Resegmentation is skipped for word-less
  paragraphs (no timing basis to place a sub-split). The UI
  (`components/transcript-view.tsx`, `raw-transcript-view.tsx`) seeks and
  highlights at the sentence/segment level.
- Real-word providers (assemblyai, deepgram, cohere, azure-speech, elevenlabs,
  google-chirp) are unchanged: per-word render, active-word underline,
  click-to-seek.

`RawParagraph.words` is now optional, the inert `confidence` field is dropped
from stored words, and `ParagraphInput` gained an optional `speaker` (the ASR
label no longer rides on `words[0].speaker`). Covered by rewritten
`lib/providers/convert.test.ts` and `lib/pipeline/shared.test.ts`.

### P1-7. `usage-tracking.ts:38-48` swallows DB errors silently
Insert errors are caught and logged but never raised. This is intentional —
we don't want billing instrumentation to fail the pipeline — but there's no
secondary path. If Postgres is flaking, we silently miss usage rows and
`pnpm usage-report` becomes unreliable.

**Fix:** at minimum, write failed events to a JSONL file in a known path
(`/tmp/usage-events.failed.jsonl`) so they can be backfilled later.

### P1-8. `searchVideos` FTS fallback path is silent
`lib/db.ts:766-795` wraps the FTS query in try/catch and falls through to
trigram ILIKE on error. There's no log statement on the catch — if FTS is
broken (e.g. extension missing) we'll happily run trigram-only forever.

**Fix:** `console.warn` on the catch with the error message.

### P1-9. `speaker-identification.ts:431` has an outstanding TODO
`// TODO: Add confidence filtering` near the proposition evidence check.
Low-confidence quotes can leak through; the filter is currently applied
elsewhere by fuzzy match. Worth completing or removing.

---

## P2 — Refactor opportunities (in rough priority)

### P2-1. `lib/speaker-identification.ts` is 1,505 lines
This single file owns:
- Speaker identification (Azure OpenAI structured output)
- Resegmentation
- Topic definition
- Sentence tagging
- Proposition analysis
- Evidence verification (fuzzy match)

**Suggested split (one file per pipeline stage):**
```
lib/pipeline/
  identify-speakers.ts
  resegment.ts
  define-topics.ts
  tag-sentences.ts
  analyze-propositions.ts
  index.ts        # re-exports the orchestrator identifySpeakers()
```
This also makes the "stage" labels in `processing_usage_events` align with
file names, which is a nice property when cost-debugging.

### P2-2. `components/TranscriptTable.tsx` is 1,162 lines
The component owns column definitions, all filter state (date, body,
category, status, free-text), pagination, scheduled-view toggle, and
the search-archive remote-fetching mode. Each filter is an island; they can
be moved into per-filter hooks (`useDateFilter`, `useStatusFilter`, …) and
the column-def map into a sibling file. Same playbook for
`components/transcription-panel.tsx` (836 LOC) and `components/pv-panel.tsx`
(662 LOC).

### P2-3. `lib/pv-parser.ts` is 1,260 lines with per-language regex
Six languages × ~5 hardcoded patterns each. The patterns are inlined alongside
the logic, which makes them hard to audit when a particular language breaks.

**Suggested:** move language patterns into a `pv-parser.patterns.ts` keyed by
language code. The parser becomes a small dispatcher.

### P2-4. Component naming convention is mixed
Both `TranscriptTable.tsx` (PascalCase) and `transcription-panel.tsx`
(kebab-case) coexist. Documentation has been inconsistent about this,
which has caused real confusion (CLAUDE.md previously referenced
`site-header.tsx`, but the file is `SiteHeader.tsx`).

**Recommendation:** pick one and standardize. Kebab-case is the Next.js
default and matches `app/` route file naming; PascalCase matches the React
convention for components. Either is fine, but a one-shot rename PR would
remove a recurring source of doc drift.

### P2-5. Two Gemini providers (`gemini` vs `gemini-eval`)
`lib/providers/gemini.ts` and `lib/providers/gemini-production.ts` both wrap
Gemini transcription with slightly different prompt schemas. There's clear
overlap; consider extracting the shared call/upload logic and parameterizing
the prompt schema.

### P2-6. Many large client components have no error / loading boundaries
There are no `error.tsx` or `loading.tsx` files in `app/`. When transcription
fails inside `transcription-panel.tsx`, the user sees only a generic error
state. Adding boundary files would let us surface clearer messages and
auto-retry buttons without changing the components.

### P2-7. Eval `compare-transcription.ts`, `test-pv-parser.ts`, `test-pv-alignment.ts` are stranded
They're real tools (not tests in the test-runner sense) but live next to the
production scripts and are not in `package.json`. Either promote them to
`pnpm` aliases (so they're documented and discoverable) or move them under
`scripts/dev/` to signal they're hand-run debugging utilities.

### P2-8. CLAUDE.md / docs claimed an 8-stage pipeline; code has 5
Now corrected. The "speaker normalization" stage is described in `docs/ai.md`
but is no longer wired into `runTranscriptionPipeline` — the production
Gemini provider deduplicates within its own chunked output. Either implement
the documented behaviour or delete the helper.

---

## P3 — Documentation / hygiene (mostly fixed in this PR)

### P3-1. CLAUDE.md routes table was incomplete
Missing: `/api/health`, `/api/languages`, `/api/pv`, `/api/pv/align`,
`/api/cron/sync-videos`, `/api/cron/check-pv`. **Fixed.**

### P3-2. CLAUDE.md component names didn't match disk
Said `site-header.tsx`, `video-table.tsx`. Files are `SiteHeader.tsx`,
`TranscriptTable.tsx`. **Fixed.**

### P3-3. CLAUDE.md said cron endpoints were `POST`
Implementations are `GET` (`app/api/cron/*/route.ts`). **Fixed.**

### P3-4. CLAUDE.md missed `pv_contents` table
`sql/schema.sql:103-111` defines it; the docs didn't mention it. **Fixed.**

### P3-5. CLAUDE.md transcript-status lifecycle was outdated
Said `transcribed → identifying_speakers → analyzing_topics`. The actual
type union is
`scheduled → transcribing → identifying_speakers → analyzing_topics → analyzing_propositions → completed | error`.
**Fixed.**

### P3-6. README.md project structure undercounted routes & components
Listed 7 routes, 5 components. Actual: 14 routes, 14+ components.
**Fixed.**

### P3-7. README.md said "Vercel cron job every 5 min for scheduled transcripts"
There are three crons (`process-scheduled` 5m, `sync-videos` 15m,
`check-pv` 6h). **Fixed.**

### P3-8. docs/webtv.md still said "Turso"
Migration to PostgreSQL happened in commits `934a7b9` and `a7005c7`. All
"Turso" references replaced with "PostgreSQL". **Fixed.**

### P3-9. docs/eval.md said "10 STT providers"
Registry has 12 (incl. `gemini-production`, `gemini-eval`, and `cohere`).
**Fixed.**

### P3-10. eval/README.md said providers live in `eval/providers/`
They live in `lib/providers/` (shared with the main app). **Fixed.**

### P3-11. CLAUDE.md "Hooks" missed `use-timezone.tsx`
**Fixed.**

### P3-12. AGENTS.md is one rule and feels under-used
It would be a natural home for project-wide conventions (component naming
choice from P2-4, "no test files in scripts/", PgBouncer port 6432 quirk,
Vercel timeouts, etc.). Leaving as-is for now — flagging for the next pass.

### P3-13. docs/TODO.md was two-line shorthand
Now expanded with the punch list above for handoff.

---

## Things that look fine

- **SQL parameterization** (`lib/db.ts:36-42`) — every query uses the `q()`
  helper that converts `?` to `$N`; no string-built SQL with user input.
- **Auth on cron endpoints** — all three crons validate
  `Authorization: Bearer ${process.env.CRON_SECRET}` before any work.
- **Schema isolation** — everything in the `webtv` schema with a dedicated
  `webtv_app` role (`sql/role.sql`).
- **Eval system independence** — separate tsconfig, dashboard uses npm; the
  eval harness can ship without dragging the web app along.
- **Cost tracking** — every Gemini and OpenAI call goes through
  `lib/usage-tracking.ts`; the rate card is versioned by date so historical
  cost reconstruction stays correct when prices change.

---

## Suggested fix sequence

1. P0-1 (delete the broken script) — 1 minute
2. P0-2 option 2 (drop the HTTP self-call) — 1 hour
3. P0-3 (wrap deletes in a transaction) — 30 minutes
4. P1-3 (delete dead `ensureInitialized`) — 5 minutes
5. P1-1 (clean up the unused statuses or wire them up) — 30 minutes
6. P1-4, P1-5 (de-duplicate Kaltura logic + extract constants) — 1 hour
7. P0-4 (heartbeat or advisory lock) — half a day; design first
8. P2 work as schedule allows
