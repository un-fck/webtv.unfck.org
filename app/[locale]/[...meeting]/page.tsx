import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getVideoBySlug } from "@/lib/db";
import { getCachedTranscriptedEntries } from "@/lib/cached-db";
import { notFound } from "next/navigation";
import { VideoPageClient } from "@/components/video-page-client";
import { extractKalturaId } from "@/lib/kaltura";
import { getVideoMetadata, recordToVideo } from "@/lib/un-api";
import { symbolFromSlug } from "@/lib/meeting-slug";
import { getCurrentUser } from "@/lib/auth/service";
import { Link } from "@/i18n/navigation";
import { alternatesFor } from "@/i18n/routing";
import { ExternalLink } from "@/components/external-link";
import { localizeWebtvAssetUrl } from "@/lib/un-links";

export const dynamic = "force-dynamic";

// Surface the meeting title in the document <title> so each meeting page gets
// its own tab/SERP label instead of inheriting the generic "UN Transcripts"
// from the layout. The brand suffix is localized via the `siteTitle` key; the
// meeting title itself stays in WebTV's source language (English) until a
// translation pipeline is in place.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meeting: string[] }>;
}): Promise<Metadata> {
  const { locale, meeting } = await params;
  const slug = meeting.map(decodeURIComponent).join("/");
  const record = await getVideoBySlug(slug);
  if (!record) return {};

  const title = record.clean_title || record.title;
  const t = await getTranslations({ locale, namespace: "metadata" });
  // Meeting slugs are already locale-agnostic (the path doesn't include the
  // locale prefix), so each alternate just wraps the same slug per locale.
  return {
    title: `${title} — ${t("siteTitle")}`,
    alternates: alternatesFor(locale, `/${slug}`),
  };
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ locale: string; meeting: string[] }>;
}) {
  const { locale, meeting } = await params;
  const slug = meeting.map(decodeURIComponent).join("/");

  // Validate that the slug matches a known pattern
  const isValidPattern =
    symbolFromSlug(slug) !== null || slug.startsWith("meeting/");
  if (!isValidPattern) {
    notFound();
  }

  const record = await getVideoBySlug(slug);
  if (!record) {
    notFound();
  }

  const kalturaId = extractKalturaId(record.asset_id);

  if (!kalturaId) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="min-h-screen bg-background px-4 sm:px-6"
      >
        <div className="mx-auto max-w-5xl py-8">
          <Link
            href="/"
            className="mb-4 inline-block text-primary hover:underline"
          >
            &larr; Back to homepage
          </Link>
          <div className="space-y-2">
            <p className="text-red-600">Unable to extract video ID</p>
            <p className="text-sm text-muted-foreground">
              Asset ID: {record.asset_id}
            </p>
            <ExternalLink
              href={localizeWebtvAssetUrl(record.url, locale)}
              className="block text-sm text-primary hover:underline"
            >
              View on UN Web TV &rarr;
            </ExternalLink>
          </div>
        </div>
      </main>
    );
  }

  // Check if this video has a transcript
  const transcriptedEntries = await getCachedTranscriptedEntries();
  const hasTranscript =
    record.entry_id !== null && transcriptedEntries.includes(record.entry_id);

  const video = recordToVideo(record, hasTranscript, locale);
  const metadata = await getVideoMetadata(record.asset_id);
  const isLoggedIn = !!(await getCurrentUser());

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <VideoPageClient
        kalturaId={kalturaId}
        video={video}
        metadata={metadata}
        isLoggedIn={isLoggedIn}
      />
    </main>
  );
}
