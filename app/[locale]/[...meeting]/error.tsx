"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { typography } from "@/lib/typography";

export default function MeetingError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("error");
  const tHome = useTranslations("home");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-6"
    >
      <h1 className={typography.cardTitle}>{t("meetingNotFound")}</h1>
      <p className="text-muted-foreground">{t("meetingNotFoundHint")}</p>
      <div className="flex gap-3">
        <button
          onClick={() => unstable_retry()}
          className="rounded-md bg-un-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {t("tryAgain")}
        </button>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {tHome("backToHomepage")}
        </Link>
      </div>
    </main>
  );
}
