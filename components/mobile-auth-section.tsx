"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/hooks/use-auth";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/typography";

const linkClass = cn(
  typography.meta,
  "transition-colors hover:text-foreground",
);

// Auth controls rendered inside the mobile hamburger menu. Replaces the inline
// AuthControl on small viewports where horizontal space is at a premium.
export function MobileAuthSection() {
  const { email, loaded } = useAuth();
  const t = useTranslations("header");

  if (!loaded) return null;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  if (!email) {
    return (
      <div className="border-t border-border pt-3">
        <Link href="/login" className={linkClass}>
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div>
        <p className="text-xs text-muted-foreground">{t("signedInAs")}</p>
        <p className="truncate text-sm font-medium" title={email}>
          {email}
        </p>
      </div>
      <button
        onClick={handleLogout}
        className={cn(linkClass, "flex items-center gap-2 text-left")}
      >
        <LogOut className="h-4 w-4 text-muted-foreground" />
        {t("signOut")}
      </button>
    </div>
  );
}
