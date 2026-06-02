"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { verifyMagicToken } from "@/lib/auth/commands";

export function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    verifyMagicToken(token).then((result) => {
      if (result.success) {
        router.replace("/");
      } else {
        setError(result.error);
      }
    });
  }, [token, router]);

  const message = token ? error : "Missing sign-in token.";

  if (message) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-700">{message}</p>
        <Link
          href="/login"
          className="mt-3 inline-block text-sm font-medium text-un-blue hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return <p className="text-center text-muted-foreground">Signing you in…</p>;
}
