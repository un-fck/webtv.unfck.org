import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Menu } from "lucide-react";
import { TimezonePicker } from "@/components/timezone-picker";
import { AuthControl } from "@/components/auth-control";
import { AuthNavLinks } from "@/components/auth-nav-links";
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

// Items shared by the desktop bar and the mobile hamburger sheet so we don't
// duplicate copy.
function HeaderNavItems() {
  return (
    <>
      <TimezonePicker />
      <AuthNavLinks />
      <Link href="/about" className={navLinkClass}>
        About
      </Link>
    </>
  );
}

export function SiteHeader({ wide = false }: { wide?: boolean }) {
  // Breakpoint above which the emblem moves outboard into the page margin.
  // - Default container is max-w-5xl (1024px); outboard needs ~46px of side
  //   margin → viewport ≥ ~1070px. We use 1152px for comfortable breathing.
  // - Wide container is max-w-7xl (1280px); we need ~1326px before the emblem
  //   even fits, so we wait for 1408px before folding outboard. Below that it
  //   stays inline next to the wordmark.
  const outboardOnly = wide ? "hidden min-[1408px]:block" : "hidden min-[1152px]:block";
  const inlineOnly = wide ? "min-[1408px]:hidden" : "min-[1152px]:hidden";
  return (
    <header className="relative border-b border-border py-3">
      <div
        className={cn(
          "relative mx-auto flex items-center gap-4 px-4 sm:px-8",
          wide ? widePageWidth : pageWidth,
        )}
      >
        {/* On wide viewports the square emblem sits in the page margin
            immediately to the left of the centered container; on smaller
            viewports it folds back inline with the wordmark. Both branches
            share the same logical Link so the entire branding click target
            stays unified. */}
        {/* Emblem aspect is ≈1.198:1 (wider than tall); arbitrary widths
            below = round(height × 1.198). Explicit width is also required on
            the absolutely-positioned anchor since the global
            `img, video { max-width: 100% }` reset would otherwise clamp to the
            parent's containing-block width — and an absolute parent with no
            defined width collapses to 0.

            The 24.74px right offset overshoots into the container's px-8
            padding zone so the visible gap between emblem and "United Nations"
            equals the original horizontal logo's emblem-wordmark gap
            (23.01/126.89 ≈ 18.14% of emblem height → 7.26px at h-10). */}
        <Link
          href="/"
          aria-label="UN Transcripts — home"
          className={cn(
            "absolute top-1/2 right-[calc(100%-24.74px)] h-10 w-[47.9px] -translate-y-1/2 transition-opacity hover:opacity-75",
            outboardOnly,
          )}
        >
          <Image
            src="/images/un-emblem-colour.svg"
            alt="United Nations"
            width={152}
            height={127}
            className="h-10 w-[47.9px] shrink-0 select-none"
            draggable={false}
          />
        </Link>
        <Link
          href="/"
          aria-label="UN Transcripts — home"
          className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
        >
          <Image
            src="/images/un-emblem-colour.svg"
            alt=""
            width={152}
            height={127}
            className={cn("h-10 w-[47.9px] shrink-0 select-none", inlineOnly)}
            draggable={false}
          />
          {/* Both words are real text so the baseline lines up perfectly;
              same size, only the weight differs. */}
          <span className="text-[23.83px] leading-none tracking-tight text-foreground">
            <span className="font-bold">United Nations</span>{" "}
            <span className="font-light">Transcripts</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          {/* md+: inline nav. Below md it collapses into the hamburger so the
              right rail stays uncluttered when more items appear after sign-in
              (Speakers, Subscriptions, timezone picker). */}
          <div className="hidden items-center gap-4 md:flex">
            <HeaderNavItems />
          </div>
          <Popover>
            <PopoverTrigger
              aria-label="Open menu"
              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            >
              <Menu className="h-5 w-5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="flex w-48 flex-col gap-3 p-3"
            >
              <HeaderNavItems />
            </PopoverContent>
          </Popover>
          <AuthControl />
        </div>
      </div>
    </header>
  );
}
