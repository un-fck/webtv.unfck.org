"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { typography } from "@/lib/typography";

export default function MeetingError({
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
      <h1 className={typography.cardTitle}>Could not load this meeting</h1>
      <p className="text-muted-foreground">
        The meeting metadata could not be fetched. This is usually temporary.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => unstable_retry()}
          className="rounded-md bg-un-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Back to schedule
        </Link>
      </div>
    </main>
  );
}
