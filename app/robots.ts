import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/get-base-url";

// Points crawlers at the locale-aware sitemap. Auth-walled paths are blocked
// so they don't end up indexed even if a stray link leaks in.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await getBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Locale-prefixed paths require the wildcard — /en/login etc. wouldn't
        // match a bare "/login" disallow under Google's matching rules.
        disallow: [
          "/api/",
          "/*/login",
          "/*/verify",
          "/*/subscriptions",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
