// Aligns a parsed PV document with audio to produce per-turn timestamps.
import { NextRequest, NextResponse } from "next/server";
import { getPVContent, savePVContent } from "@/lib/db";
import { getKalturaAudioUrl } from "@/lib/transcription";
import { alignPVWithAudio } from "@/lib/pv-alignment";
import type { PVDocument } from "@/lib/pv-parser";
import { apiError } from "@/lib/api-error";
import { requireUser } from "@/lib/auth/require-user";
import {
  enforceUserDailyLimit,
  enforceGlobalDailyLimit,
} from "@/lib/rate-limit";

export const maxDuration = 120;

// Cost backstop for PV alignment (uploads audio + runs a billed Gemini pass).
// Mirrors the transcribe limits; overridable via env.
const PV_ALIGN_USER_DAILY_LIMIT =
  Number(process.env.PV_ALIGN_USER_DAILY_LIMIT) || 5;
const PV_ALIGN_GLOBAL_DAILY_LIMIT =
  Number(process.env.PV_ALIGN_GLOBAL_DAILY_LIMIT) || 50;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    pvSymbol,
    kalturaId,
    language = "en",
  } = body as {
    pvSymbol: string;
    kalturaId: string;
    language?: string;
  };

  if (!pvSymbol || !kalturaId) {
    return apiError(
      400,
      "missing_parameter",
      "Missing required parameters: pvSymbol, kalturaId",
    );
  }

  // Check if already aligned. This runs before auth/limits so a completed
  // alignment stays freely re-fetchable by anyone (the result is public,
  // like a completed transcript) — only a genuine billed run is gated below.
  const cached = await getPVContent(pvSymbol, language);
  if (cached) {
    const doc = cached.content as PVDocument & { aligned?: boolean };
    if (doc.aligned) {
      return NextResponse.json(doc);
    }
  }

  // Need the parsed PV document
  if (!cached) {
    return apiError(
      400,
      "missing_data",
      "PV document not parsed yet. Fetch /api/pv first.",
    );
  }

  // A fresh alignment is a billed Gemini run — require login and enforce the
  // per-user + global daily cost ceilings before doing any paid work.
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const userLimited = await enforceUserDailyLimit(
    auth.user.id,
    "pv-align",
    PV_ALIGN_USER_DAILY_LIMIT,
  );
  if (userLimited) return userLimited;
  const globalLimited = await enforceGlobalDailyLimit(
    "pv-align",
    PV_ALIGN_GLOBAL_DAILY_LIMIT,
  );
  if (globalLimited) return globalLimited;

  const pvDoc = cached.content as PVDocument;

  // Get audio URL
  const { audioUrl } = await getKalturaAudioUrl(kalturaId);

  // Run alignment
  const aligned = await alignPVWithAudio(pvDoc, audioUrl);

  // Save aligned version
  await savePVContent(pvSymbol, language, aligned as object);

  return NextResponse.json(aligned);
}
