import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SpeakerOverview } from "@/components/speaker-overview";
import { getCurrentUser } from "@/lib/auth/service";
import { getEntitySummaries } from "@/lib/speaker-index";
import { typography } from "@/lib/typography";
import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Speakers — UN Web TV Transcripts",
  description:
    "Browse everyone who has spoken across transcribed UN meetings, by country, group, and organ.",
};

export default async function SpeakersPage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className={cn("mx-auto px-6 pb-12 sm:px-8", pageWidth)}>
        <nav className="py-3">
          <a
            href="/"
            className={cn(
              typography.caption,
              "transition-colors hover:text-foreground",
            )}
          >
            ← Back to homepage
          </a>
        </nav>
        <div className="mb-10 max-w-2xl">
          <h1 className={cn(typography.pageTitle, "mb-3")}>Speakers</h1>
          <p className={typography.lead}>
            Everyone who has spoken across transcribed meetings, grouped by
            country, negotiating group, and UN organ. Experimental — speaker
            names are AI-extracted and not de-duplicated, so a person may appear
            under several name variants.
          </p>
        </div>

        {user ? (
          <SpeakerOverview entities={await getEntitySummaries()} />
        ) : (
          <p className={cn(typography.body, "text-muted-foreground")}>
            Please{" "}
            <Link href="/login" className="text-un-blue hover:underline">
              sign in
            </Link>{" "}
            to browse speakers.
          </p>
        )}
      </div>
    </main>
  );
}
