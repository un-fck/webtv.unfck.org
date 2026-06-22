// Returns paginated statements attributed to a speaker entity.
import { NextRequest, NextResponse } from "next/server";
import { requireExperimental } from "@/lib/auth/require-experimental";
import { apiError } from "@/lib/api-error";
import {
  getEntityProfileBySlug,
  refsToBubbles,
  SPEAKER_PAGE_SIZE,
} from "@/lib/speaker-index";

/**
 * Paginated statement feed for a speaker profile. `slug` is the entity slug
 * (e.g. `china`, `ocha`); `person` optionally narrows to one named speaker by
 * their slug (e.g. `tom-fletcher`).
 */
export async function GET(request: NextRequest) {
  const auth = await requireExperimental();
  if (auth.response) return auth.response;

  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");
  if (!slug) return apiError(400, "missing_parameter", "slug is required");
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

  // Only affects display names (country affiliations); unknown values fall
  // back to English inside getCountryName.
  const locale = searchParams.get("locale") ?? "en";

  const profile = await getEntityProfileBySlug(slug, person ?? null);
  if (!profile) return apiError(404, "not_found", "Unknown speaker");

  const slice = profile.refs.slice(offset, offset + limit);
  const bubbles = await refsToBubbles(slice, locale);

  return NextResponse.json({
    bubbles,
    nextOffset: offset + slice.length,
    hasMore: offset + slice.length < profile.refs.length,
    total: profile.refs.length,
  });
}
