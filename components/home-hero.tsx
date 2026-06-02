import { Link } from "@/i18n/navigation";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

/**
 * Homepage hero / explainer. Always rendered above the schedule table so the
 * site's purpose stays visible regardless of any active search or filters.
 */
export function HomeHero() {
  return (
    <div className="max-w-2xl pt-4 pb-8">
      <span className="mb-3 inline-block rounded bg-un-blue/10 px-2 py-1 text-[11px] leading-none font-bold tracking-wide text-un-blue uppercase">
        Public Preview
      </span>
      <h1 className={cn(typography.pageTitle, "mb-3")}>
        Read what was said at the UN.
      </h1>
      <p className={cn(typography.lead, "text-balance")}>
        Catch up on UN debates in minutes. Skim transcripts, search by speaker,
        jump to the moment in the recording.
      </p>
      <p className={cn(typography.meta, "mt-3")}>
        Automatically generated from UN Web TV recordings, not official UN
        records.
      </p>
      <p className={cn(typography.meta, "mt-1")}>
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
