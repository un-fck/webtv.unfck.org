import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getSitemapVideos } from "@/lib/db";
import { getBaseUrl } from "@/lib/get-base-url";

// Public-facing routes that are the same path across locales. Auth-walled
// surfaces (login, verify, subscriptions) and the entire speaker directory
// (overview + detail pages, login-gated) are intentionally omitted; they
// shouldn't be crawled or indexed.
const STATIC_PATHS = ["/", "/about"] as const;

/**
 * Emit a sitemap that lists every public route × every official locale, with
 * `alternates.languages` cross-references so search engines can resolve the
 * right language variant. Required complement to the per-page `<link
 * rel="alternate">` tags set by `alternatesFor()` — Google in particular
 * weights sitemap hreflang more reliably than HTML hreflang.
 *
 * Meeting URLs come from the same DB query that backs the schedule page; we
 * bound the window to one year so the file stays under Google's 50k-URL
 * sitemap limit even as the archive grows (6 locales × ~8k meetings/year).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getBaseUrl();
  const now = new Date();

  function withAlternates(path: string) {
    const tail = path === "/" ? "" : path;
    return Object.fromEntries(
      routing.locales.map((l) => [l, `${base}/${l}${tail}`]),
    );
  }

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) => {
    const languages = withAlternates(path);
    return routing.locales.map((locale) => ({
      url: languages[locale],
      lastModified: now,
      alternates: { languages },
    }));
  });

  const videos = await getSitemapVideos(365).catch(() => []);
  const meetingEntries: MetadataRoute.Sitemap = videos.flatMap((v) => {
    const languages = withAlternates(`/${v.slug}`);
    return routing.locales.map((locale) => ({
      url: languages[locale],
      lastModified: v.updated_at,
      alternates: { languages },
    }));
  });

  return [...staticEntries, ...meetingEntries];
}
