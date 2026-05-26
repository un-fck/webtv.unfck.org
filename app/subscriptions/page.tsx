import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SubscriptionsManager } from "@/components/subscriptions-manager";
import { getCurrentUser } from "@/lib/auth/service";
import { typography } from "@/lib/typography";
import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Subscriptions — UN Web TV Transcripts",
  description: "Manage your transcript email notifications.",
};

export default async function SubscriptionsPage() {
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
        <div className="max-w-2xl">
          <div className="mb-10">
            <h1 className={cn(typography.pageTitle, "mb-3")}>Subscriptions</h1>
            <p className={typography.lead}>
              Get an email when transcripts you care about are ready.
            </p>
          </div>

          {user ? (
            <SubscriptionsManager />
          ) : (
            <p className={cn(typography.body, "text-muted-foreground")}>
              Please{" "}
              <Link href="/login" className="text-un-blue hover:underline">
                sign in
              </Link>{" "}
              to manage your subscriptions.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
