import { notFound } from "next/navigation";

import { getVideoByAssetId } from "@/lib/db";
import { meetingSlugFromVideo } from "@/lib/meeting-slug";
import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function AssetRedirect({
  params,
}: {
  params: Promise<{ locale: string; assetPath: string[] }>;
}) {
  const { locale, assetPath } = await params;

  const assetId = assetPath.join("/");
  const video = await getVideoByAssetId(assetId);
  if (!video) notFound();

  // Use the stored slug (saveVideo is the authority for uniqueness, incl.
  // -part-N disambiguation); fall back to recomputation only for legacy rows.
  const slug = video.slug ?? meetingSlugFromVideo(video);
  redirect({ href: `/${slug}`, locale });
}
