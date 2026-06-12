"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { typography } from "@/lib/typography";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("error");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-6"
    >
      <h1 className={typography.cardTitle}>{t("title")}</h1>
      <p className="text-muted-foreground">{t("scheduleHint")}</p>
      <button
        onClick={() => unstable_retry()}
        className="rounded-md bg-un-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        {t("tryAgain")}
      </button>
    </main>
  );
}
