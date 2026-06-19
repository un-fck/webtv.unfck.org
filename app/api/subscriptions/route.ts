import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import {
  getAllFeeds,
  getUserFeedSubscriptions,
  getUserVideoSubscriptions,
  getVideoSubscription,
} from "@/lib/db";
import { videoUrl } from "@/lib/video-url";

// GET /api/subscriptions
//   - ?kalturaId=&language=  → { subscribed } for hydrating the per-video toggle
//   - (no params)            → full payload for the settings page
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    // Not an error for the toggle — just "not subscribed / nothing to show".
    return NextResponse.json({ loggedIn: false });
  }

  const { searchParams } = request.nextUrl;
  const kalturaId = searchParams.get("kalturaId");
  if (kalturaId) {
    const language = searchParams.get("language") || "en";
    const subscribed = await getVideoSubscription(user.id, kalturaId, language);
    return NextResponse.json({ loggedIn: true, subscribed });
  }

  const [feeds, feedSubs, videoSubscriptions] = await Promise.all([
    getAllFeeds(),
    getUserFeedSubscriptions(user.id),
    getUserVideoSubscriptions(user.id),
  ]);

  // Group {feed_key, language}[] into { [feed_key]: language[] } so the UI
  // can render each feed row with its currently-subscribed languages.
  const languagesByFeed = new Map<string, string[]>();
  for (const sub of feedSubs) {
    const list = languagesByFeed.get(sub.feed_key) ?? [];
    list.push(sub.language);
    languagesByFeed.set(sub.feed_key, list);
  }

  return NextResponse.json({
    loggedIn: true,
    feeds: feeds
      .filter((f) => f.enabled)
      .map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        subscribedLanguages: languagesByFeed.get(f.key) ?? [],
      })),
    videoSubscriptions: videoSubscriptions.map((sub) => ({
      kaltura_id: sub.kaltura_id,
      language: sub.language,
      title: sub.title,
      // Resolved server-side so the UI only has to render the link.
      slug: sub.asset_id
        ? videoUrl({
            asset_id: sub.asset_id,
            pv_symbol: sub.pv_symbol,
            pv_part: sub.pv_part,
          })
        : null,
      created_at: sub.created_at,
      emailed_at: sub.emailed_at,
    })),
  });
}
