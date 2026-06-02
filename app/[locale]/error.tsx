"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { typography } from "@/lib/typography";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className={typography.cardTitle}>Something went wrong</h1>
      <p className="text-muted-foreground">
        The schedule could not be loaded. This is usually temporary — please try
        again.
      </p>
      <button
        onClick={() => unstable_retry()}
        className="rounded-md bg-un-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
