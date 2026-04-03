import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border py-3">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-4 transition-opacity hover:opacity-75"
        >
          <Image
            src="/images/un-logo-stacked-colour-english.svg"
            alt="United Nations"
            width={402}
            height={127}
            className="h-8 w-auto shrink-0"
          />
          <div className="h-8 w-px shrink-0 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-foreground">
              Web TV Transcripts
            </span>
            <span className="rounded-sm bg-un-blue/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-un-blue uppercase">
              Beta
            </span>
          </div>
        </Link>
      </div>
    </header>
  );
}
