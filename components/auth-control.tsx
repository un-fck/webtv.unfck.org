"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, LogOut, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// "david.pomerenke@un.org" → "DP"
function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? [parts[0], parts[1]] : [local]).map(
    (p) => p[0],
  );
  return letters.join("").slice(0, 2).toUpperCase();
}

export function AuthControl() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEmail(data?.user?.email ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setEmail(null);
    setOpen(false);
    router.refresh();
  }

  // Avoid a flash of the wrong state before the session check resolves.
  if (!loaded) return null;

  if (!email) {
    return (
      <Link
        href="/login"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }

  const itemClass =
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-un-blue/10 text-xs font-semibold text-un-blue transition-colors hover:bg-un-blue/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {initialsFromEmail(email)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <div className="border-b border-border px-2 pt-1 pb-2">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="truncate text-sm font-medium" title={email}>
            {email}
          </p>
        </div>
        <div className="pt-1.5">
          <Link
            href="/speakers"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            Speakers
          </Link>
          <Link
            href="/subscriptions"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Bell className="h-4 w-4 text-muted-foreground" />
            Subscriptions
          </Link>
          <button
            onClick={handleLogout}
            className={cn(itemClass, "w-full text-left")}
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
