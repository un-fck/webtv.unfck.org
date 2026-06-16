import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { getVideoBySlug } from "@/lib/db";
import { OgHeader, getOgFonts } from "@/lib/og";

export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 };

// Two title sizes only — short titles get the headline treatment, long ones
// step down once. Both are big enough to stay readable in small unfurls.
function fitTitleSize(title: string): number {
  return title.length <= 80 ? 80 : 56;
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
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug: slugParts } = await params;
  const slug = slugParts.map(decodeURIComponent).join("/");

  // OG image is locale-agnostic v1 — title and meta show in English (matches
  // the WebTV source language) regardless of which locale page links to it.
  const [record, t, fonts] = await Promise.all([
    getVideoBySlug(slug),
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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fff",
          color: "#1a1a1a",
          padding: "72px 80px",
          fontFamily: "Roboto",
        }}
      >
        <OgHeader
          brand={t("wordmarkBrand")}
          descriptor={t("wordmarkDescriptor")}
          badge={t("publicPreview")}
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
      </div>
    ),
    { ...SIZE, fonts },
  );
}
