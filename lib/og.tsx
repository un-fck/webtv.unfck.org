import { readFileSync } from "node:fs";
import path from "node:path";

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

let cachedFontsPromise: Promise<OgFont[]> | null = null;

async function fetchGoogleFont(weight: 300 | 400 | 700): Promise<ArrayBuffer> {
  // Setting a non-modern User-Agent makes Google Fonts return TTF, which
  // Satori parses natively. Without this it returns WOFF2 only.
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=Roboto:wght@${weight}&display=swap`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    },
  );
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s+format/);
  if (!match) {
    throw new Error(`Could not extract font URL from Google Fonts CSS for Roboto@${weight}`);
  }
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export async function getOgFonts(): Promise<OgFont[]> {
  if (!cachedFontsPromise) {
    cachedFontsPromise = (async () => {
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
      cachedFontsPromise = null;
      throw err;
    });
  }
  return cachedFontsPromise;
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
        }}
      >
        {badge}
      </div>
    </div>
  );
}
