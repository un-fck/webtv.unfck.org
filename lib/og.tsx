import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

// Module-scope cache: the emblem SVG never changes at runtime.
let cachedEmblemUri: string | null = null;

// Satori (the renderer inside next/og's ImageResponse) ships with a single
// regular-weight Noto Sans and does not synthesize light or bold. Without the
// real Roboto weight files, `fontWeight: 300` and `fontWeight: 700` both fall
// back to that one regular face, so the wordmark looks single-weight. We fetch
// the actual Roboto Light/Regular/Bold from Google Fonts at first use and
// cache them at module scope for the rest of the process lifetime.
type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 300 | 400 | 700;
  style: "normal";
};

const GOOGLE_FONTS_UA =
  // Setting a non-modern User-Agent makes Google Fonts return TTF, which
  // Satori parses natively. Without this it returns WOFF2 only.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

let cachedRobotoPromise: Promise<OgFont[]> | null = null;
let cachedArabicPromise: Promise<OgFont[]> | null = null;

async function fetchGoogleFont(weight: 300 | 400 | 700): Promise<ArrayBuffer> {
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=Roboto:wght@${weight}&display=swap`,
    { headers: { "User-Agent": GOOGLE_FONTS_UA } },
  );
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s+format/);
  if (!match) {
    throw new Error(
      `Could not extract font URL from Google Fonts CSS for Roboto@${weight}`,
    );
  }
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

// Roboto has no Arabic glyphs, so the Arabic OG card needs a dedicated Arabic
// face. Satori chokes on many Arabic fonts — its OpenType parser throws
// `lookupType: 5 - substFormat: 3 is not yet supported` on the GSUB tables of
// the Noto Naskh/Sans/Kufi Arabic families, which is exactly what used to make
// `/ar/opengraph-image` return a 500 (Sentry TRANSCRIPTS-1K). Cairo's GSUB
// only uses substitution formats Satori can parse *and* still shapes Arabic
// joining correctly, so we use it for the Arabic locale. We pull the Arabic
// unicode subset specifically (Google splits each family into per-script
// subsets and Cairo's default `latin` subset carries no Arabic glyphs).
async function fetchGoogleArabicFont(
  weight: 400 | 700,
): Promise<ArrayBuffer> {
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=Cairo:wght@${weight}&display=swap`,
    { headers: { "User-Agent": GOOGLE_FONTS_UA } },
  );
  const css = await cssRes.text();
  // Google returns one of two CSS shapes depending on the User-Agent:
  //  - modern/woff2: the family is split into per-script @font-face blocks,
  //    each with a `unicode-range` (the Arabic subset covers U+06xx);
  //  - this UA: a single full-charset @font-face (a .woff already covering
  //    Arabic + Latin, with no unicode-range).
  // Prefer the Arabic subset block when present; otherwise fall back to the
  // single full-charset face — which still carries the Arabic glyphs.
  const blocks = css.split("@font-face");
  const arabicBlock = blocks.find((b) => /unicode-range:[^;]*U\+06/.test(b));
  const match = (arabicBlock ?? css).match(
    /src:\s*url\((https:\/\/[^)]+)\)\s+format/,
  );
  if (!match) {
    throw new Error(
      `Could not extract Arabic font URL from Google Fonts CSS for Cairo@${weight}`,
    );
  }
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

async function getRobotoFonts(): Promise<OgFont[]> {
  if (!cachedRobotoPromise) {
    cachedRobotoPromise = (async (): Promise<OgFont[]> => {
      const [light, regular, bold] = await Promise.all([
        fetchGoogleFont(300),
        fetchGoogleFont(400),
        fetchGoogleFont(700),
      ]);
      return [
        { name: "Roboto", data: light, weight: 300, style: "normal" },
        { name: "Roboto", data: regular, weight: 400, style: "normal" },
        { name: "Roboto", data: bold, weight: 700, style: "normal" },
      ];
    })().catch((err) => {
      // Don't trap a transient failure forever — clear the cache so the next
      // request can retry instead of forever serving a single-weight card.
      cachedRobotoPromise = null;
      throw err;
    });
  }
  return cachedRobotoPromise;
}

async function getArabicFonts(): Promise<OgFont[]> {
  if (!cachedArabicPromise) {
    cachedArabicPromise = (async (): Promise<OgFont[]> => {
      const [regular, bold] = await Promise.all([
        fetchGoogleArabicFont(400),
        fetchGoogleArabicFont(700),
      ]);
      return [
        { name: "Cairo", data: regular, weight: 400, style: "normal" },
        { name: "Cairo", data: bold, weight: 700, style: "normal" },
      ];
    })().catch((err) => {
      cachedArabicPromise = null;
      throw err;
    });
  }
  return cachedArabicPromise;
}

/**
 * Fonts for the OG card in the given locale. Always includes the three Roboto
 * weights (Latin); for Arabic it additionally includes the Cairo Arabic face
 * so Arabic headlines shape correctly. Satori picks the covering font per
 * glyph across the whole list regardless of family, so the JSX can keep
 * `fontFamily: "Roboto"` and Arabic runs still resolve to Cairo.
 *
 * If the Arabic face fails to load we degrade to Roboto-only rather than
 * throwing; the render would then fail on Arabic glyphs and `renderOgImage`'s
 * fallback card takes over — the route never 500s.
 */
export async function getOgFonts(locale?: string): Promise<OgFont[]> {
  const roboto = await getRobotoFonts();
  if (locale !== "ar") return roboto;
  try {
    const arabic = await getArabicFonts();
    return [...roboto, ...arabic];
  } catch (err) {
    console.error(
      "[og] failed to load Arabic font; Arabic card will use fallback",
      err,
    );
    return roboto;
  }
}

