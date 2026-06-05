"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { ExternalLink } from "@/components/external-link";
import { Link } from "@/i18n/navigation";
import { pageWidth, widePageWidth } from "@/lib/layout";
import { typography } from "@/lib/typography";
import { unUrl } from "@/lib/un-links";
import { cn } from "@/lib/utils";

// Wide pages all live under the [...meeting] catch-all and start with one of
// these top-level segments (see lib/meeting-slug.ts). Everything else
// (about, login, speakers, subscriptions, verify, home) uses the standard
// pageWidth.
const WIDE_SEGMENTS = new Set([
  "sc",
  "ga",
  "hrc",
  "ecosoc",
  "meeting",
]);

function isWidePathname(pathname: string): boolean {
  // pathname is like "/{locale}/sc/9748" or "/{locale}" or "/{locale}/about".
  const segments = pathname.split("/").filter(Boolean);
  return segments.length >= 2 && WIDE_SEGMENTS.has(segments[1]);
}

// Bottom-of-page footer mounted in the locale layout so every route gets it.
//
// Carries the minimum the UN Multilingualism Web Standards require: footer
// content reads in the active locale (req #9), and there is a reciprocal
// back-link to un.org in the same language (req #12). Visual register stays
// quiet — header is the brand surface; footer is the trust-signal surface.
export function SiteFooter() {
  const tHeader = useTranslations("header");
  const tFooter = useTranslations("footer");
  const locale = useLocale();
  const pathname = usePathname();
  const wide = isWidePathname(pathname);

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div
        className={cn(
          "mx-auto flex flex-col gap-3 px-4 py-6 sm:px-8 md:flex-row md:items-center md:justify-between",
          wide ? widePageWidth : pageWidth,
        )}
      >
        <div className={cn(typography.meta, "text-foreground")}>
          <span className="font-semibold">{tHeader("wordmarkBrand")}</span>{" "}
          <span className="font-light">{tHeader("wordmarkDescriptor")}</span>
          <span className="mx-2 text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="text-muted-foreground">
            {tHeader("publicPreview")}. {tFooter("notOfficial")}
          </span>
        </div>
        <nav
          className={cn(typography.meta, "flex items-center gap-4")}
          aria-label="footer"
        >
          <Link
            href="/about"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {tHeader("about")}
          </Link>
          <ExternalLink
            href={unUrl("", locale)}
            aria-label={tFooter("unOrgLinkLabel")}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {tHeader("wordmarkBrand")}
          </ExternalLink>
        </nav>
      </div>
    </footer>
  );
}
