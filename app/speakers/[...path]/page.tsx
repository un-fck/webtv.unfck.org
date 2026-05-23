import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SpeakerProfile } from "@/components/speaker-profile";
import { getCurrentUser } from "@/lib/auth/service";
import {
  decodeEntityKey,
  getEntityProfile,
  refsToBubbles,
  SPEAKER_PAGE_SIZE,
} from "@/lib/speaker-index";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SpeakerProfilePage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const user = await getCurrentUser();

  const { path } = await params;
  const key = decodeEntityKey(path[0] ?? "");
  const personName = path.length > 1 ? decodeURIComponent(path[1]) : undefined;

  if (!user) {
    return (
      <main className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-6 pb-12 sm:px-8">
          <p className={cn(typography.body, "py-8 text-muted-foreground")}>
            Please{" "}
            <Link href="/login" className="text-un-blue hover:underline">
              sign in
            </Link>{" "}
            to browse speakers.
          </p>
        </div>
      </main>
    );
  }

  const profile = await getEntityProfile(key, personName ?? null);
  if (!profile) notFound();

  const total = profile.refs.length;
  const meetingCount = new Set(profile.refs.map((r) => r.transcriptId)).size;

  // Only build the first page; the rest is loaded via the infinite-scroll API.
  const firstPage = profile.refs.slice(0, SPEAKER_PAGE_SIZE);
  const initialBubbles = await refsToBubbles(firstPage);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 pb-12 sm:px-8">
        <nav className="py-3">
          <Link
            href="/speakers"
            className={cn(
              typography.caption,
              "transition-colors hover:text-foreground",
            )}
          >
            ← All speakers
          </Link>
        </nav>
        <SpeakerProfile
          entityKey={profile.key}
          label={profile.label}
          kind={profile.kind}
          personName={profile.personName}
          entityHref={`/speakers/${path[0]}`}
          people={profile.people}
          totalStatements={total}
          meetingCount={meetingCount}
          initialBubbles={initialBubbles}
          initialNextOffset={firstPage.length}
          initialHasMore={firstPage.length < total}
        />
      </div>
    </main>
  );
}
