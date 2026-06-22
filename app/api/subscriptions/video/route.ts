// Adds or removes a per-video transcript subscription for the current user.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { addVideoSubscription, removeVideoSubscription } from "@/lib/db";
import { apiError } from "@/lib/api-error";

async function parse(request: NextRequest) {
  const { kalturaId, language } = await request.json();
  if (!kalturaId || typeof kalturaId !== "string") {
    return {
      error: apiError(400, "missing_parameter", "kalturaId is required"),
    };
  }
  return {
    kalturaId,
    language: typeof language === "string" ? language : "en",
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await parse(request);
  if ("error" in body) return body.error;

  await addVideoSubscription(auth.user.id, body.kalturaId, body.language);
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await parse(request);
  if ("error" in body) return body.error;

  await removeVideoSubscription(auth.user.id, body.kalturaId, body.language);
  return NextResponse.json({ subscribed: false });
}
