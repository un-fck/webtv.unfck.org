import Image from "next/image";
import Link from "next/link";
import { TimezonePicker } from "@/components/timezone-picker";
import { AuthControl } from "@/components/auth-control";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

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
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none tracking-tight text-foreground">
              <span className="font-bold">WebTV</span>
              <span className="font-normal"> Transcripts</span>
            </span>
            <span className="rounded bg-un-blue/10 px-2 py-1 text-[11px] leading-none font-bold tracking-wide text-un-blue uppercase">
              Public Preview
            </span>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <TimezonePicker />
          <Link
            href="/about"
            className={cn(
              typography.meta,
              "transition-colors hover:text-foreground",
            )}
          >
            About
          </Link>
          <AuthControl />
        </div>
      </div>
    </header>
  );
}
