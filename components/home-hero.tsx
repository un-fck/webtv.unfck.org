import Link from "next/link";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

/**
 * Homepage hero / explainer. Always rendered above the schedule table so the
 * site's purpose stays visible regardless of any active search or filters.
 */
export function HomeHero() {
  return (
    <div className="max-w-2xl py-8">
      <h1 className={cn(typography.pageTitle, "mb-3")}>
        Read what was said at the UN.
      </h1>
      <p className={typography.lead}>
        Searchable, speaker-attributed transcripts of United Nations meetings —
        Security Council, General Assembly, Human Rights Council and more —
        generated from UN Web TV recordings.
      </p>
      <p className={cn(typography.meta, "mt-3")}>
        Public Preview · Automatically generated transcripts, not official UN records ·{" "}
        <Link
          href="/about"
          className="text-un-blue underline underline-offset-4 hover:opacity-75"
        >
          Learn more →
        </Link>
      </p>
    </div>
  );
}
