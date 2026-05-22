import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  addFeedSubscription,
  removeFeedSubscription,
  getEnabledFeeds,
} from "@/lib/db";
import { apiError } from "@/lib/api-error";

async function parseFeedKey(request: NextRequest) {
  const { feedKey } = await request.json();
  if (!feedKey || typeof feedKey !== "string") {
    return { error: apiError(400, "missing_parameter", "feedKey is required") };
  }
  // Only allow subscribing to feeds that actually exist and are enabled.
  const feeds = await getEnabledFeeds();
  if (!feeds.some((f) => f.key === feedKey)) {
    return { error: apiError(404, "not_found", "Unknown feed") };
  }
  return { feedKey };
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await parseFeedKey(request);
  if ("error" in body) return body.error;

  await addFeedSubscription(auth.user.id, body.feedKey);
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { feedKey } = await request.json();
  if (!feedKey || typeof feedKey !== "string") {
    return apiError(400, "missing_parameter", "feedKey is required");
  }

  await removeFeedSubscription(auth.user.id, feedKey);
  return NextResponse.json({ subscribed: false });
}
