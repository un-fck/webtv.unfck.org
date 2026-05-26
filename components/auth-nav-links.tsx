"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const linkClass = cn(typography.meta, "transition-colors hover:text-foreground");

// Top-level header links shown only to signed-in users.
export function AuthNavLinks() {
  const { email, loaded } = useAuth();

  if (!loaded || !email) return null;

  return (
    <>
      <Link href="/speakers" className={linkClass}>
        Speakers
      </Link>
      <Link href="/subscriptions" className={linkClass}>
        Subscriptions
      </Link>
    </>
  );
}
