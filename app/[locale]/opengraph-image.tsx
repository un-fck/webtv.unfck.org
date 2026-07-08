import { getTranslations } from "next-intl/server";
import { OgHeader, getOgFonts, renderOgImage } from "@/lib/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "UN Transcripts";

// Classical typography trick: glue the last word to the previous one with a
// non-breaking space so the headline never orphans a tiny word on its own line
// ("…at the / UN." → "…at / the UN."). Works across all six locales because
// it only touches the last whitespace, which all our headlines have one of
// (Chinese has none and is unaffected).
function fixOrphan(s: string): string {
  const i = s.trimEnd().lastIndexOf(" ");
  if (i === -1) return s;
  return s.slice(0, i) + " " + s.slice(i + 1);
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [header, home, fonts] = await Promise.all([
    getTranslations({ locale, namespace: "header" }),
    getTranslations({ locale, namespace: "home" }),
    getOgFonts(locale),
  ]);

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
        // Teams (and iMessage's square thumbnail) crop the OG image with
        // object-fit: cover to a near-square box, dropping the outer ~17%
        // on each side. The horizontal safe-area padding here keeps the
        // emblem, wordmark, headline, and titles inside that center band on
        // those clients without making the wide-format unfurls look hollow.
        padding: "72px 200px",
        fontFamily: "Roboto",
      }}
    >
      <OgHeader
        brand={header("wordmarkBrand")}
        descriptor={header("wordmarkDescriptor")}
        badge={header("publicPreview")}
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
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          {fixOrphan(home("headline"))}
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 400,
            lineHeight: 1.25,
            color: "#444",
          }}
        >
          {home("lead")}
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
