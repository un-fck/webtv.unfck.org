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

Now mostly done — a deterministic test net (Layer 1 + characterization tests)
made these safe. See the sequenced refactor PRs.

- [x] Stranded dev tools — `test-pv-parser` / `test-pv-alignment` now have `package.json` aliases (`compare-transcribe` already did).
- [x] Documented "speaker normalization" stage — the `normalizeSpeakers()` helper no longer exists; removed the dead `openaiNormalizeSpeakers` usage key and corrected `docs/ai.md` to mark the stage as design-intent-only.
- [x] Split `lib/speaker-identification.ts` into `lib/pipeline/` (shared, identify-speakers orchestrator in `index.ts`, resegment, define-topics, tag-sentences, analyze-propositions). Public API preserved via `index.ts` re-exports; pure helpers pinned by `lib/pipeline/shared.test.ts`.
- [x] Move `lib/pv-parser.ts` language patterns → `lib/pv-parser-patterns.ts` keyed by language code (Arabic line-scan handler stays as code). Covered by `lib/pv-parser.test.ts`.
- [x] Standardize component file naming → kebab-case (renamed the 5 PascalCase files; exported identifiers unchanged). CLAUDE.md updated.
- [x] Consolidate Gemini providers — `gemini.ts` (eval) now shares Files-API plumbing from `gemini-utils.ts`; kept as two providers (distinct output schemas), not merged.
- [x] Add `error.tsx` / `loading.tsx` boundaries under `app/` (root + `[...meeting]`).
- [~] Break up the big components. **Partly done:** pure logic extracted with unit tests — `findReferences` → `lib/pv-reference-linking.ts` (from `pv-panel`), `formatTimecode`/`formatSpeakerText` → `lib/transcript-formatting.ts` (from `transcription-panel`). Component test harness added (Vitest `projects` + jsdom + RTL; `transcript-table.test.tsx`). **Remaining (dedicated PRs):** the stateful-hook + sub-component decomposition of `transcript-table.tsx` (1.1k), `transcription-panel.tsx`, `pv-panel.tsx` — needs per-component characterization tests of the transcribe/poll/export/filter behaviour first.

## Original notes

- check UI timezone deps
- should be New York time? -- webtv time
