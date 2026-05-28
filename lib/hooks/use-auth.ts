"use client";

import { useEffect, useState } from "react";

interface AuthState {
  email: string | null;
  /** Single gate for all experimental features. False until the fetch resolves. */
  experimentalAccess: boolean;
  loaded: boolean;
}

// Lightweight session check shared across header components so we don't fetch
// /api/auth/me more than once per page.
export function useAuth(): AuthState {
  const [email, setEmail] = useState<string | null>(null);
  const [experimentalAccess, setExperimentalAccess] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setEmail(data?.user?.email ?? null);
        setExperimentalAccess(Boolean(data?.user?.experimentalAccess));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return { email, experimentalAccess, loaded };
}
