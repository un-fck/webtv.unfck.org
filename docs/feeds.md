# Feeds: Curated Auto-Transcription & Subscriptions

## What a feed is

A **feed** is a named matching rule stored in the `webtv.feeds` table — not a
config file, not a code constant. It does two independent jobs:

1. **Auto-transcription.** When the sync cron discovers a brand-new video, it
   checks the video against every enabled feed. Any match schedules the
   video for transcription automatically, with no one having to click
   "Transcribe" on the page.
2. **Email subscriptions.** Logged-in users can subscribe to a feed (per
   language) from the subscriptions settings UI. When a transcript in a
   matching language completes, subscribers get an email — same mechanism as
   subscribing to a single video, just matched by rule instead of by ID.

Because it's a table, adding/editing/disabling a feed is a **data change**,
not a schema change or a code deploy — see `sql/seed.sql` for the current
set of feeds; it's the source of truth, not this doc.

## Schema

`webtv.feeds`: `key` (stable slug), `label` and `description` (user-visible,
shown verbatim in the subscribe UI, not localized), `enabled`, and three
optional match criteria — `match_categories` (array), `match_title_ilike`
(substring), `match_event_type`. `webtv.feed_subscriptions` links a user to a
feed key + language. See `sql/schema.sql` for exact columns.

## Matching logic — `lib/feeds.ts`

`matchFeeds(video, feeds)` returns the keys of every feed that matches. For
each feed, every **non-null** criterion must hold (AND), compared
case-insensitively against the video's title, category, and event type. A
feed with zero criteria matches nothing — a safety valve so a misconfigured
empty-criteria feed can't silently sweep the whole archive.

**Prefer title substrings over category for narrow feeds.** UN Web TV's
`category` field tends to be broad (e.g. one category can cover several
distinct recurring briefings plus ad-hoc events), so a category-only feed
usually over-matches. Check real titles before assuming a category is
unique enough to a specific series.

## Where matching is invoked

Two independent consumers read the same table, and they don't treat
`enabled` the same way:

- **`lib/cron/sync-videos.ts`** — matches only _enabled_ feeds, and only
  against videos being discovered for the first time. Disabling a feed
  stops it from claiming new videos going forward; it does nothing to
  videos already scheduled/transcribed, and there's no retroactive backfill.
- **`lib/cron/send-transcript-notifications.ts`** — matches _all_ feeds,
  enabled or not, against every newly-completed transcript, then emails
  subscribers. This is deliberate: disabling a feed shouldn't silently
  orphan people who are still subscribed to it.

**Gotcha:** because of that split, `enabled = false` only stops auto-
transcription — existing subscribers keep getting emails. To fully retire a
feed, also remove its `feed_subscriptions` rows (or delete the feed row,
which cascades).

## Files

| File                                                                    | Role                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lib/feeds.ts`                                                          | Pure matcher, `matchFeeds()`                                        |
| `lib/cron/sync-videos.ts`                                               | Auto-schedules transcription on newly-discovered matches            |
| `lib/cron/send-transcript-notifications.ts`                             | Matches completed transcripts to feed subscribers                   |
| `lib/db.ts`                                                             | `Feed` type, feed CRUD/query helpers                                |
| `app/api/subscriptions/route.ts`, `app/api/subscriptions/feed/route.ts` | User-facing subscribe/unsubscribe + settings payload                |
| `components/subscriptions-manager.tsx`                                  | Renders `label`/`description` and the per-language subscribe toggle |
| `sql/schema.sql`                                                        | `feeds`, `feed_subscriptions` table definitions                     |
| `sql/seed.sql`                                                          | Canonical current set of feed rows                                  |
