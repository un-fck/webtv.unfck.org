import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { alternatesFor } from "@/i18n/routing";
import { SiteHeader } from "@/components/site-header";
import { SpeakerOverview } from "@/components/speaker-overview";
import { getCurrentUser } from "@/lib/auth/service";
import { getEntitySummaries } from "@/lib/speaker-index";
import { typography } from "@/lib/typography";
import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("speakersTitle"),
    description: t("speakersDescription"),
    alternates: alternatesFor(locale, "/speakers"),
  };
}

export default async function SpeakersPage() {
  const user = await getCurrentUser();
  const t = await getTranslations("speakers");
  const tHome = await getTranslations("home");

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background">
      <SiteHeader />
      <div className={cn("mx-auto px-4 pb-12 sm:px-8", pageWidth)}>
        <nav className="py-3">
          <Link
            href="/"
            className={cn(
              typography.caption,
              "transition-colors hover:text-foreground",
            )}
          >
            {tHome("backToHomepage")}
          </Link>
        </nav>
        <div className="mb-10 max-w-2xl">
          <h1 className={cn(typography.pageTitle, "mb-3")}>{t("title")}</h1>
          <p className={typography.lead}>{t("lead")}</p>
        </div>

        {!user ? (
          <p className={cn(typography.body, "text-muted-foreground")}>
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
        ) : !user.experimentalAccess ? (
          <p className={cn(typography.body, "text-muted-foreground")}>
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
        ) : (
          <SpeakerOverview
            entities={await getEntitySummaries(await getLocale())}
          />
        )}
      </div>
    </main>
  );
}