/**
 * Read the UN emblem from `public/` once and return it as a base64 data URI,
 * suitable for embedding in Satori's `<img src=...>` inside ImageResponse.
 * Server runtime only — uses node:fs.
 */
export function getEmblemDataUri(): string {
  if (cachedEmblemUri === null) {
    const svg = readFileSync(
      path.join(process.cwd(), "public/images/un-emblem-colour.svg"),
      "utf8",
    );
    cachedEmblemUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
  return cachedEmblemUri;
}

/**
 * Shared header for every OG card: emblem + "United Nations Transcripts"
 * split-weight wordmark + "Public Preview" pill. Mirrors `site-header.tsx`
 * exactly so that share cards visually match the live page — same emblem-to-
 * wordmark ratio, same `bold + " " + light` typography, same `bg-un-blue/10`
 * badge in `text-un-blue` on `rounded-md` corners.
 *
 * Sizes are 2× the live page values (emblem 40 → 80, wordmark 23.83 → 48,
 * badge 12 → 24) so the OG card reads at small unfurl scales.
 */
export function OgHeader({
  brand,
  descriptor,
  badge,
}: {
  brand: string;
  descriptor: string;
  badge: string;
}) {
  const emblem = getEmblemDataUri();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        // Matches `gap-2.5` (10px) on the live header, scaled 2×.
        gap: 20,
      }}
    >
      {/* Emblem intrinsic is 152×127; site-header renders it h-10 w-[47.9px].
          Scaled 2× for OG: h-80 w-[95.8]. */}
      <img src={emblem} width={96} height={80} alt="" />
      <div
        style={{
          // The two-weight wordmark renders as one inline run — bold "United
          // Nations" followed by a normal space, then light "Transcripts" —
          // exactly like the live header (single span, child spans for weight).
          display: "flex",
          fontSize: 48,
          lineHeight: 1,
          letterSpacing: "-0.025em",
          color: "#0a0a0a",
        }}
      >
        <span>
          {/* Satori trims literal whitespace between adjacent <span> nodes,
              so we glue the bold half to the trailing space with NBSP — the
              two halves stay on one inline run, like the live header. */}
          <span style={{ fontWeight: 700 }}>{brand + " "}</span>
          <span style={{ fontWeight: 300 }}>{descriptor}</span>
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          // `bg-un-blue/10` + `text-un-blue` + `rounded-md` (6px) + `px-2 py-1`
          // + `text-xs font-semibold`, scaled 2× for the OG layout.
          background: "rgba(0, 158, 219, 0.1)",
          color: "#009edb",
          padding: "8px 16px",
          borderRadius: 12,
          fontSize: 24,
          fontWeight: 600,
          // The tighter safe-area padding squeezes the row; pin the badge
          // to a single line so "Public Preview" never breaks into two.
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {badge}
      </div>
    </div>
  );
}

type OgImageOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>;

const OG_IMAGE_HEADERS: Record<string, string> = {
  "content-type": "image/png",
  // Mirror the cache-control ImageResponse sets itself, since we re-wrap the
  // rendered bytes into a plain Response below.
  "cache-control":
    process.env.NODE_ENV === "development"
      ? "no-cache, no-store"
      : "public, immutable, no-transform, max-age=31536000",
};

// 1×1 transparent PNG — the absolute last resort so the route still yields a
// 200 image/png even if both the primary and the fallback render throw.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

// A minimal, Latin-only card used when the localized render fails. It uses
// only Roboto and no locale text, so it cannot re-trigger the complex-script
// shaping (e.g. Arabic GSUB) that broke the primary render.
function OgFallbackCard(): ReactElement {
  const emblem = getEmblemDataUri();
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
        background: "#fff",
        color: "#0a0a0a",
        fontFamily: "Roboto",
      }}
    >
      <img src={emblem} width={144} height={120} alt="" />
      <div style={{ display: "flex", fontSize: 64, letterSpacing: "-0.025em" }}>
        <span style={{ fontWeight: 700 }}>{"United Nations "}</span>
        <span style={{ fontWeight: 300 }}>Transcripts</span>
      </div>
    </div>
  );
}

// ImageResponse renders lazily inside its body stream, so a Satori error only
// surfaces when the body is consumed (and shows up as "failed to pipe
// response" / a 500) — a `try { new ImageResponse() }` never catches it.
// Reading the whole body here forces the render and lets us catch that
// rejection.
async function bufferImageResponse(image: ImageResponse): Promise<Response> {
  const body = await image.arrayBuffer();
  return new Response(body, { status: 200, headers: OG_IMAGE_HEADERS });
}

/**
 * Render an OG image resiliently: it NEVER throws / 500s. On any render
 * failure it falls back to a Latin-only card (and, if even that fails, a blank
 * PNG), always returning a 200 `image/png`. See Sentry TRANSCRIPTS-1K: the
 * Arabic locale used to 500 because Satori can't parse the Arabic font's GSUB.
 */
export async function renderOgImage(
  element: ReactElement,
  options: OgImageOptions,
): Promise<Response> {
  try {
    return await bufferImageResponse(new ImageResponse(element, options));
  } catch (err) {
    console.error("[og] primary render failed; using Latin fallback card", err);
    try {
      // Keep only the Latin (Roboto) faces so the fallback can't hit the
      // failing complex-script shaping.
      const latinFonts = (options.fonts ?? []).filter(
        (font) => font.name === "Roboto",
      );
      return await bufferImageResponse(
        new ImageResponse(<OgFallbackCard />, { ...options, fonts: latinFonts }),
      );
    } catch (fallbackErr) {
      console.error("[og] fallback render failed; serving blank PNG", fallbackErr);
      return new Response(TRANSPARENT_PNG, {
        status: 200,
        headers: OG_IMAGE_HEADERS,
      });
    }
  }
}
