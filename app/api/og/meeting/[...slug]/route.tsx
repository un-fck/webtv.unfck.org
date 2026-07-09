// Generates an Open Graph image for a meeting page.
import type { VideoRecord } from "@/lib/db";
import { getVideoByAssetId, getVideoByCitation } from "@/lib/db";
import { symbolFromSlug } from "@/lib/meeting-slug";
import { OgHeader, getOgFonts, renderOgImage } from "@/lib/og";
import { safeDecodePathSegments } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { enforceIpLimit } from "@/lib/rate-limit";

async function resolveVideo(slug: string): Promise<VideoRecord | null> {
  if (slug.startsWith("asset/")) {
    return getVideoByAssetId(slug.slice("asset/".length));
  }
  const parsed = symbolFromSlug(slug);
  if (!parsed) return null;
  return getVideoByCitation(parsed);
}

export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 };

// See app/[locale]/opengraph-image.tsx for why the safe-area padding is gone.
const PAD_X = 80;
const PAD_Y = 64;
const CONTENT_WIDTH = SIZE.width - PAD_X * 2;

// Three title sizes — short titles get the headline treatment, long ones step
// down. Buckets are tuned for the 1040px content column so the longest real
// titles still fit in five lines.
function fitTitleSize(title: string): number {
  if (title.length <= 72) return 80;
  if (title.length <= 143) return 56;
  return 44;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  // Per-IP cap on the Satori render (force-dynamic, CPU per request). Generous,
  // since legitimate social/crawler unfurls hit this from varied IPs.
  const ipLimited = await enforceIpLimit(req, "og", 60);
  if (ipLimited) return ipLimited;

  const { slug: slugParts } = await params;
  const slug = safeDecodePathSegments(slugParts);

  // OG image is locale-agnostic v1 — title and meta show in English (matches
  // the WebTV source language) regardless of which locale page links to it.
  // A malformed slug (bad percent-encoding) yields no record → generic image.
  const [record, t, fonts] = await Promise.all([
    slug === null ? Promise.resolve(null) : resolveVideo(slug),
    getTranslations({ locale: "en", namespace: "header" }),
    getOgFonts(),
  ]);

  const title = record?.clean_title || record?.title || "UN Meeting";
  const category = record?.category || record?.body || "";
  const date = record?.date ? formatDate(record.date) : "";
  const titleSize = fitTitleSize(title);

  // Build the meta line conditionally so we don't render " · " with empty
  // sides for the rare slug whose record is missing both category and date.
  const metaParts = [category, date].filter(Boolean);

  return renderOgImage(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fff",
        color: "#1a1a1a",
        padding: `${PAD_Y}px ${PAD_X}px`,
        fontFamily: "Roboto",
      }}
    >
      <OgHeader
        brand={t("wordmarkBrand")}
        descriptor={t("wordmarkDescriptor")}
        badge={t("publicPreview")}
        maxWidth={CONTENT_WIDTH}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 32,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        {metaParts.length > 0 && (
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 400,
              color: "#555",
            }}
          >
            {metaParts.join("  ·  ")}
          </div>
        )}
      </div>
    </div>,
    { ...SIZE, fonts },
  );
}
