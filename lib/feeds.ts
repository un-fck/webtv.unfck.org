import type { Feed, VideoRecord } from "./db";

/** The video fields a feed can match against. */
type MatchableVideo = Pick<
  VideoRecord,
  "category" | "title" | "clean_title" | "event_type"
>;

/**
 * Pure feed matcher. A video matches a feed when *all* of the feed's non-null
 * criteria match. A feed with no criteria matches nothing (so a misconfigured
 * feed never sweeps the whole archive). Comparisons are case-insensitive.
 *
 * Returns the keys of the feeds that match, in input order.
 */
export function matchFeeds(video: MatchableVideo, feeds: Feed[]): string[] {
  const title = (video.clean_title || video.title || "").toLowerCase();
  const category = (video.category || "").toLowerCase();
  const eventType = (video.event_type || "").toLowerCase();

  return feeds
    .filter((feed) => {
      const criteria: boolean[] = [];

      if (feed.match_categories && feed.match_categories.length > 0) {
        const allowed = feed.match_categories.map((c) => c.toLowerCase());
        criteria.push(!!category && allowed.includes(category));
      }
      if (feed.match_title_ilike) {
        criteria.push(title.includes(feed.match_title_ilike.toLowerCase()));
      }
      if (feed.match_event_type) {
        criteria.push(eventType === feed.match_event_type.toLowerCase());
      }

      // No criteria → no match. Otherwise every criterion must hold.
      return criteria.length > 0 && criteria.every(Boolean);
    })
    .map((feed) => feed.key);
}
