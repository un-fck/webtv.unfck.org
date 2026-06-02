import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { VerifyForm } from "@/components/verify-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("verifyTitle") };
}

export default async function VerifyPage() {
  const t = await getTranslations("verify");
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h2 className="mb-6 text-xl font-semibold text-foreground">
            {t("heading")}
          </h2>
          <Suspense
            fallback={<p className="text-muted-foreground">{t("loading")}</p>}
          >
            <VerifyForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
