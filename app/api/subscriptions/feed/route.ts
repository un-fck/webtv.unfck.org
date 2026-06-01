import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  addFeedSubscription,
  removeFeedSubscription,
  getEnabledFeeds,
} from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { UN_LANGUAGES } from "@/lib/languages";

const VALID_LANGUAGE_CODES = new Set(UN_LANGUAGES.map((l) => l.code));

async function parseBody(request: NextRequest) {
  const { feedKey, language } = await request.json();
  if (!feedKey || typeof feedKey !== "string") {
    return { error: apiError(400, "missing_parameter", "feedKey is required") };
  }
  if (!language || typeof language !== "string") {
    return {
      error: apiError(400, "missing_parameter", "language is required"),
    };
  }
  if (!VALID_LANGUAGE_CODES.has(language)) {
    return { error: apiError(400, "invalid_parameter", "Unknown language") };
  }
  // Only allow subscribing to feeds that actually exist and are enabled.
  const feeds = await getEnabledFeeds();
  if (!feeds.some((f) => f.key === feedKey)) {
    return { error: apiError(404, "not_found", "Unknown feed") };
  }
  return { feedKey, language };
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await parseBody(request);
  if ("error" in body) return body.error;

  await addFeedSubscription(auth.user.id, body.feedKey, body.language);
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await parseBody(request);
  if ("error" in body) return body.error;

  await removeFeedSubscription(auth.user.id, body.feedKey, body.language);
  return NextResponse.json({ subscribed: false });
}
