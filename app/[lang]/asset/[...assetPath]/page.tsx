import { notFound, redirect } from "next/navigation";

import { getVideoByAssetId } from "@/lib/db";
import { meetingSlugFromVideo } from "@/lib/meeting-slug";

export const dynamic = "force-dynamic";

const UN_LANGS = new Set(["en", "ar", "zh", "es", "fr", "ru"]);

export default async function AssetRedirect({
  params,
}: {
  params: Promise<{ lang: string; assetPath: string[] }>;
}) {
  const { lang, assetPath } = await params;

  if (!UN_LANGS.has(lang)) notFound();

  const assetId = assetPath.join("/");
  const video = await getVideoByAssetId(assetId);
  if (!video) notFound();

  // Use the stored slug (saveVideo is the authority for uniqueness, incl.
  // -part-N disambiguation); fall back to recomputation only for legacy rows.
  const slug = video.slug ?? meetingSlugFromVideo(video);
  redirect(`/${slug}`);
}
