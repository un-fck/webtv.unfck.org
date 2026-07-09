import { getTranslations } from "next-intl/server";
import { RTL_LOCALES } from "@/i18n/routing";
import { OgHeader, OgText, getOgFonts, renderOgImage } from "@/lib/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "UN Transcripts";

// Horizontal padding. Sized for the clients that actually matter — X, Slack,
// Discord, LinkedIn, Facebook, WhatsApp, iMessage — all of which render the
// full 1.91:1 frame (X trims ~15px off the top and bottom to reach 2:1). We
// used to inset the content by 200px a side so it survived Microsoft Teams'
// near-square centre crop, but that squeezed the content column down to 800px:
// the Russian wordmark clipped off the right edge, its badge fell off canvas,
// and every locale's card read as hollow at the edges. Teams is not a target.
const PAD_X = 80;
const PAD_Y = 64;
const CONTENT_WIDTH = size.width - PAD_X * 2;

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
  const rtl = RTL_LOCALES.has(locale);

  return renderOgImage(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: rtl ? "flex-end" : "flex-start",
        background: "#fff",
        color: "#1a1a1a",
        padding: `${PAD_Y}px ${PAD_X}px`,
        fontFamily: "Roboto",
      }}
    >
      <OgHeader
        brand={header("wordmarkBrand")}
        descriptor={header("wordmarkDescriptor")}
        badge={header("publicPreview")}
        rtl={rtl}
        maxWidth={CONTENT_WIDTH}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: rtl ? "flex-end" : "flex-start",
          width: CONTENT_WIDTH,
          gap: 32,
          paddingBottom: 24,
        }}
      >
        <OgText
          rtl={rtl}
          style={{
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          {fixOrphan(home("headline"))}
        </OgText>
        <OgText
          rtl={rtl}
          style={{
            fontSize: 48,
            fontWeight: 400,
            lineHeight: 1.25,
            color: "#444",
          }}
        >
          {home("lead")}
        </OgText>
      </div>
    </div>,
    { ...size, fonts },
  );
}
