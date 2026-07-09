import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getVideoByAssetId } from "@/lib/db";
import { safeDecodePathSegments } from "@/lib/utils";
import { buildVideoMetadata, renderVideoPage } from "@/components/video-page";

export const dynamic = "force-dynamic";

/**
 * Permalink route. Mirrors WebTV's URL grammar exactly
 * (`webtv.un.org/{locale}/asset/{asset_id}`) so a domain swap from webtv →
 * transcripts lands here directly. The page renders in place — when a
 * citation URL is also available, the metadata canonical link points readers
 * and search engines at it without redirecting.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; assetPath: string[] }>;
}): Promise<Metadata> {
  const { locale, assetPath } = await params;
  const assetId = safeDecodePathSegments(assetPath);
  const record = assetId === null ? null : await getVideoByAssetId(assetId);
  if (!record) return {};
  return buildVideoMetadata({ record, locale });
}

export default async function AssetPage({
  params,
}: {
  params: Promise<{ locale: string; assetPath: string[] }>;
}) {
  const { locale, assetPath } = await params;
  const assetId = safeDecodePathSegments(assetPath);
  const record = assetId === null ? null : await getVideoByAssetId(assetId);
  if (!record) notFound();
  return renderVideoPage({ record, locale });
}
