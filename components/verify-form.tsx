"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";

export function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const t = useTranslations("verify");
  const locale = useLocale();

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, locale }),
        });
        const result = (await res.json()) as
          | { ok: true }
          | { ok: false; error: string };
        if (result.ok) {
          router.replace("/");
        } else {
          setError(result.error);
        }
      } catch {
        setError(t("errorInvalidLink"));
      }
    })();
  }, [token, router, locale, t]);

  const message = token ? error : t("missingToken");

  if (message) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-center"
      >
        <p className="text-sm text-red-700">{message}</p>
        <Link
          href="/login"
          className="mt-3 inline-block text-sm font-medium text-un-blue-text hover:underline"
        >
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="text-center text-muted-foreground"
    >
      {t("signingIn")}
    </p>
  );
}
