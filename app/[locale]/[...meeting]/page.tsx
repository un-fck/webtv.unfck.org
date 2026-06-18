import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getVideoBySlug } from "@/lib/db";
import { getCachedTranscriptedEntries } from "@/lib/cached-db";
import { notFound } from "next/navigation";
import { VideoPageClient } from "@/components/video-page-client";
import { extractKalturaId, KALTURA_PARTNER_ID, KALTURA_UICONF_ID } from "@/lib/kaltura";
import { getBaseUrl } from "@/lib/get-base-url";
import { getVideoMetadata, recordToVideo } from "@/lib/un-api";
import { symbolFromSlug } from "@/lib/meeting-slug";
import { getCurrentUser } from "@/lib/auth/service";
import { Link } from "@/i18n/navigation";
import { alternatesFor } from "@/i18n/routing";
import { ExternalLink } from "@/components/external-link";
import { localizeWebtvAssetUrl } from "@/lib/un-links";

export const dynamic = "force-dynamic";

function formatMetaDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Surface the meeting title in the document <title>, og:title, and twitter:title
// so each meeting page gets its own tab/SERP/share-card label instead of
// inheriting the generic "UN Transcripts" from the layout. The brand suffix is
// localized via the `siteTitle` key; the meeting title itself stays in WebTV's
// source language (English) until a translation pipeline is in place.
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
  const siteTitle = t("siteTitle");
  const pageTitle = `${title} — ${siteTitle}`;
  const dateLabel = formatMetaDate(record.date, locale);
  const description = record.body
    ? t("meetingDescription", { body: record.body, date: dateLabel })
    : t("meetingDescriptionNoBody", { date: dateLabel });

  // Meeting slugs are already locale-agnostic (the path doesn't include the
  // locale prefix), so each alternate just wraps the same slug per locale.
  return {
    title: pageTitle,
    description,
    alternates: alternatesFor(locale, `/${slug}`),
    openGraph: {
      type: "article",
      siteName: siteTitle,
      title,
      description,
      url: `/${locale}/${slug}`,
      publishedTime: record.date,
      section: record.body ?? undefined,
      // Catch-all routes can't host a metadata-image file (Next.js disallows
      // segments after `[...meeting]`), so the per-meeting OG card is served
      // by a route handler at `/api/og/meeting/[...slug]` instead.
      images: [
        {
          url: `/api/og/meeting/${slug}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og/meeting/${slug}`],
    },
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

  // Schema.org VideoObject — helps Google rich results and some unfurlers.
  // `description`, `thumbnailUrl`, and `embedUrl` are required (or strongly
  // recommended) by Google's video structured data spec.
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  const dateLabel = formatMetaDate(record.date, locale);
  const fallbackDescription = record.body
    ? tMeta("meetingDescription", { body: record.body, date: dateLabel })
    : tMeta("meetingDescriptionNoBody", { date: dateLabel });
  const baseUrl = await getBaseUrl();
  const embedUrl = `https://cdnapisec.kaltura.com/p/${KALTURA_PARTNER_ID}/sp/${KALTURA_PARTNER_ID}00/embedIframeJs/uiconf_id/${KALTURA_UICONF_ID}/partner_id/${KALTURA_PARTNER_ID}?iframeembed=true&entry_id=${record.entry_id ?? kalturaId}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: record.clean_title || record.title,
    description:
      metadata.description || metadata.summary || fallbackDescription,
    // OG image is a guaranteed 1200x630 PNG (Kaltura's thumbnail endpoint
    // 404s for many older entries and live recordings).
    thumbnailUrl: `${baseUrl}/api/og/meeting/${slug}`,
    uploadDate: record.date,
    duration:
      typeof record.duration === "number" && record.duration > 0
        ? `PT${Math.round(record.duration)}S`
        : undefined,
    embedUrl,
    inLanguage: locale,
    isFamilyFriendly: true,
    publisher: {
      "@type": "Organization",
      name: "United Nations",
      url: "https://www.un.org",
    },
  };

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        // JSON.stringify escapes </ vectors; the only injection surface is
        // record fields (title/body/etc.) which are TEXT columns we already
        // render to HTML elsewhere.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VideoPageClient
        kalturaId={kalturaId}
        video={video}
        metadata={metadata}
        isLoggedIn={isLoggedIn}
      />
    </main>
  );
}
