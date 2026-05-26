import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiError } from "@/lib/api-error";
import {
  getEntityProfile,
  refsToBubbles,
  SPEAKER_PAGE_SIZE,
} from "@/lib/speaker-index";

/**
 * Paginated statement feed for a speaker profile. `key` is the (decoded) entity
 * key (e.g. `country:CHN`); `person` optionally narrows to one named speaker.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { searchParams } = request.nextUrl;
  const key = searchParams.get("key");
  if (!key) return apiError(400, "missing_parameter", "key is required");
  const person = searchParams.get("person");
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(
    SPEAKER_PAGE_SIZE,
    Math.max(
      1,
      Number(searchParams.get("limit") ?? SPEAKER_PAGE_SIZE) ||
        SPEAKER_PAGE_SIZE,
    ),
  );

  const profile = await getEntityProfile(key, person ?? null);
  if (!profile) return apiError(404, "not_found", "Unknown speaker");

  const slice = profile.refs.slice(offset, offset + limit);
  const bubbles = await refsToBubbles(slice);

  return NextResponse.json({
    bubbles,
    nextOffset: offset + slice.length,
    hasMore: offset + slice.length < profile.refs.length,
    total: profile.refs.length,
  });
}
