# TODO

Backlog. Full justification + file:line references in [REVIEW.md](../REVIEW.md).

## P0 — fix soon

- [x] **`pnpm test-gemini` is broken** — already removed from `package.json`.
- [x] **Fire-and-forget self-calls fall back to `localhost:3000`** — dropped the HTTP indirection. `runSpeakerIdentification()` in `lib/transcription.ts` now runs in-process via `after()` from the transcribe/check routes; `/api/identify-speakers` calls the same shared function.
- [x] **Cascading deletes are non-atomic** — `deleteTranscript` and `deleteTranscriptsForEntry` now run inside a single `BEGIN/COMMIT` via `withTransaction()` in `lib/db.ts`.
- [x] **Pipeline lock has no heartbeat** — added `touchPipelineLock()` and call it at each stage boundary (and throttled every 30s during the long resegmentation pass) so progressing jobs aren't re-entered.

## P1 — bugs / correctness

- [x] `analyzing_topics` / `analyzing_propositions` statuses — already set in `lib/speaker-identification.ts` (1429/1467). No longer stale.
- [x] `lib/cached-db.ts` now includes `daysBack` in `keyParts`.
- [x] `lib/db.ts` `ensureInitialized()` no-op — deleted along with all call sites.
- [x] `scripts/sync-videos.ts` Kaltura resolution — consolidated into `resolveEntryIdFromKaltura()` in `lib/kaltura-helpers.ts`.
- [x] Kaltura partner/widget IDs — extracted to `KALTURA_PARTNER_ID` / `KALTURA_WIDGET_ID` in `lib/kaltura.ts` and reused everywhere.
- [x] `lib/usage-tracking.ts` — failed inserts now spool to a JSONL fallback (`USAGE_EVENTS_FAILED_PATH`, default OS temp dir) for backfill.
- [x] `lib/db.ts` FTS fallback — now `console.warn`s before degrading to trigram ILIKE.
- [x] `lib/speaker-identification.ts:431` confidence-filtering TODO — no longer present in the code.
- [ ] Word-level timestamps on Gemini are uniformly interpolated when not provided (`lib/gemini-transcription.ts`); UI active-word cursor visibly drifts on long segments. **Deferred** — optional UI change (render at sentence level when no real word timing), not a correctness bug.

## P2 — refactor opportunities

Deferred — these are large, mostly-mechanical refactors with broad surface area
and no test coverage to catch regressions. Tackle as dedicated PRs.

- [x] Stranded dev tools — `test-pv-parser` / `test-pv-alignment` now have `package.json` aliases (`compare-transcribe` already did).
- [x] Documented "speaker normalization" stage — the `normalizeSpeakers()` helper no longer exists; removed the dead `openaiNormalizeSpeakers` usage key and corrected `docs/ai.md` to mark the stage as design-intent-only.
- [ ] Split `lib/speaker-identification.ts` (~1,500 LOC) into one file per pipeline stage under `lib/pipeline/`.
- [ ] Break up `components/TranscriptTable.tsx` (1,162 LOC), `transcription-panel.tsx` (836), `pv-panel.tsx` (662) into per-feature hooks + smaller components.
- [ ] Move `lib/pv-parser.ts` (1,260 LOC) language patterns into a separate config keyed by language code.
- [ ] Standardize component file naming (PascalCase vs kebab-case is currently mixed). CLAUDE.md explicitly says match neighbours / don't bulk-rename — needs a deliberate decision first.
- [ ] Consolidate `gemini.ts` and `gemini-production.ts` providers — share the Files-API plumbing, parameterize the prompt schema.
- [ ] Add `error.tsx` / `loading.tsx` boundaries under `app/` so transcription failures surface a useful UI.

## Original notes

- check UI timezone deps
- should be New York time? -- webtv time
