import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getVideoByCitation } from "@/lib/db";
import { symbolFromSlug } from "@/lib/meeting-slug";
import { buildVideoMetadata, renderVideoPage } from "@/components/video-page";

export const dynamic = "force-dynamic";

async function resolveCitation(meeting: string[]) {
  const slug = meeting.map(decodeURIComponent).join("/");
  const parsed = symbolFromSlug(slug);
  if (!parsed) return null;
  return getVideoByCitation(parsed);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meeting: string[] }>;
}): Promise<Metadata> {
  const { locale, meeting } = await params;
  const record = await resolveCitation(meeting);
  if (!record) return {};
  return buildVideoMetadata({ record, locale });
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ locale: string; meeting: string[] }>;
}) {
  const { locale, meeting } = await params;
  const record = await resolveCitation(meeting);
  if (!record) notFound();
  return renderVideoPage({ record, locale });
}
