import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { VerifyForm } from "@/components/verify-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Signing in — UN Web TV Transcripts",
};

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h2 className="mb-6 text-xl font-semibold text-foreground">
            Complete sign-in
          </h2>
          <Suspense
            fallback={<p className="text-muted-foreground">Loading…</p>}
          >
            <VerifyForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
