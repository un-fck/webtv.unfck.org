import { routing } from "@/i18n/routing";
import { apiError } from "@/lib/api-error";
import { getBaseUrl } from "@/lib/get-base-url";
import { PUBLIC_CORS_HEADERS } from "@/lib/security-headers";
import {
  resolveTranscriptAvailability,
  TranscriptIdentifierError,
  type TranscriptIdentifierInput,
} from "@/lib/transcript-availability";
import { NextRequest, NextResponse } from "next/server";

const CACHE_CONTROL = "s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const locale = request.nextUrl.searchParams.get("locale") ?? "en";
    if (!(routing.locales as readonly string[]).includes(locale)) {
      return withCors(
        apiError(
          400,
          "invalid_locale",
          "locale must be an official UN locale.",
        ),
      );
    }
    const result = await resolveTranscriptAvailability(
      identifierInput(request),
      { locale, baseUrl: await getBaseUrl() },
    );
    return withCors(
      NextResponse.json(result, {
        headers: { "Cache-Control": CACHE_CONTROL },
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid input.";
    if (error instanceof TranscriptIdentifierError) {
      return withCors(apiError(400, "invalid_identifier", message));
    }
    console.error("Transcript availability error:", error);
    return withCors(
      apiError(500, "internal_error", "Could not resolve transcript status."),
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_CORS_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function identifierInput(request: NextRequest): TranscriptIdentifierInput {
  const params = request.nextUrl.searchParams;
  return {
    assetId: params.get("assetId") ?? undefined,
    webtvUrl: params.get("webtvUrl") ?? undefined,
    kalturaId: params.get("kalturaId") ?? undefined,
    entryId: params.get("entryId") ?? undefined,
  };
}

function withCors<T extends Response>(response: T): T {
  for (const [key, value] of Object.entries(PUBLIC_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
