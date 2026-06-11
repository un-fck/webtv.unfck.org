import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Menu } from "lucide-react";
import { LanguagePicker } from "@/components/language-picker";
import { TimezonePicker } from "@/components/timezone-picker";
import { AuthControl } from "@/components/auth-control";
import { AuthNavLinks } from "@/components/auth-nav-links";
import { MobileAuthSection } from "@/components/mobile-auth-section";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { typography } from "@/lib/typography";
import { pageWidth, widePageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

const navLinkClass = cn(
  typography.meta,
  "transition-colors hover:text-foreground",
);

// Page-level nav links: About + the auth-gated Speakers/Subscriptions.
// On mobile these collapse into the hamburger; on md+ they sit inline.
function HeaderPageLinks() {
  const t = useTranslations("header");
  return (
    <>
      <AuthNavLinks />
      <Link href="/about" className={navLinkClass}>
        {t("about")}
      </Link>
    </>
  );
}

// Preference cluster (timezone → language). Stays visible on mobile in a
// compact form (abbreviation + locale code, no chevron) rather than hiding
// behind the hamburger — switching language is a common first action for
// non-English visitors. Language is the rightmost preference because it sits
// closest to the account avatar; both belong to "this is your view of the
// site". gap-1 reads as one paired control rather than two floating pills.
function HeaderPickers({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <TimezonePicker compact={compact} />
      <LanguagePicker compact={compact} />
    </div>
  );
}

export function SiteHeader({ wide = false }: { wide?: boolean }) {
  const t = useTranslations("header");
  return (
    <header className="relative border-b border-border py-3">
      <div
        className={cn(
          "relative mx-auto flex items-center gap-4 px-4 sm:px-8",
          wide ? widePageWidth : pageWidth,
        )}
      >
        {/* UN Web TV-style lockup: emblem | divider | wordmark + badge, one
            unified click target. Below 400px the emblem and its divider drop
            so the wordmark and badge keep room next to the pickers/menu. */}
        <Link
          href="/"
          aria-label={t("logoAlt")}
          className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
        >
          {/* Emblem aspect is ≈1.198:1 (wider than tall); the arbitrary width
              = round(height × 1.198). */}
          <Image
            src="/images/un-emblem-colour.svg"
            alt=""
            width={152}
            height={127}
            className="hidden h-10 w-[47.9px] shrink-0 select-none min-[400px]:block"
            draggable={false}
          />
          <span
            aria-hidden
            className="hidden h-10 w-px shrink-0 bg-foreground min-[400px]:block"
          />
          {/* Mobile: wordmark + "Public Preview" badge stack vertically so the
              title can shrink and the badge stays visible without competing for
              row width with the pickers/menu. md+: original inline layout. */}
          <span className="flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-2.5">
            {/* Brand-first wordmark regardless of locale grammar — this is a
                logotype, not a sentence. */}
            <span className="text-lg leading-none font-bold tracking-tight text-foreground md:text-[23.83px]">
              {t("wordmarkBrand")} {t("wordmarkDescriptor")}
            </span>
            <span className="rounded-md bg-un-blue/10 px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap text-un-blue md:px-2 md:py-1 md:text-xs">
              {t("publicPreview")}
            </span>
          </span>
        </Link>
        <div className="ms-auto flex items-center gap-3">
          {/* md+: full inline nav (page links + full-width pickers).
              Below md the page links collapse into the hamburger but the
              pickers stay visible in a compact form — switching language is
              a common first action for non-English visitors and shouldn't
              hide behind a menu.
              gap-3 (12 px) instead of gap-4 (16 px): the language and timezone
              pills carry internal horizontal padding, so the perceived gap
              between two pills is gap + 2·pad. gap-3 keeps the pill-to-pill
              spacing legible without the row feeling loose. */}
          <div className="hidden items-center gap-3 md:flex">
            <HeaderPageLinks />
            <HeaderPickers />
          </div>
          <div className="flex items-center md:hidden">
            <HeaderPickers compact />
          </div>
          <Popover>
            <PopoverTrigger
              aria-label={t("openMenu")}
              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            >
              <Menu className="h-5 w-5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="flex w-56 flex-col gap-3 p-3"
            >
              <HeaderPageLinks />
              <MobileAuthSection />
            </PopoverContent>
          </Popover>
          <div className="hidden md:flex">
            <AuthControl />
          </div>
        </div>
      </div>
    </header>
  );
}
