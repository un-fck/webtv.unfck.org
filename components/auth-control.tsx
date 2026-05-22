"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthControl() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden sm:inline">{email}</span>
      <button
        onClick={handleLogout}
        className="transition-colors hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
