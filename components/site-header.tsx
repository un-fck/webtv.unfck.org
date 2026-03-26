import Image from "next/image";
import Link from "next/link";

interface SiteHeaderProps {
  /** If provided, renders a compact nav header (video page style) with a back link */
  variant?: "home" | "nav";
  backHref?: string;
  backLabel?: string;
}

export function SiteHeader({
  variant = "home",
  backHref,
  backLabel = "← Schedule",
}: SiteHeaderProps) {
  if (variant === "nav") {
    // Compact header for content pages (video page)
    return (
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2.5">
        <Link
          href="/"
          className="inline-flex items-center gap-3 transition-opacity hover:opacity-75"
        >
          <Image
            src="/images/un-logo-stacked-colour-english.svg"
            alt="United Nations"
            width={402}
            height={127}
            className="h-6 w-auto shrink-0"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Web TV Transcripts
          </span>
        </Link>

        {backHref && (
          <Link
            href={backHref}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {backLabel}
          </Link>
        )}
      </header>
    );
  }

  // Home page masthead
  return (
    <header className="border-b border-border py-5">
      <div className="mx-auto flex max-w-340 items-center gap-5 px-6 sm:px-8">
        <Image
          src="/images/un-logo-stacked-colour-english.svg"
          alt="United Nations"
          width={402}
          height={127}
          className="h-10 w-auto shrink-0"
        />
        <div className="h-10 w-px shrink-0 bg-border" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-foreground">
              Web TV Transcripts
            </span>
            <span className="rounded-sm bg-un-blue/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-un-blue uppercase">
              Beta
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            AI-generated transcripts · Not an official UN service
          </p>
        </div>
      </div>
    </header>
  );
}
