      import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "@/components/external-link";
import { Link } from "@/i18n/navigation";
import { pageWidth } from "@/lib/layout";
import { typography } from "@/lib/typography";
import { unUrl } from "@/lib/un-links";
import { cn } from "@/lib/utils";

// Bottom-of-page footer mounted in the locale layout so every route gets it.
//
// Carries the minimum the UN Multilingualism Web Standards require: footer
// content reads in the active locale (req #9), and there is a reciprocal
// back-link to un.org in the same language (req #12). Visual register stays
// quiet — header is the brand surface; footer is the trust-signal surface.
export function SiteFooter() {
  const tHeader = useTranslations("header");
  const tFooter = useTranslations("footer");
  const tHome = useTranslations("home");
  const locale = useLocale();

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div
        className={cn(
          "mx-auto flex flex-col gap-3 px-4 py-6 sm:px-8 md:flex-row md:items-center md:justify-between",
          pageWidth,
        )}
      >
        <div className={cn(typography.meta, "text-foreground")}>
          <span className="font-semibold">{tHeader("wordmarkBrand")}</span>{" "}
          <span className="font-light">{tHeader("wordmarkDescriptor")}</span>
          <span className="mx-2 text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="text-muted-foreground">
            {tHome("publicPreview")}. {tFooter("notOfficial")}
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
