import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import {
  getAllFeeds,
  getUserFeedSubscriptions,
  getUserVideoSubscriptions,
  getVideoSubscription,
} from "@/lib/db";

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

  const [feeds, feedKeys, videoSubscriptions] = await Promise.all([
    getAllFeeds(),
    getUserFeedSubscriptions(user.id),
    getUserVideoSubscriptions(user.id),
  ]);

  return NextResponse.json({
    loggedIn: true,
    feeds: feeds
      .filter((f) => f.enabled)
      .map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        subscribed: feedKeys.includes(f.key),
      })),
    videoSubscriptions,
  });
}
