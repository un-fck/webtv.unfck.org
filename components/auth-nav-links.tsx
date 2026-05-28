"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const linkClass = cn(
  typography.meta,
  "transition-colors hover:text-foreground",
);

// Top-level header links shown only to signed-in users. The Speakers link is
// further gated on experimental access so users without it don't see a link
// they can't use.
export function AuthNavLinks() {
  const { email, experimentalAccess, loaded } = useAuth();

  if (!loaded || !email) return null;

  return (
    <>
      {experimentalAccess && (
        <Link href="/speakers" className={linkClass}>
          Speakers
        </Link>
      )}
      <Link href="/subscriptions" className={linkClass}>
        Subscriptions
      </Link>
    </>
  );
}
