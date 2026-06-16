import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SpeakerProfile } from "@/components/speaker-profile";
import { getCurrentUser } from "@/lib/auth/service";
import {
  getEntityProfileBySlug,
  refsToBubbles,
  SPEAKER_PAGE_SIZE,
} from "@/lib/speaker-index";
import { typography } from "@/lib/typography";
import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Login-gated, intentionally not indexed. Mirrors the speaker overview
// (/speakers) — the directory is private and shouldn't surface in search
// engines.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function SpeakerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; path: string[] }>;
}) {
  const user = await getCurrentUser();
  const t = await getTranslations("speakers");

  const { locale, path } = await params;
  const entitySlug = path[0] ?? "";
  const personSlug = path.length > 1 ? path[1] : undefined;

  if (!user) {
    return (
      <main id="main" tabIndex={-1} className="min-h-screen bg-background">
        <SiteHeader />
        <div className={cn("mx-auto px-4 pb-12 sm:px-8", pageWidth)}>
          <p className={cn(typography.body, "py-8 text-muted-foreground")}>
            {t.rich("signInPrompt", {
              signInLink: (chunks) => (
                <Link
                  href="/login"
                  className="text-un-blue-text hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </main>
    );
  }

  if (!user.experimentalAccess) {
    return (
      <main id="main" tabIndex={-1} className="min-h-screen bg-background">
        <SiteHeader />
        <div className={cn("mx-auto px-4 pb-12 sm:px-8", pageWidth)}>
          <p className={cn(typography.body, "py-8 text-muted-foreground")}>
            {t.rich("experimentalGated", {
              aboutLink: (chunks) => (
                <Link
                  href="/about"
                  className="text-un-blue-text hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </main>
    );
  }

  const profile = await getEntityProfileBySlug(
    entitySlug,
    personSlug ?? null,
    locale,
  );
  if (!profile) notFound();

  const total = profile.refs.length;
  const meetingCount = new Set(profile.refs.map((r) => r.transcriptId)).size;

  // Only build the first page; the rest is loaded via the infinite-scroll API.
  const firstPage = profile.refs.slice(0, SPEAKER_PAGE_SIZE);
  const initialBubbles = await refsToBubbles(firstPage, locale);

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <SiteHeader />
      <div className={cn("mx-auto px-4 pb-12 sm:px-8", pageWidth)}>
        <nav className="py-3">
          <Link
            href="/speakers"
            className={cn(
              typography.caption,
              "transition-colors hover:text-foreground",
            )}
          >
            {t("backToAllSpeakers")}
          </Link>
        </nav>
        <SpeakerProfile
          entitySlug={profile.slug}
          personSlug={personSlug ?? null}
          label={profile.label}
          kind={profile.kind}
          personName={profile.personName}
          entityHref={`/speakers/${profile.slug}`}
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
